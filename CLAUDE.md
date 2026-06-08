# Aivora HC — Claude Code Context

## Project
Full-stack HC advisory platform. React 18 + Vite + TypeScript + Tailwind CSS frontend (`frontend-dark/`), FastAPI + PostgreSQL backend (`backend/`).

## Memory
Session memory is in `.claude/memory/`. On first run, load it:
```
Read .claude/memory/MEMORY.md and all files it references — use them as project context.
```

## Dev setup
```bash
cd frontend-dark && npm install && npm run dev   # http://localhost:5174
```

## VPS deployment
- Server: `root@191.101.2.4` (SSH key: `~/.ssh/aivora_deploy`)
- Build: `npm run build` in `frontend-dark/`
- Deploy: `rsync -az --delete dist/ root@191.101.2.4:/opt/aivora/frontend-dark/dist/` then `docker exec aivora-frontend-1 nginx -s reload`
- Live at: `http://191.101.2.4:8888` and `https://srv1272089.hstgr.cloud`

## Design system
- Background: `#0c0e14`, Card: `#131720`, Border: `#1e2433`, Primary: `#3b82f6`
- Fonts: Inter + Outfit

## Key files
- `frontend-dark/src/lib/api.ts` — all API calls
- `frontend-dark/src/store/clientProfile.ts` — Zustand store
- `frontend-dark/src/pages/AdminDashboard.tsx` — admin panel
- `frontend-dark/src/pages/Onboarding.tsx` — 5-step onboarding
- `frontend-dark/src/pages/ChallengeBrief.tsx` — 7-step challenge brief
