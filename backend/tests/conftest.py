import os

# Налаштування для тестів; змінні з оточення контейнера мають пріоритет
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://testserver/api/auth/google/callback")
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-bytes-long")
os.environ.setdefault("COOKIE_SECURE", "false")
