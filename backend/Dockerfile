# спільна основа: Python + uv
FROM python:3.14-slim AS base
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0 \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

# залежності для продакшну
FROM base AS builder
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

# середовище розробки: код монтується ззовні
FROM base AS dev
ARG UID=1000
ARG GID=1000
RUN groupadd --gid ${GID} dev \
 && useradd --uid ${UID} --gid ${GID} --create-home dev \
 && mkdir /opt/venv && chown dev:dev /opt/venv
COPY pyproject.toml uv.lock ./
USER dev
RUN uv sync --locked --no-install-project
ENV PATH="/opt/venv/bin:$PATH"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# продакшн
FROM python:3.14-slim AS prod
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1
RUN useradd --system --uid 10001 app
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY . .
RUN python -m compileall -q app
USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]