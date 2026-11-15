# Alembic і relationship("...") бачать лише імпортовані моделі: кожен новий файл моделей
# треба імпортувати тут
from app.models.attendance import Attendance
from app.models.base import Base
from app.models.city import City
from app.models.experience import ExperienceLevelEnum
from app.models.feedback import Feedback, FeedbackTargetEnum
from app.models.join_request import JoinRequest, JoinRequestStatusEnum, JoinRequestTargetEnum
from app.models.login_event import LoginEvent, LoginMethodEnum
from app.models.notification import Notification, NotificationTypeEnum
from app.models.organization import (
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
)
from app.models.project import Project, ProjectStatusEnum
from app.models.user import GenderEnum, RoleEnum, User

__all__ = [
    "Attendance",
    "Base",
    "City",
    "ExperienceLevelEnum",
    "Feedback",
    "FeedbackTargetEnum",
    "GenderEnum",
    "JoinRequest",
    "JoinRequestStatusEnum",
    "JoinRequestTargetEnum",
    "LoginEvent",
    "LoginMethodEnum",
    "Notification",
    "NotificationTypeEnum",
    "OrgMemberRoleEnum",
    "OrgStatusEnum",
    "Organization",
    "OrganizationMember",
    "Project",
    "ProjectStatusEnum",
    "RoleEnum",
    "User",
]
