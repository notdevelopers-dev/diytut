from fastapi import HTTPException, status


def field_error(status_code: int, field: str, error_type: str, message: str) -> HTTPException:
    """Помилка поля в тому ж форматі, що й помилки валідації FastAPI (422)."""
    return HTTPException(
        status_code, [{"type": error_type, "loc": ["body", field], "msg": message}]
    )


def not_authenticated() -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")


def registration_expired() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Registration expired, sign in with Google again"
    )


def dev_login_disabled() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")


def email_required() -> HTTPException:
    return field_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT, "email", "email_required", "Email is required"
    )


def user_not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "User not found")


def user_already_registered() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "User is already registered")


def nickname_taken() -> HTTPException:
    return field_error(
        status.HTTP_409_CONFLICT, "nickname", "nickname_taken", "Nickname is already taken"
    )


def city_not_found() -> HTTPException:
    return field_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT, "city_id", "city_not_found", "City not found"
    )


def already_has_organization() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "User already belongs to an organization")


def no_organization() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "User does not belong to an organization")


def edrpou_taken() -> HTTPException:
    return field_error(
        status.HTTP_409_CONFLICT,
        "edrpou",
        "edrpou_taken",
        "Organization with this EDRPOU code is already registered",
    )


def not_organization_editor() -> HTTPException:
    return HTTPException(
        status.HTTP_403_FORBIDDEN, "Only the owner or an admin can edit the organization"
    )


def organization_blocked() -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, "Organization is blocked")


def not_platform_admin() -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required")


def organization_not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")


def organization_already_reviewed() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "Organization request has already been reviewed")


def invalid_period(message: str) -> HTTPException:
    return HTTPException(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        [{"type": "invalid_period", "loc": ["query", "date_from"], "msg": message}],
    )


def project_not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")


def project_requires_organization() -> HTTPException:
    # 403, а не 404 як у no_organization(): дія заборонена, а не ресурс відсутній
    return HTTPException(status.HTTP_403_FORBIDDEN, "User does not belong to an organization")


def not_project_manager() -> HTTPException:
    return HTTPException(
        status.HTTP_403_FORBIDDEN, "Only organization owner or admin can create projects"
    )


def organization_not_approved() -> HTTPException:
    return HTTPException(
        status.HTTP_403_FORBIDDEN, "Only approved organizations can create projects"
    )
