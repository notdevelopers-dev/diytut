from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    # Без DEV_LOGIN обов'язкові; з DEV_LOGIN можна лишити порожніми
    google_client_id: str = ""
    google_client_secret: str = ""
    # Має збігатися з одним із redirect URI, дозволених у Google Cloud Console
    google_redirect_uri: str = ""
    # Підписує JWT і тимчасову cookie зі state для OAuth; порожній чи короткий ключ легко підібрати
    secret_key: str = Field(min_length=32)
    # Вимикати лише для локальної розробки без HTTPS
    cookie_secure: bool = True
    # Лише для локальної розробки: вхід без Google, під будь-яким email
    dev_login: bool = False

    @model_validator(mode="after")
    def check_login_settings(self) -> Self:
        if self.dev_login:
            # Захист від випадкового ввімкнення там, де є HTTPS, тобто на сервері
            if self.cookie_secure:
                raise ValueError("DEV_LOGIN works only with COOKIE_SECURE=false")
            return self
        missing = [
            name.upper()
            for name in ("google_client_id", "google_client_secret", "google_redirect_uri")
            if not getattr(self, name)
        ]
        if missing:
            raise ValueError(f"Set {', '.join(missing)} or enable DEV_LOGIN for local development")
        return self


settings = Settings()
