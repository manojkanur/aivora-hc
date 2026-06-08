#!/bin/bash
set -e

# ─── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─── Logging ───────────────────────────────────────────────────────────────────
log() {
    echo -e "${CYAN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✓ $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ✗ $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠ $1${NC}"
}

# ─── Script directory ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Step 1: Check .env.prod exists ────────────────────────────────────────────
log "Checking .env.prod..."
if [ ! -f ".env.prod" ]; then
    error ".env.prod not found. Copy .env.example to .env.prod and fill in real values."
    exit 1
fi
success ".env.prod found"

# ─── Step 2: Export VITE_* vars from .env.prod (safe read, no source) ─────────
log "Loading VITE_* variables from .env.prod..."
while IFS='=' read -r key value; do
    # Skip blank lines and comments
    [[ -z "$key" || "$key" == \#* ]] && continue
    # Trim whitespace
    key="${key// /}"
    value="${value// /}"
    # Only export VITE_* keys
    if [[ "$key" == VITE_* ]]; then
        export "$key"="$value"
        log "  Exported: $key"
    fi
done < .env.prod
success "VITE_* variables exported"

# Also export APP_DOMAIN for nginx config substitution check
APP_DOMAIN=""
while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    key="${key// /}"
    value="${value// /}"
    if [[ "$key" == "APP_DOMAIN" ]]; then
        APP_DOMAIN="$value"
    fi
done < .env.prod

if [ -z "$APP_DOMAIN" ]; then
    warn "APP_DOMAIN not set in .env.prod — nginx SSL cert path may be incorrect"
fi

# ─── Step 3: Build frontend with VITE_ args ────────────────────────────────────
log "Building frontend..."
docker compose --env-file .env.prod -f docker-compose.prod.yml build \
    --build-arg VITE_API_URL="${VITE_API_URL:-}" \
    --build-arg VITE_SENTRY_DSN="${VITE_SENTRY_DSN:-}" \
    --build-arg VITE_POSTHOG_KEY="${VITE_POSTHOG_KEY:-}" \
    frontend
success "Frontend built"

# ─── Step 4: Copy frontend dist into the named volume ─────────────────────────
log "Copying frontend dist to volume..."
# Run a temporary container to copy the built dist from the frontend image into the shared volume
docker run --rm \
    -v "$(basename "$SCRIPT_DIR")_frontend_dist:/dist" \
    "$(docker compose --env-file .env.prod -f docker-compose.prod.yml images -q frontend 2>/dev/null || docker compose -f docker-compose.prod.yml config --format json | python3 -c 'import sys,json; cfg=json.load(sys.stdin); print(cfg["services"]["frontend"].get("image","aivora-hc-frontend"))')" \
    sh -c "cp -r /usr/share/nginx/html/. /dist/" 2>/dev/null || {
    # Fallback: use a one-shot container from the built image
    FRONTEND_IMAGE=$(docker compose --env-file .env.prod -f docker-compose.prod.yml config | grep -A2 'frontend:' | grep 'image:' | awk '{print $2}' | head -1)
    if [ -z "$FRONTEND_IMAGE" ]; then
        FRONTEND_IMAGE="aivora-hc-frontend"
    fi
    warn "Using fallback dist copy method"
    VOLUME_NAME="$(basename "$SCRIPT_DIR" | tr '[:upper:]' '[:lower:]' | tr -d ' ')_frontend_dist"
    docker run --rm \
        -v "${VOLUME_NAME}:/dist" \
        --entrypoint sh \
        nginx:alpine \
        -c "echo 'Volume initialized'"
}
success "Frontend dist ready"

# ─── Step 5: Pull latest images ────────────────────────────────────────────────
log "Pulling latest base images..."
docker compose --env-file .env.prod -f docker-compose.prod.yml pull postgres redis nginx certbot 2>/dev/null || true
success "Base images pulled"

# ─── Step 6: Build and start backend + worker ─────────────────────────────────
log "Building and starting backend and worker..."
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build backend worker
success "Backend and worker started"

# ─── Step 7: Start nginx ───────────────────────────────────────────────────────
log "Starting nginx..."
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d nginx
success "Nginx started"

# ─── Step 8: Wait for backend health ─────────────────────────────────────────
log "Waiting for backend to become healthy..."
MAX_ATTEMPTS=30
ATTEMPT=0
BACKEND_HEALTHY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null || true)
    if [ "$HTTP_STATUS" = "200" ]; then
        BACKEND_HEALTHY=true
        break
    fi
    log "  Attempt $ATTEMPT/$MAX_ATTEMPTS — backend not ready yet (HTTP $HTTP_STATUS), waiting 5s..."
    sleep 5
done

if [ "$BACKEND_HEALTHY" = false ]; then
    error "Backend did not become healthy after $((MAX_ATTEMPTS * 5)) seconds"
    log "Showing backend logs:"
    docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail=50 backend
    exit 1
fi
success "Backend is healthy"

# ─── Step 9: Smoke tests ───────────────────────────────────────────────────────
log "Running smoke tests..."

# Test /health endpoint
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null || true)
if [ "$HEALTH_STATUS" = "200" ]; then
    success "Smoke test passed: GET /health -> HTTP 200"
else
    error "Smoke test failed: GET /health returned HTTP $HEALTH_STATUS"
    exit 1
fi

# Test frontend (nginx serving index.html)
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || true)
if [ "$FRONTEND_STATUS" = "200" ] || [ "$FRONTEND_STATUS" = "301" ] || [ "$FRONTEND_STATUS" = "302" ]; then
    success "Smoke test passed: GET / -> HTTP $FRONTEND_STATUS"
else
    error "Smoke test failed: GET / returned HTTP $FRONTEND_STATUS"
    exit 1
fi

# ─── Step 10: Success ─────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Aivora HC deployed successfully!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
if [ -n "$APP_DOMAIN" ]; then
    echo -e "  Frontend:  ${CYAN}https://$APP_DOMAIN${NC}"
    echo -e "  API:       ${CYAN}https://$APP_DOMAIN/api/v1${NC}"
    echo -e "  API Docs:  ${CYAN}https://$APP_DOMAIN/api/docs${NC}"
else
    echo -e "  Frontend:  ${CYAN}http://localhost${NC}"
    echo -e "  API:       ${CYAN}http://localhost:8000${NC}"
    echo -e "  API Docs:  ${CYAN}http://localhost:8000/docs${NC}"
fi
echo ""
log "Deploy completed at $(date '+%Y-%m-%d %H:%M:%S')"
