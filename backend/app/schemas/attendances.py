from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import Attendance, JoinRequest
from app.schemas.join_requests import JoinRequestApplicant
from app.schemas.projects import MAX_VOLUNTEER_HOURS, VOLUNTEER_HOURS_DECIMAL_PLACES
from app.schemas.users import MAX_BIGINT

# Більше не потрібно: список учасників теж віддається сторінками до 100, а довгий пакет
# лише тримав би блокування проєкту
MAX_ATTENDANCE_BATCH = 100

# Межі numeric(5, 2), як і в годин проєкту. На відміну від них, 0 дозволено: так позначають,
# що волонтер не прийшов. Верхньої межі за плановими годинами проєкту немає: організатор
# може нарахувати більше, ніж планувалося (наприклад, подія затяглася)
AttendanceHours = Annotated[
    Decimal,
    Field(ge=0, le=MAX_VOLUNTEER_HOURS, decimal_places=VOLUNTEER_HOURS_DECIMAL_PLACES),
]


class AttendanceEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: Annotated[int, Field(gt=0, le=MAX_BIGINT)]
    # Без годин нараховуються години проєкту (volunteer_hours); 0 — волонтер не прийшов
    hours: AttendanceHours | None = None


class AttendanceBatchCreate(BaseModel):
    """Підтвердження участі кількох волонтерів одним запитом: усе або нічого."""

    model_config = ConfigDict(extra="forbid")

    entries: Annotated[list[AttendanceEntry], Field(min_length=1, max_length=MAX_ATTENDANCE_BATCH)]

    @model_validator(mode="after")
    def unique_users(self) -> AttendanceBatchCreate:
        user_ids = [entry.user_id for entry in self.entries]
        if len(user_ids) != len(set(user_ids)):
            raise ValueError("Each user can appear in the batch only once")
        return self


class AttendanceUpdate(BaseModel):
    """Виправлення годин наявного запису; змінюється лише кількість годин."""

    model_config = ConfigDict(extra="forbid")

    hours: AttendanceHours


class AttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    # NULL лише в знеособленого запису видаленого акаунта, а такі тут не повертаються
    user_id: int | None
    hours: Decimal
    confirmed_by: int | None
    confirmed_at: datetime
    updated_at: datetime


class ProjectParticipantAttendanceRead(BaseModel):
    """Схвалений учасник проєкту й стан підтвердження його участі."""

    user: JoinRequestApplicant
    # None — участь ще не підтверджено
    attendance: AttendanceRead | None

    @classmethod
    def from_rows(
        cls, join_request: JoinRequest, attendance: Attendance | None
    ) -> ProjectParticipantAttendanceRead:
        return cls(
            user=JoinRequestApplicant.model_validate(join_request.user),
            attendance=None if attendance is None else AttendanceRead.model_validate(attendance),
        )
