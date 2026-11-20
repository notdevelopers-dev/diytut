from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, NotificationTypeEnum

# Шляхи на фронтенді, куди веде клік по сповіщенню.
#
# Тимчасове рішення: бекенд зберігає готовий шлях у notifications.link, бо так задумано
# в моделі. Шляхи ще не підтверджені фронтендом, а частини маршрутів там поки немає;
# якщо не підходять — узгодити й змінити тут. Недолік підходу: бекенд знає маршрути
# фронтенду, а вже збережені сповіщення лишаються зі старим шляхом після їх зміни.
# Альтернатива — зберігати замість шляху id пов'язаних об'єктів (organization_id,
# project_id… або JSONB payload), а шлях з type та id будує фронтенд; це потребує
# міграції. Докладніше — у README, розділ «Сповіщення».
#
# Сторінки кабінету організації отримують ?organization_id= так само, як /api/organizations/me:
# користувач може належати до кількох організацій, і без id незрозуміло, котрої стосується
# сповіщення.


def organization_dashboard_link(organization_id: int) -> str:
    """Кабінет організації."""
    return f"/organization?organization_id={organization_id}"


def organization_edit_link(organization_id: int) -> str:
    """Редагування профілю організації, зокрема після відхилення адміністратором."""
    return f"/organization/edit?organization_id={organization_id}"


def organization_join_requests_link(organization_id: int) -> str:
    """Заявки на вступ у кабінеті організації."""
    return f"/organization/join-requests?organization_id={organization_id}"


def organization_page_link(organization_id: int) -> str:
    """Публічна сторінка організації (R-16)."""
    return f"/organizations/{organization_id}"


def project_page_link(project_id: int) -> str:
    """Публічна сторінка проєкту."""
    return f"/projects/{project_id}"


def project_join_requests_link(organization_id: int, project_id: int) -> str:
    """Заявки на проєкт у кабінеті організації."""
    return f"/organization/projects/{project_id}/join-requests?organization_id={organization_id}"


def create_notification(
    db_session: AsyncSession,
    user_id: int,
    type_: NotificationTypeEnum,
    title: str,
    message: str,
    link: str | None = None,
) -> Notification:
    """Додає сповіщення до сесії, але не зберігає його.

    Зберігає той, хто викликав, своїм commit: так сповіщення з'являється лише разом із
    подією, про яку воно повідомляє, а за відкату не лишається сповіщення про те,
    чого не сталося.
    """
    notification = Notification(
        user_id=user_id, type=type_, title=title, message=message, link=link
    )
    db_session.add(notification)
    return notification
