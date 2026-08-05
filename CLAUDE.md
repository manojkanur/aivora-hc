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

## Design system (AIVORA Brand Guidelines 2026)
Source: `AIVORA_Brand_extracted/` (from `AIVORA Brand-*.zip`). Tokens = Developer Handoff.
- Logo/marketing blue: `#0060FF`. In-product action accent: `#2E7DFA` (dark) / `#175FCC` (light).
- Dark theme: bg `#0B1220`, panel `#1B2431`, text `#F5F7FA`/`#8C96A6`, AI accent `#17BFA0`.
- Light theme: bg `#FAFBFC`, panel `#E7ECF2`, text `#0B1220`/`#5F6B7A`, AI accent `#0F9C82`.
- Semantic: warning `#C97A1E`, success `#2E9E5B`, risk `#D14343`.
- Font: IBM Plex Sans (self-hosted TTFs in `src/assets/fonts/`; backend poster fonts in `backend/app/services/fonts/`).
- Logo component: `src/components/brand/AivoraLogo.tsx` (real AIV mark + AIVORA wordmark SVG paths).
- Tokens live in `src/index.css` (CSS vars) + `tailwind.config.ts`. Buttons: radius 8px, padding 12px 24px, 15px Medium.

## Key files
- `frontend-dark/src/lib/api.ts` — all API calls
- `frontend-dark/src/store/clientProfile.ts` — Zustand store
- `frontend-dark/src/pages/AdminDashboard.tsx` — admin panel
- `frontend-dark/src/pages/Onboarding.tsx` — 5-step onboarding
- `frontend-dark/src/pages/ChallengeBrief.tsx` — 7-step challenge brief
