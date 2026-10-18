# середовище розробки: код і node_modules монтуються ззовні
FROM node:24-slim AS dev
ARG UID=1000
ARG GID=1000
RUN mkdir -p /app/node_modules && chown -R ${UID}:${GID} /app
ENV HOME=/tmp
WORKDIR /app
USER ${UID}:${GID}
EXPOSE 5173
CMD ["sh", "-c", "npm install --no-audit --no-fund && exec npm run dev -- --host 0.0.0.0"]