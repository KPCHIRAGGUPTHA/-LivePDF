#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# LivePDF EC2 Emergency Diagnostic + Recovery Script
# Run this on your EC2 server via SSH:
#   chmod +x ec2_fix.sh && bash ec2_fix.sh
# ─────────────────────────────────────────────────────────────────

set -e
cd /home/ubuntu/livepdf

echo ""
echo "══════════════════════════════════════════════════"
echo "  STEP 1: Check what's actually running"
echo "══════════════════════════════════════════════════"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "══════════════════════════════════════════════════"
echo "  STEP 2: Check port 80 listener"
echo "══════════════════════════════════════════════════"
ss -tlnp | grep ':80' || echo "NOTHING IS LISTENING ON PORT 80 — this is why you get ERR_CONNECTION_REFUSED"

echo ""
echo "══════════════════════════════════════════════════"
echo "  STEP 3: Check disk space (full disk = crash)"
echo "══════════════════════════════════════════════════"
df -h /

echo ""
echo "══════════════════════════════════════════════════"
echo "  STEP 4: Show last 50 lines of crashed containers"
echo "══════════════════════════════════════════════════"
for cname in livepdf-client-prod livepdf-api-prod livepdf-postgres-prod livepdf-redis-prod; do
  STATUS=$(docker inspect --format='{{.State.Status}}' "$cname" 2>/dev/null || echo "not found")
  echo ""
  echo "--- $cname (status: $STATUS) ---"
  if [ "$STATUS" != "not found" ]; then
    docker logs --tail=30 "$cname" 2>&1 || true
  fi
done

echo ""
echo "══════════════════════════════════════════════════"
echo "  STEP 5: Pull latest images and restart everything"
echo "══════════════════════════════════════════════════"
export DOCKER_USERNAME="kpchiragguptha"
export API_IMAGE="${DOCKER_USERNAME}/livepdf-server:latest"
export CLIENT_IMAGE="${DOCKER_USERNAME}/livepdf-client:latest"
export PYTHON_IMAGE="${DOCKER_USERNAME}/livepdf-python:latest"

echo "Pulling latest images..."
docker compose -f docker-compose.prod.yml pull

echo "Restarting all containers..."
docker compose -f docker-compose.prod.yml down --remove-orphans
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "══════════════════════════════════════════════════"
echo "  STEP 6: Wait 60s then check status"
echo "══════════════════════════════════════════════════"
echo "Waiting 60 seconds for containers to initialize..."
sleep 60

docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
ss -tlnp | grep ':80' && echo "✅ Port 80 is now listening!" || echo "❌ Port 80 still not listening — see logs above for errors"

echo ""
echo "══════════════════════════════════════════════════"
echo "  DONE. If port 80 is still not listening, paste"
echo "  the output above and share it."
echo "══════════════════════════════════════════════════"
