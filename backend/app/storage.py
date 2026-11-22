"""Завантажені зображення: перевірка, перекодування й збереження в media_root (R-13).

Файли роздає nginx за адресою media_url, а не застосунок. Кожне зображення перекодовується
у WebP: зменшується до MAX_IMAGE_SIDE і втрачає метадані, зокрема EXIF з GPS-координатами,
які додає камера телефона (NF-04). Ім'я файлу випадкове, а заміна фото створює новий файл,
тож nginx і Cloudflare можуть кешувати файли назавжди.

Модуль не знає про HTTP і про те, чиє це фото: про відмову він повідомляє власними винятками,
а сервіс перетворює їх на відповіді API. Тож його можна використати й для аватарок (R-29).
"""

import asyncio
import logging
import os
import shutil
import uuid
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from PIL import ExifTags, Image, ImageOps

from app.config import settings

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
# Фото з камери на 50 Мп ще проходить. Декодування більших займає сотні мегабайтів пам'яті,
# а маленький PNG може розпакуватися в гігабайти
MAX_IMAGE_PIXELS = 60_000_000
# Найменше фото для обкладинки: картка в каталозі має пропорції ~2:1, і менше зображення
# виглядало б на ній розмитим. Розміри — як фото показуватиметься, тобто з урахуванням повороту
MIN_IMAGE_WIDTH = 800
MIN_IMAGE_HEIGHT = 400
# Довша сторона збереженого зображення: досить для обкладинки на всю ширину десктопа
MAX_IMAGE_SIDE = 1600
WEBP_QUALITY = 80
# Формат Pillow визначає за вмістом файлу, а Content-Type і розширення від клієнта не
# враховуються. SVG серед них немає: він може містити скрипт, що виконався б на нашому домені
ALLOWED_FORMATS = ("JPEG", "PNG", "WEBP")
# Режими, які Pillow зменшує зі згладжуванням без попереднього перетворення
_RESIZABLE_MODES = ("L", "LA", "RGB", "RGBA", "CMYK")
# Скільки місця має лишатися вільним на диску з media_root. На тому ж диску лежать БД і логи:
# переповнений диск зупинив би весь сайт, а так перестають прийматися лише нові фото.
# Збережене фото займає до ~4 МБ (зазвичай 150–400 КБ), тож запас вимірюється тисячами фото
MIN_FREE_DISK_BYTES = 5 * 1024**3

# Обробка одного зображення займає до пів гігабайта пам'яті (PNG на 60 Мп з прозорістю;
# фото з камери — десятки мегабайтів) і до півтори секунди процесора. Фото завантажують
# лише адміни організацій і нечасто, тож зображення обробляються по одному: решта чекає
# в черзі, а пам'ять не зростає з кількістю запитів
_processing = asyncio.Semaphore(1)


class ImageRejected(Exception):
    """Завантажений файл не можна прийняти як зображення."""


class FileTooLarge(ImageRejected):
    """Файл більший за MAX_UPLOAD_BYTES."""


class ImageTooLarge(ImageRejected):
    """Зображення більше за MAX_IMAGE_PIXELS."""


class ImageTooSmall(ImageRejected):
    """Зображення менше за MIN_IMAGE_WIDTH × MIN_IMAGE_HEIGHT з урахуванням повороту."""


class UnsupportedImage(ImageRejected):
    """Не JPEG, PNG чи WebP або пошкоджений файл."""


class StorageFull(Exception):
    """На диску з media_root лишилося менше MIN_FREE_DISK_BYTES."""


def public_url(key: str) -> str:
    """Адреса, за якою nginx роздає збережений файл."""
    return f"{settings.media_url}/{key}"


async def prepare_image(source: BinaryIO) -> bytes:
    """Перевіряє завантажене зображення й повертає його у WebP.

    Відмову повідомляє винятком ImageRejected (з підкласами) чи StorageFull.
    """
    # До обробки: фото, яке нема де зберегти, немає сенсу й обробляти
    await asyncio.to_thread(_check_free_space)
    async with _processing:
        # Pillow блокує потік, тож працює поза event loop
        return await asyncio.to_thread(_encode_webp, source)


async def save_image(data: bytes, folder: str) -> str:
    """Зберігає WebP під випадковим ім'ям у теці folder і повертає ключ для БД."""
    key = f"{folder}/{uuid.uuid4().hex}.webp"
    await asyncio.to_thread(_write, settings.media_root / key, data)
    return key


