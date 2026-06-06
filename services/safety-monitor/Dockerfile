# Python 3.12 + uv. Builds a thin runtime that subscribes to Redis pub/sub and
# calls Claude Sonnet 4.6 on a per-session throttle to detect safety risk.
#
# Mirrors services/verifier/Dockerfile's two-step uv sync so the editable
# field-iq-safety-monitor install finds its src tree (uv.lock pins it as
# `source = { editable = "." }`).

FROM python:3.12-slim AS builder

ENV UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# uv installer
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -LsSf https://astral.sh/uv/install.sh | sh \
 && mv /root/.local/bin/uv /usr/local/bin/uv \
 && apt-get purge -y curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Step 1: install dependencies only. This layer stays cached across code-only
# edits — uv.lock + pyproject.toml change far less often than src/.
COPY services/safety-monitor/pyproject.toml services/safety-monitor/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Step 2: copy the project source and complete the editable install.
COPY services/safety-monitor/src ./src
RUN uv sync --frozen --no-dev

# ---- Runtime ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    MONITOR_MOCK=false

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src

# Railway injects DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, ANTHROPIC_MODEL.
CMD ["python", "-m", "monitor.worker"]
