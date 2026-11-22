"""Обкладинка проєкту: завантаження, заміна, видалення й cover_url у відповідях (R-13)."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import auth, storage
from app.models import (
    City,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)

pytestmark = pytest.mark.usefixtures("media_root")

STARTS_AT = datetime.now(UTC).replace(microsecond=0) + timedelta(days=30)

# Теги EXIF: поворот і блок GPS-координат
EXIF_ORIENTATION = 0x0112
EXIF_GPS_INFO = 0x8825
# Значення повороту: фото збережене «боком», показувати повернутим на 90° за годинниковою
ROTATE_90_CW = 6


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


@pytest.fixture
def city_id(db) -> int:
    async def create(session) -> int:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()
        return city.id

    return db(create)


@pytest.fixture
def make_user(db, city_id: int):
    counter = iter(range(1, 1000))

    def make() -> int:
        n = next(counter)

        async def create(session) -> int:
            user = User(
                google_sub=f"google-{n}",
                email=f"user{n}@example.com",
                first_name="Тарас",
                last_name="Шевченко",
                nickname=f"user_{n}",
                phone="+380671234567",
                birth_date=date(1990, 3, 9),
                city_id=city_id,
            )
            session.add(user)
            await session.flush()
            return user.id

        return db(create)

    return make


@pytest.fixture
def make_org(db, city_id: int):
    def make(
        members: dict[int, OrgMemberRoleEnum], status: OrgStatusEnum = OrgStatusEnum.approved
    ) -> int:
        async def create(session) -> int:
            org = Organization(
                name="Благодійний фонд",
                email="fund@example.com",
                phone="+380679998877",
                city_id=city_id,
                status=status,
                created_by=next(iter(members)),
            )
            for user_id, role in members.items():
                org.members.append(OrganizationMember(user_id=user_id, role=role))
            session.add(org)
            await session.flush()
            return org.id

        return db(create)

    return make


@pytest.fixture
def org(make_user, make_org) -> dict[str, int]:
    """Схвалена організація з власником, адміном і звичайним учасником та сторонній користувач."""
    ids = {
        "owner": make_user(),
        "admin": make_user(),
        "member": make_user(),
        "outsider": make_user(),
    }
    ids["org"] = make_org(
        {
            ids["owner"]: OrgMemberRoleEnum.owner,
            ids["admin"]: OrgMemberRoleEnum.admin,
            ids["member"]: OrgMemberRoleEnum.member,
        }
    )
    return ids


@pytest.fixture
def make_project(db):
    def make(organization_id: int, **changes) -> int:
        fields = {"title": "Прибирання парку", "status": ProjectStatusEnum.draft, "categories": []}
        if changes.get("status", ProjectStatusEnum.draft) != ProjectStatusEnum.draft:
            fields |= {
                "description": "Опис",
                "starts_at": STARTS_AT,
                "ends_at": STARTS_AT + timedelta(hours=3),
                "is_online": True,
                "capacity": 10,
                "volunteer_hours": Decimal("2"),
                "categories": ["ecology"],
                "published_at": datetime.now(UTC) - timedelta(days=1),
            }
        fields |= changes

        async def create(session) -> int:
            project = Project(organization_id=organization_id, **fields)
            session.add(project)
            await session.flush()
            return project.id

        return db(create)

    return make


def load_project(db, project_id: int) -> Project:
    async def load(session) -> Project:
        return await session.get(Project, project_id, populate_existing=True)

    return db(load)


def set_org_status(db, organization_id: int, status: OrgStatusEnum) -> None:
    async def update(session) -> None:
        organization = await session.get(Organization, organization_id)
        organization.status = status

    db(update)


def make_image(
    image_format: str = "JPEG", size: tuple[int, int] = (2000, 1500), mode: str = "RGB", **options
) -> bytes:
    buffer = BytesIO()
    Image.new(mode, size).save(buffer, image_format, **options)
    return buffer.getvalue()


def upload(
    client: TestClient,
    project_id: int,
    data: bytes,
    filename: str = "photo.jpg",
    content_type: str = "image/jpeg",
):
    return client.post(
        f"/api/projects/{project_id}/photo", files={"file": (filename, data, content_type)}
    )


def stored_files(media_root: Path) -> list[str]:
    return sorted(path.relative_to(media_root).as_posix() for path in media_root.rglob("*"))


def stored_file_path(media_root: Path, cover_url: str) -> Path:
    prefix = "/media/"
    assert cover_url.startswith(prefix)
    return media_root / cover_url.removeprefix(prefix)


# =====================================================================
# POST /api/projects/{id}/photo
# =====================================================================


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_editor_uploads_cover(
    client: TestClient, db, org, make_project, media_root: Path, role: str
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org[role])

    response = upload(client, project_id, make_image())

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == project_id
    assert body["cover_url"].startswith("/media/projects/")
    assert body["cover_url"].endswith(".webp")
    assert "cover_key" not in body
    path = stored_file_path(media_root, body["cover_url"])
    assert stored_files(media_root) == ["projects", path.relative_to(media_root).as_posix()]
    # nginx працює від іншого користувача й має прочитати файл
    assert path.stat().st_mode & 0o777 == 0o644
    assert load_project(db, project_id).cover_key == path.relative_to(media_root).as_posix()


@pytest.mark.parametrize(
    ("image_format", "filename", "content_type"),
    [
        ("JPEG", "photo.jpg", "image/jpeg"),
        ("PNG", "photo.png", "image/png"),
        ("WEBP", "photo.webp", "image/webp"),
    ],
)
def test_cover_is_reencoded_to_webp_and_downscaled(
    client: TestClient,
    org,
    make_project,
    media_root: Path,
    image_format: str,
    filename: str,
    content_type: str,
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = upload(client, project_id, make_image(image_format), filename, content_type)

    assert response.status_code == 200, response.text
    with Image.open(stored_file_path(media_root, response.json()["cover_url"])) as stored:
        assert stored.format == "WEBP"
        # Довша сторона — 1600 px, пропорції збережено
        assert stored.size == (1600, 1200)


def test_small_cover_is_not_upscaled(
    client: TestClient, org, make_project, media_root: Path
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = upload(client, project_id, make_image(size=(800, 600)))

    assert response.status_code == 200, response.text
    with Image.open(stored_file_path(media_root, response.json()["cover_url"])) as stored:
        assert stored.size == (800, 600)


@pytest.mark.parametrize(
    ("size", "expected_size"),
    [
        ((400, 200), (200, 400)),
        # Поворот застосовується вже після зменшення
        ((3200, 1600), (800, 1600)),
    ],
    ids=["small", "downscaled"],
)
def test_metadata_is_removed_and_orientation_applied(
    client: TestClient,
    org,
    make_project,
    media_root: Path,
    size: tuple[int, int],
    expected_size: tuple[int, int],
) -> None:
    exif = Image.Exif()
    exif[EXIF_ORIENTATION] = ROTATE_90_CW
    exif[EXIF_GPS_INFO] = {1: "N", 2: (49.0, 50.0, 30.0), 3: "E", 4: (24.0, 1.0, 50.0)}
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = upload(client, project_id, make_image(size=size, exif=exif))

    assert response.status_code == 200, response.text
    with Image.open(stored_file_path(media_root, response.json()["cover_url"])) as stored:
        # Поворот застосовано до пікселів, бо позначки повороту більше немає
        assert stored.size == expected_size
        assert not stored.getexif()
        assert "exif" not in stored.info
        assert "xmp" not in stored.info


@pytest.mark.parametrize(
    ("image_format", "mode", "options", "expected_mode"),
    [
        ("PNG", "RGBA", {}, "RGBA"),
        ("PNG", "LA", {}, "RGBA"),
        # Палітра з прозорим кольором
        ("PNG", "P", {"transparency": 0}, "RGBA"),
        ("PNG", "P", {}, "RGB"),
        # 16-бітні відтінки сірого
        ("PNG", "I;16", {}, "RGB"),
        ("JPEG", "L", {}, "RGB"),
        # Так зберігають файли для друку
        ("JPEG", "CMYK", {}, "RGB"),
    ],
    ids=["rgba", "la", "palette-transparent", "palette", "16-bit", "grayscale", "cmyk"],
)
def test_color_mode_is_converted(
    client: TestClient,
    org,
    make_project,
    media_root: Path,
    image_format: str,
    mode: str,
    options: dict,
    expected_mode: str,
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    data = make_image(image_format, mode=mode, **options)
    response = upload(client, project_id, data, "cover", "application/octet-stream")

    assert response.status_code == 200, response.text
    with Image.open(stored_file_path(media_root, response.json()["cover_url"])) as stored:
        assert stored.mode == expected_mode
        assert stored.size == (1600, 1200)


def test_large_camera_photo_is_downscaled(
    client: TestClient, org, make_project, media_root: Path
) -> None:
    """Фото на 48 Мп у пропорціях 4:3: JPEG декодується одразу зменшеним."""
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = upload(client, project_id, make_image(size=(8000, 6000), mode="L"))

    assert response.status_code == 200, response.text
    with Image.open(stored_file_path(media_root, response.json()["cover_url"])) as stored:
        assert stored.size == (1600, 1200)


def test_format_is_detected_from_content(
    client: TestClient, org, make_project, media_root: Path
) -> None:
    """Content-Type і розширення від клієнта не враховуються: важить лише вміст файлу."""
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    accepted = upload(client, project_id, make_image("PNG"), "photo.gif", "image/gif")
    rejected = upload(client, project_id, b"just text", "photo.jpg", "image/jpeg")

    assert accepted.status_code == 200, accepted.text
    assert rejected.status_code == 415
    assert rejected.json()["detail"][0]["loc"] == ["body", "file"]


@pytest.mark.parametrize(
    ("data", "filename", "content_type"),
    [
        (b"", "empty.jpg", "image/jpeg"),
        (b"not an image at all", "notes.txt", "text/plain"),
        (
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            "cover.svg",
            "image/svg+xml",
        ),
        (make_image("GIF", size=(200, 150), mode="P"), "cover.gif", "image/gif"),
        (make_image("BMP", size=(200, 150)), "cover.bmp", "image/bmp"),
        # Обрізаний JPEG: заголовок коректний, а даних бракує
        (make_image()[:300], "broken.jpg", "image/jpeg"),
    ],
    ids=["empty", "text", "svg", "gif", "bmp", "truncated-jpeg"],
)
def test_unsupported_file_is_rejected(
    client: TestClient,
    db,
    org,
    make_project,
    media_root: Path,
    data: bytes,
    filename: str,
    content_type: str,
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = upload(client, project_id, data, filename, content_type)

    assert response.status_code == 415
    assert response.json()["detail"] == [
        {
            "type": "unsupported_image",
            "loc": ["body", "file"],
            "msg": "File must be a JPEG, PNG or WebP image",
        }
    ]
    assert stored_files(media_root) == []
    assert load_project(db, project_id).cover_key is None


def test_file_over_size_limit_is_rejected(
    client: TestClient, org, make_project, media_root: Path
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = upload(client, project_id, b"\0" * (storage.MAX_UPLOAD_BYTES + 1))

    assert response.status_code == 413
    assert response.json()["detail"][0]["type"] == "file_too_large"
    assert stored_files(media_root) == []


@pytest.mark.parametrize(
    "size",
    [
        # Більше за наш ліміт у 60 Мп, але менше за поріг Pillow
        (8000, 8000),
        # Pillow сам відмовляється відкривати такі зображення
        (14000, 13000),
    ],
    ids=["over-limit", "decompression-bomb"],
)
def test_image_over_pixel_limit_is_rejected(
    client: TestClient, org, make_project, media_root: Path, size: tuple[int, int]
) -> None:
    # Однобітний PNG такого розміру важить кілька кілобайтів: ліміт у байтах його не зупинить
    data = make_image("PNG", size=size, mode="1")
    assert len(data) < storage.MAX_UPLOAD_BYTES
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = upload(client, project_id, data, "huge.png", "image/png")

    assert response.status_code == 413
    assert response.json()["detail"][0]["type"] == "image_too_large"
    assert stored_files(media_root) == []


def test_new_cover_replaces_old_file(
    client: TestClient, db, org, make_project, media_root: Path
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])
    first = upload(client, project_id, make_image()).json()["cover_url"]

    response = upload(client, project_id, make_image("PNG"), "new.png", "image/png")

    assert response.status_code == 200, response.text
    second = response.json()["cover_url"]
    # Нова адреса: кеш nginx і Cloudflare за старою адресою не заважає
    assert second != first
    assert not stored_file_path(media_root, first).exists()
    assert stored_file_path(media_root, second).exists()
    assert len(list((media_root / "projects").iterdir())) == 1


def test_missing_old_file_does_not_block_replacement(
    client: TestClient, org, make_project, media_root: Path
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])
    first = upload(client, project_id, make_image()).json()["cover_url"]
    stored_file_path(media_root, first).unlink()

    response = upload(client, project_id, make_image())

    assert response.status_code == 200, response.text
    assert stored_file_path(media_root, response.json()["cover_url"]).exists()


def test_published_project_and_draft_of_pending_org_accept_cover(
    client: TestClient, db, make_user, make_org, make_project
) -> None:
    owner_id = make_user()
    approved_org = make_org({owner_id: OrgMemberRoleEnum.owner})
    pending_org = make_org({owner_id: OrgMemberRoleEnum.owner}, status=OrgStatusEnum.pending)
    published_id = make_project(approved_org, status=ProjectStatusEnum.published)
    # Чернетку можна готувати, поки організація чекає на схвалення, — разом із фото
    draft_id = make_project(pending_org)
    sign_in(client, owner_id)

    assert upload(client, published_id, make_image()).status_code == 200
    assert upload(client, draft_id, make_image()).status_code == 200


@pytest.mark.parametrize(
    ("role", "target", "expected_status"),
    [
        ("outsider", "draft", 404),
        ("outsider", "published", 404),
        ("member", "draft", 403),
        ("owner", "unknown", 404),
        ("owner", "completed", 409),
    ],
)
def test_image_is_not_processed_without_rights(
    client: TestClient,
    org,
    make_project,
    media_root: Path,
    role: str,
    target: str,
    expected_status: int,
) -> None:
    """Права перевіряються до обробки: інакше будь-хто з акаунтом навантажував би сервер.

    Файл не є зображенням, тож якби його обробили, відповідь була б 415.
    """
    project_ids = {
        "draft": make_project(org["org"]),
        "published": make_project(org["org"], status=ProjectStatusEnum.published),
        "completed": make_project(org["org"], status=ProjectStatusEnum.completed),
        "unknown": 999_999_999,
    }
    sign_in(client, org[role])

    response = upload(client, project_ids[target], b"not an image")

    assert response.status_code == expected_status
    assert stored_files(media_root) == []


@pytest.mark.parametrize("status", [ProjectStatusEnum.completed, ProjectStatusEnum.cancelled])
def test_finished_project_cover_cannot_change(
    client: TestClient, db, org, make_project, media_root: Path, status: ProjectStatusEnum
) -> None:
    project_id = make_project(org["org"], status=status, cover_key="projects/old.webp")
    sign_in(client, org["owner"])

    uploaded = upload(client, project_id, make_image())
    deleted = client.delete(f"/api/projects/{project_id}/photo")

    assert uploaded.status_code == 409
    assert deleted.status_code == 409
    assert uploaded.json()["detail"] == "Completed or cancelled project cannot be edited"
    assert stored_files(media_root) == []
    assert load_project(db, project_id).cover_key == "projects/old.webp"


def test_member_without_editor_role_gets_403(
    client: TestClient, org, make_project, media_root: Path
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["member"])

    uploaded = upload(client, project_id, make_image())
    deleted = client.delete(f"/api/projects/{project_id}/photo")

    assert uploaded.status_code == 403
    assert deleted.status_code == 403
    assert stored_files(media_root) == []


@pytest.mark.parametrize("status", [ProjectStatusEnum.draft, ProjectStatusEnum.published])
def test_outsider_gets_404(
    client: TestClient, org, make_project, media_root: Path, status: ProjectStatusEnum
) -> None:
    project_id = make_project(org["org"], status=status)
    sign_in(client, org["outsider"])

    uploaded = upload(client, project_id, make_image())
    deleted = client.delete(f"/api/projects/{project_id}/photo")

    assert uploaded.status_code == 404
    assert deleted.status_code == 404
    assert stored_files(media_root) == []


def test_unknown_project_gets_404(client: TestClient, org) -> None:
    sign_in(client, org["owner"])

    assert upload(client, 999_999_999, make_image()).status_code == 404
    assert client.delete("/api/projects/999999999/photo").status_code == 404


def test_blocked_organization_gets_403(client: TestClient, db, org, make_project) -> None:
    project_id = make_project(org["org"], status=ProjectStatusEnum.published)
    set_org_status(db, org["org"], OrgStatusEnum.blocked)
    sign_in(client, org["owner"])

    assert upload(client, project_id, make_image()).status_code == 403
    assert client.delete(f"/api/projects/{project_id}/photo").status_code == 403


def test_photo_requires_sign_in(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"])

    assert upload(client, project_id, make_image()).status_code == 401
    assert client.delete(f"/api/projects/{project_id}/photo").status_code == 401


def test_missing_file_field_gets_422(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = client.post(f"/api/projects/{project_id}/photo")

    assert response.status_code == 422


# =====================================================================
# DELETE /api/projects/{id}/photo
# =====================================================================


def test_delete_removes_cover_and_file(
    client: TestClient, db, org, make_project, media_root: Path
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["admin"])
    cover_url = upload(client, project_id, make_image()).json()["cover_url"]

    response = client.delete(f"/api/projects/{project_id}/photo")

    assert response.status_code == 200, response.text
    assert response.json()["cover_url"] is None
    assert not stored_file_path(media_root, cover_url).exists()
    assert load_project(db, project_id).cover_key is None


def test_delete_without_cover_is_not_an_error(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = client.delete(f"/api/projects/{project_id}/photo")

    assert response.status_code == 200, response.text
    assert response.json()["cover_url"] is None


# =====================================================================
# cover_url у списках проєктів
# =====================================================================


def test_cover_url_in_catalog_and_organization_page(client: TestClient, org, make_project) -> None:
    with_cover = make_project(
        org["org"], status=ProjectStatusEnum.published, cover_key="projects/abc.webp"
    )
    without_cover = make_project(org["org"], status=ProjectStatusEnum.published)

    catalog = client.get("/api/projects").json()
    organization = client.get(f"/api/organizations/{org['org']}").json()

    for projects in (catalog, organization["projects"]):
        covers = {project["id"]: project["cover_url"] for project in projects}
        assert covers[with_cover] == "/media/projects/abc.webp"
        assert covers[without_cover] is None
        assert all("cover_key" not in project for project in projects)


def test_cover_url_in_organization_cabinet(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"], cover_key="projects/draft.webp")
    sign_in(client, org["member"])

    response = client.get("/api/organizations/me/projects", params={"organization_id": org["org"]})

    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["id"] == project_id
    assert response.json()["items"][0]["cover_url"] == "/media/projects/draft.webp"
