# diytut

## Як працює сервер спрощено
Cloudflare tunnels <-> Nginx <-> FastAPI <-> PostgreSQL

## Розгортання
1. Заповнити .env за прикладом
```bash
cp .env.example .env
```
2. Запустити docker-compose
```bash
docker-compose up -d
```