from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    google_client_id: str
    google_client_secret: str
    # Має збігатися з одним із redirect URI, дозволених у Google Cloud Console
    google_redirect_uri: str
    # Підписує JWT і тимчасову cookie зі state для OAuth
    secret_key: str
    # Вимикати лише для локальної розробки без HTTPS
    cookie_secure: bool = True


settings = Settings()
