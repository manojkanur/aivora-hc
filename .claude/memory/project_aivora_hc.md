---
name: Aivora HC project context
description: Core architecture, design system, deployment, and flow for the Aivora HC platform
type: project
originSessionId: bfd44c42-e759-490a-afa9-44b1a24360db
---
Full-stack HC advisory platform. React+Vite+TypeScript frontend at `/Users/manojaidude/HCM Project/aivora-hc/frontend-dark/`.

**Design system:** #0c0e14 bg, #131720 card, #1e2433 border, #3b82f6 primary blue. Inter+Outfit fonts.

**VPS deployment:** `sshpass -p 'Manoj@121295' rsync -az --delete dist/ root@191.101.2.4:/opt/aivora/frontend-dark/dist/` then `docker exec aivora-frontend-1 nginx -s reload`. URL: http://191.101.2.4

**Unified flow:** Onboarding (5-step Smart Client Profile from Asset-Manager ZIP) → Challenge Brief (7-step) → 27 HC Studios

**Store:** `src/store/clientProfile.ts` (Zustand+persist) — ClientProfile type with organization, agenda, workforceContext, outputPreferences, evidence. Profile flows from Onboarding into ChallengeBrief via pre-population.

**Asset-Manager ZIP at `/tmp/Asset-Manager/`** — authoritative source for option labels, types, onboarding wizard steps, challenge-brief wizard, module registry with 27 studios.

**Why:** User wants end-to-end UX where client context captured in onboarding directly seeds the Challenge Brief and all studios — no re-entering data.
