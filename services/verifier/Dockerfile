# Python 3.12 + uv. Builds a thin runtime that drains the verify-queue and
# calls Claude Sonnet 4.6 with the verbatim system prompt.

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
COPY services/verifier/pyproject.toml services/verifier/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Step 2: copy the project source and complete the editable install. uv.lock
# pins `field-iq-verifier` as `source = { editable = "." }`, so the package
# directory must exist before `uv sync` finishes.
COPY services/verifier/src ./src
RUN uv sync --frozen --no-dev

# ---- Runtime ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    VERIFIER_MOCK=false

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src

# Run the worker as the entrypoint. Railway injects ANTHROPIC_API_KEY, REDIS_URL,
# DATABASE_URL, S3_* (S3_* unused in v1 — photos are data URIs) via env vars.
CMD ["python", "-m", "verifier.worker"]
