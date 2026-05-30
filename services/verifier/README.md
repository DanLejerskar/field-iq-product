# `@field-iq/verifier`

Python 3.12 worker that pulls jobs off the `verify-queue` Redis Stream, asks Claude
Sonnet 4.6 whether the photo verifies the current LOTO step, and persists the verdict
(audit row, session-step transition, WebSocket event).

## Modes

| Mode               | When it runs                                         | Behaviour                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **mock** (default) | `VERIFIER_MOCK=true` _or_ no `ANTHROPIC_API_KEY`     | Returns a canned `verified=true` verdict so the full session loop runs without Claude. Mirrors the Node `USE_MOCK_VERIFIER` worker shipped in M3.                                                              |
| **live**           | `VERIFIER_MOCK=false` and a real `ANTHROPIC_API_KEY` | Fetches the photo from S3/MinIO and calls Anthropic Messages with the verbatim system prompt (`prompts/system.txt`) + the step's verification prompt. Retries 3× on transient errors with exponential backoff. |

## Run

```bash
cd services/verifier
uv sync
uv run python -m verifier.worker
```

Requires Redis + Postgres reachable at the URLs in `.env.local` (set by `pnpm run setup`).
S3/MinIO is only needed in live mode.

## Tests

```bash
uv run pytest               # offline suite: parsing, mock verdict, retry, prompt fidelity
ANTHROPIC_API_KEY=... uv run pytest -m live   # live regression against real Claude
```

The live regression expects known-good fixture photos at `fixtures/dac811/stepNN_*.jpg`
(one per step). Drop them in and the parametrised test exercises all 10 prompts.
