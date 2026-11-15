import pytest
from pydantic import ValidationError

from app.schemas.projects import ProjectCreate, normalize_tag

BASE = {
    "title": "Толока",
    "description": "Прибирання",
    "starts_at": "2030-01-01T10:00:00Z",
    "ends_at": "2030-01-01T12:00:00Z",
    "is_online": True,
    "capacity": 5,
    "volunteer_hours": "2",
    "categories": ["ecology"],
}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("толока", "толока"),
        ("#Толока", "толока"),
        ("  ##ТОЛОКА  ", "толока"),
        ("# толока", "толока"),
        ("Великий   день", "великий_день"),
        ("пам'ять", "памʼять"),
        ("пам’ять", "памʼять"),
        ("пам`ять", "памʼять"),
        ("НМТ-2026", "нмт-2026"),
        ("Volunteer", "volunteer"),
        ("   ", ""),
        ("#", ""),
    ],
)
def test_normalize_tag(raw: str, expected: str) -> None:
    assert normalize_tag(raw) == expected


@pytest.mark.parametrize(
    "tag", ["толока", "великий_день", "нмт-2026", "памʼять", "2026", "a", "т" * 30]
)
def test_valid_tags_are_accepted(tag: str) -> None:
    assert ProjectCreate(**BASE, tags=[tag]).tags == [tag]


@pytest.mark.parametrize(
    "tag",
    ["", "#", "тег!", "a/b", "_тег", "тег_", "-тег", "ʼтег", "тег__день", "😀", "т" * 31],
)
def test_invalid_tags_are_rejected(tag: str) -> None:
    with pytest.raises(ValidationError):
        ProjectCreate(**BASE, tags=[tag])


def test_duplicate_tags_after_normalization_count_once() -> None:
    tags = ["толока", "#Толока", "ТОЛОКА", "a", "b", "c", "d"]
    assert ProjectCreate(**BASE, tags=tags).tags == ["толока", "a", "b", "c", "d"]


def test_more_than_five_unique_tags_rejected() -> None:
    with pytest.raises(ValidationError):
        ProjectCreate(**BASE, tags=["a", "b", "c", "d", "e", "f"])


def test_duplicate_categories_count_once() -> None:
    data = ProjectCreate(**BASE | {"categories": ["idp", "idp", "education"]})
    assert data.categories == ["idp", "education"]
