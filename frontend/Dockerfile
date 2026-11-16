# --- середовище розробки: код і node_modules монтуються ззовні ---
FROM node:24-slim AS dev
ARG UID=1000
ARG GID=1000
RUN mkdir -p /app/node_modules && chown -R ${UID}:${GID} /app
ENV HOME=/tmp
WORKDIR /app
USER ${UID}:${GID}
EXPOSE 5173
# --no-save: контейнер не переписує package-lock.json у змонтованому репозиторії (інакше npm падає з EACCES, коли власник файлів на хості має інший UID)
CMD ["sh", "-c", "npm install --no-save --no-audit --no-fund && exec npm run dev -- --host 0.0.0.0"]

# --- збирання продакшн-версії ---
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# --- продакшн: nginx роздає зібраний сайт (останній етап, збирається за замовчуванням) ---
FROM nginx/nginx-unprivileged:stable-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html