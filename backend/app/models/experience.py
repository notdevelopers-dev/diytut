import enum


# Рівні досвіду волонтера за сумою підтверджених годин (R-27, від нижчого до вищого).
# Спільні для мінімальних вимог проєкту й рівня в профілі, тому окремо від обох моделей
class ExperienceLevelEnum(enum.StrEnum):
    novice = enum.auto()
    interested = enum.auto()
    amateur = enum.auto()
    experienced = enum.auto()
    pro = enum.auto()
