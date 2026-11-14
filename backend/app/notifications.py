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
# Кабінет організації поточного користувача
ORGANIZATION_DASHBOARD_LINK = "/organization"
# Редагування профілю організації, зокрема після відхилення адміністратором
ORGANIZATION_EDIT_LINK = "/organization/edit"
# Заявки на вступ у кабінеті організації
ORGANIZATION_JOIN_REQUESTS_LINK = "/organization/join-requests"


def organization_page_link(organization_id: int) -> str:
    """Публічна сторінка організації (R-16)."""
    return f"/organizations/{organization_id}"


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