async def delete(key: str) -> None:
    """Видаляє збережений файл. Помилку лише записує в лог: зміна в БД на той час уже збережена,
    а зайвий файл нікому не заважає."""
    try:
        await asyncio.to_thread((settings.media_root / key).unlink, missing_ok=True)
    except OSError:
        logger.exception("Failed to delete media file %s", key)


def _check_free_space() -> None:
    free = shutil.disk_usage(settings.media_root).free
    if free < MIN_FREE_DISK_BYTES:
        # Адміністратор сервера побачить попередження в логах api
        logger.warning("Media storage is almost full: %.1f GB free", free / 1024**3)
        raise StorageFull


def _encode_webp(source: BinaryIO) -> bytes:
    # Starlette уже зберіг завантаження в тимчасовий файл, тож розмір відомий без читання
    source.seek(0, os.SEEK_END)
    if source.tell() > MAX_UPLOAD_BYTES:
        raise FileTooLarge
    source.seek(0)
    try:
        with Image.open(source, formats=ALLOWED_FORMATS) as image:
            # Розміри відомі з заголовка ще до декодування пікселів
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ImageTooLarge
            width, height = _displayed_size(image)
            if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
                raise ImageTooSmall
            return _to_webp(image)
    except Image.DecompressionBombError:
        # Pillow сам відмовляється відкривати зображення понад ~179 Мп
        raise ImageTooLarge from None
    except OSError, SyntaxError, ValueError, EOFError:
        # Не зображення, непідтримуваний формат або пошкоджений файл
        raise UnsupportedImage from None


# Значення повороту в EXIF, за яких фото показується «боком»: ширина й висота міняються місцями
_SIDEWAYS_ORIENTATIONS = frozenset({5, 6, 7, 8})


def _displayed_size(image: Image.Image) -> tuple[int, int]:
    """Розміри фото з урахуванням позначки повороту в EXIF, ще до декодування пікселів."""
    orientation = image.getexif().get(ExifTags.Base.Orientation, 1)
    if orientation in _SIDEWAYS_ORIENTATIONS:
        return image.height, image.width
    return image.size


def _to_webp(image: Image.Image) -> bytes:
    # Колірний профіль (наприклад, Display P3 з iPhone) лишаємо, якщо колірна модель
    # не зміниться; профіль CMYK чи відтінків сірого до RGB не підходить
    icc_profile = image.info.get("icc_profile") if image.mode in ("RGB", "RGBA") else None
    has_alpha = image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info
    target_mode = "RGBA" if has_alpha else "RGB"

    # Кожна копія великого зображення займає сотні мегабайтів, тож спершу воно зменшується,
    # а решта перетворень працює вже з невеликим.
    # JPEG декодується одразу зменшеним у 2–8 разів, але не дрібніше за подвійний розмір
    # результату. Розмір запитується в пропорціях фото: draft зменшує, лише якщо обидві
    # сторони лишаються не меншими за запитані (thumbnail запитує квадрат, і для фото 4:3
    # це не спрацьовує)
    scale = 2 * MAX_IMAGE_SIDE / max(image.size)
    if scale < 1:
        image.draft(None, (round(image.width * scale), round(image.height * scale)))
    # Палітру Pillow зменшує лише «найближчим сусідом», без згладжування, а прозорий колір
    # після згладжування вже не збігся б із заданим. Такі зображення, як і рідкісні режими
    # на кшталт 16-бітного, переводяться в RGB(A) до зменшення
    if image.mode not in _RESIZABLE_MODES or "transparency" in image.info:
        image = image.convert(target_mode)
    image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
    if image.mode != target_mode:
        image = image.convert(target_mode)
    # Камера телефона часто зберігає фото «боком» з позначкою повороту в EXIF. Метадані не
    # зберігаються, тож поворот застосовується до самих пікселів
    ImageOps.exif_transpose(image, in_place=True)

    output = BytesIO()
    # exif і xmp порожні явно: exif_transpose лишає в info решту EXIF, зокрема GPS
    image.save(output, "WEBP", quality=WEBP_QUALITY, icc_profile=icc_profile, exif=b"", xmp=b"")
    return output.getvalue()


def _write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Спершу тимчасовий файл, потім перейменування: недописаного файлу за адресою не буде
    temporary = path.with_name(f"{path.name}.tmp")
    try:
        temporary.write_bytes(data)
        # nginx працює від іншого користувача, тож файл має бути доступним для читання всім
        temporary.chmod(0o644)
        temporary.replace(path)
    except OSError:
        # Недописаний файл (наприклад, коли скінчилося місце) не має лишатися на диску
        temporary.unlink(missing_ok=True)
        raise
