import enum
from decimal import Decimal


# Рівні досвіду волонтера за сумою підтверджених годин (R-27, від нижчого до вищого).
# Спільні для мінімальних вимог проєкту й рівня в профілі, тому окремо від обох моделей
class ExperienceLevelEnum(enum.StrEnum):
    novice = enum.auto()
    interested = enum.auto()
    amateur = enum.auto()
    experienced = enum.auto()
    pro = enum.auto()


# Верхні межі рівнів у підтверджених годинах, включно (R-27): 50 годин — ще novice,
# 50.5 — уже interested. Усе понад останню межу — pro
LEVEL_UPPER_BOUNDS: tuple[tuple[Decimal, ExperienceLevelEnum], ...] = (
    (Decimal(50), ExperienceLevelEnum.novice),
    (Decimal(150), ExperienceLevelEnum.interested),
    (Decimal(300), ExperienceLevelEnum.amateur),
    (Decimal(500), ExperienceLevelEnum.experienced),
)

_LEVEL_ORDER = list(ExperienceLevelEnum)


def level_for_hours(hours: Decimal) -> ExperienceLevelEnum:
    """Рівень досвіду за сумою підтверджених годин."""
    for upper_bound, level in LEVEL_UPPER_BOUNDS:
        if hours <= upper_bound:
            return level
    return ExperienceLevelEnum.pro


def meets_level(actual: ExperienceLevelEnum, required: ExperienceLevelEnum) -> bool:
    """Чи досягає рівень волонтера мінімального рівня, який вимагає проєкт."""
    return _LEVEL_ORDER.index(actual) >= _LEVEL_ORDER.index(required)
