from fastapi import APIRouter, Response

from app.schemas.projects import CATEGORY_NAMES, CategoryRead

router = APIRouter()

# Список змінюється лише з деплоєм, тож браузер і проксі можуть його кешувати
CACHE_CONTROL = "public, max-age=3600"


@router.get("")
async def list_categories(response: Response) -> list[CategoryRead]:
    """Сфери проєктів для фільтра каталогу й форми створення проєкту."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    return [CategoryRead(key=key, name=name) for key, name in CATEGORY_NAMES.items()]
