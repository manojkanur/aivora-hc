# Aivora HC

AI-powered Human Capital Advisory Platform

## Quick Start (Development)

1. `cp .env.example .env` and fill in values
2. `docker compose up -d`
3. Frontend: http://localhost:5173
4. Backend API: http://localhost:8000
5. API docs: http://localhost:8000/docs

## Production Deploy

1. Set up Ubuntu 24.04 VPS (Hostinger recommended)
2. Install Docker + Docker Compose
3. `cp .env.example .env.prod` and fill real values
4. `chmod +x deploy.sh && ./deploy.sh`

## Architecture

- Backend: Python FastAPI (port 8000)
- Frontend: React + Vite (served by nginx)
- Database: PostgreSQL 16 + pgvector
- Cache/Queue: Redis 7
- Workers: Celery 5.4

## Environment Variables

See `.env.example` for all required variables.

## Backup

`./scripts/backup_postgres.sh` - manual backup
`./scripts/install_backup_timer.sh` - install nightly systemd timer
