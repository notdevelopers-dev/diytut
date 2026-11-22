"""Завантажені зображення: перевірка, перекодування й збереження в media_root (R-13).

Файли роздає nginx за адресою media_url, а не застосунок. Кожне зображення перекодовується
у WebP: зменшується до MAX_IMAGE_SIDE і втрачає метадані, зокрема EXIF з GPS-координатами,
які додає камера телефона (NF-04). Ім'я файлу випадкове, а заміна фото створює новий файл,
тож nginx і Cloudflare можуть кешувати файли назавжди.
"""

import asyncio
import logging
import os
import uuid
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from fastapi import UploadFile
from PIL import Image, ImageOps

from app import errors
from app.config import settings

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
# Фото з камери на 50 Мп ще проходить. Декодування більших займає сотні мегабайтів пам'яті,
# а маленький PNG може розпакуватися в гігабайти
MAX_IMAGE_PIXELS = 60_000_000
# Довша сторона збереженого зображення: досить для обкладинки на всю ширину десктопа
MAX_IMAGE_SIDE = 1600
WEBP_QUALITY = 80
# Формат Pillow визначає за вмістом файлу, а Content-Type і розширення від клієнта не
# враховуються. SVG серед них немає: він може містити скрипт, що виконався б на нашому домені
ALLOWED_FORMATS = ("JPEG", "PNG", "WEBP")

# Обробка одного зображення займає до сотень мегабайтів пам'яті й до секунди процесора,
# тож одночасно обробляються лише два
_processing = asyncio.Semaphore(2)


def public_url(key: str) -> str:
    """Адреса, за якою nginx роздає збережений файл."""
    return f"{settings.media_url}/{key}"


async def prepare_image(upload: UploadFile) -> bytes:
    """Перевіряє завантажене зображення й повертає його у WebP.

    Файл понад MAX_UPLOAD_BYTES чи зображення понад MAX_IMAGE_PIXELS — 413; не JPEG, PNG
    чи WebP або пошкоджений файл — 415.
    """
    async with _processing:
        # Pillow блокує потік, тож працює поза event loop
        return await asyncio.to_thread(_encode_webp, upload.file)


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


def _encode_webp(source: BinaryIO) -> bytes:
    # Starlette уже зберіг завантаження в тимчасовий файл, тож розмір відомий без читання
    source.seek(0, os.SEEK_END)
    if source.tell() > MAX_UPLOAD_BYTES:
        raise errors.file_too_large(MAX_UPLOAD_BYTES)
    source.seek(0)
    try:
        with Image.open(source, formats=ALLOWED_FORMATS) as image:
            # Розміри відомі з заголовка ще до декодування пікселів
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise errors.image_too_large(MAX_IMAGE_PIXELS)
            return _to_webp(image)
    except Image.DecompressionBombError:
        # Pillow сам відмовляється відкривати зображення понад ~179 Мп
        raise errors.image_too_large(MAX_IMAGE_PIXELS) from None
    except OSError, SyntaxError, ValueError, EOFError:
        # Не зображення, непідтримуваний формат або пошкоджений файл
        raise errors.unsupported_image() from None


def _to_webp(image: Image.Image) -> bytes:
    # JPEG декодується одразу зменшеним у 2–8 разів, але не дрібніше за подвійний розмір
    # результату: менше пам'яті й часу без втрати якості
    image.draft(None, (MAX_IMAGE_SIDE * 2, MAX_IMAGE_SIDE * 2))
    # Колірний профіль (наприклад, Display P3 з iPhone) лишаємо, якщо колірна модель
    # не зміниться; профіль CMYK чи відтінків сірого до RGB не підходить
    icc_profile = image.info.get("icc_profile") if image.mode in ("RGB", "RGBA") else None
    # Камера телефона часто зберігає фото «боком» з позначкою повороту в EXIF. Метадані не
    # зберігаються, тож поворот застосовується до самих пікселів
    image = ImageOps.exif_transpose(image)
    has_alpha = image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info
    image = image.convert("RGBA" if has_alpha else "RGB")
    image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)

    output = BytesIO()
    # exif і xmp порожні явно: exif_transpose лишає в info решту EXIF, зокрема GPS
    image.save(output, "WEBP", quality=WEBP_QUALITY, icc_profile=icc_profile, exif=b"", xmp=b"")
    return output.getvalue()


def _write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Спершу тимчасовий файл, потім перейменування: недописаного файлу за адресою не буде
    temporary = path.with_name(f"{path.name}.tmp")
    temporary.write_bytes(data)
    # nginx працює від іншого користувача, тож файл має бути доступним для читання всім
    temporary.chmod(0o644)
    temporary.replace(path)
