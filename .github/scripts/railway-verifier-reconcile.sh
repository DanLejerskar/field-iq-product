#!/usr/bin/env bash
#
# Phase 2E — Railway verifier reconciliation.
#
# Idempotent end-to-end driver against Railway's public GraphQL API:
#   1. Resolve project + backend/verifier service IDs + production env.
#   2. Pull DATABASE_URL / REDIS_URL / ANTHROPIC_API_KEY / ANTHROPIC_MODEL from
#      backend. Abort loudly if any look bogus (missing / `<placeholder>` /
#      literal "@field-iq/backend" / < 5 chars).
#   3. Upsert those 4 values + VERIFIER_MOCK=false onto the verifier service.
#   4. Delete every other env var on the verifier (purges Railway's auto-import
#      placeholders).
#   5. Trigger a verifier redeploy. Try `serviceInstanceRedeploy` first; fall
#      back to `serviceInstanceDeployV2` if the first mutation isn't recognised.
#   6. Poll the latest deployment for SUCCESS / FAILED / CRASHED (max 5 min).
#   7. Tail the last 50 runtime log lines (build logs if runtime is empty).
#   8. Optionally flip backend USE_MOCK_VERIFIER=false + redeploy backend.
#
# Inputs (via env): RAILWAY_TOKEN, PROJECT_ID, VERIFIER_NAME, BACKEND_NAME,
#                   FLIP_BACKEND.
# Output: stdout. Values are redacted as `(len=N, prefix="abcdefgh", suffix="wxyz")`.

set -euo pipefail

: "${RAILWAY_TOKEN:?missing RAILWAY_TOKEN}"
: "${PROJECT_ID:?missing PROJECT_ID}"
: "${VERIFIER_NAME:?missing VERIFIER_NAME}"
: "${BACKEND_NAME:?missing BACKEND_NAME}"
FLIP_BACKEND="${FLIP_BACKEND:-true}"

API="https://backboard.railway.app/graphql/v2"
CRITICAL=(DATABASE_URL REDIS_URL ANTHROPIC_API_KEY ANTHROPIC_MODEL)
KEEP=(DATABASE_URL REDIS_URL ANTHROPIC_API_KEY ANTHROPIC_MODEL VERIFIER_MOCK)

# ── GraphQL helper. Reads `{ "query": ..., "variables": ... }` on stdin. ────
gql() {
  local resp
  resp=$(curl -sS -X POST "$API" \
    -H "Authorization: Bearer $RAILWAY_TOKEN" \
    -H "Content-Type: application/json" \
    --data @-)
  printf '%s' "$resp"
}

# Redact: `(len=N, prefix="abcdefgh", suffix="wxyz")` for non-trivial strings.
redact() {
  local v="${1:-}"
  local n=${#v}
  if [ "$n" -le 12 ]; then
    printf '(len=%d)' "$n"
  else
    printf '(len=%d, prefix="%s", suffix="%s")' "$n" "${v:0:8}" "${v: -4}"
  fi
}

abort() {
  echo "::error::$*" >&2
  exit 1
}

echo "── 1. Resolve project + services + production environment"
proj_query=$(jq -cn --arg id "$PROJECT_ID" '{query:"query($id:String!){project(id:$id){id name environments{edges{node{id name}}} services{edges{node{id name}}}}}", variables:{id:$id}}')
proj_resp=$(printf '%s' "$proj_query" | gql)
if jq -e '.errors' <<<"$proj_resp" >/dev/null 2>&1; then
  abort "project query failed: $(jq -r '.errors[].message' <<<"$proj_resp")"
fi
if ! jq -e '.data.project' <<<"$proj_resp" >/dev/null 2>&1; then
  abort "project $PROJECT_ID not found (token scope / wrong ID?)"
fi

PROJECT_NAME=$(jq -r '.data.project.name' <<<"$proj_resp")
ENV_ID=$(jq -r '.data.project.environments.edges[] | select(.node.name | test("^prod"; "i")) | .node.id' <<<"$proj_resp" | head -n1)
[ -n "$ENV_ID" ] || ENV_ID=$(jq -r '.data.project.environments.edges[0].node.id' <<<"$proj_resp")
ENV_NAME=$(jq -r --arg id "$ENV_ID" '.data.project.environments.edges[] | select(.node.id == $id) | .node.name' <<<"$proj_resp")

BACKEND_ID=$(jq -r --arg n "$BACKEND_NAME" '.data.project.services.edges[] | select(.node.name == $n) | .node.id' <<<"$proj_resp" | head -n1)
VERIFIER_ID=$(jq -r --arg n "$VERIFIER_NAME" '.data.project.services.edges[] | select(.node.name == $n) | .node.id' <<<"$proj_resp" | head -n1)

echo "  project:  $PROJECT_NAME ($PROJECT_ID)"
echo "  env:      $ENV_NAME ($ENV_ID)"
echo "  backend:  ${BACKEND_NAME} → ${BACKEND_ID:-NOT FOUND}"
echo "  verifier: ${VERIFIER_NAME} → ${VERIFIER_ID:-NOT FOUND}"
echo "  all services in project:"
jq -r '.data.project.services.edges[] | "    - \(.node.name) (\(.node.id))"' <<<"$proj_resp"

[ -n "$BACKEND_ID" ]  || abort "backend service '$BACKEND_NAME' not found"
[ -n "$VERIFIER_ID" ] || abort "verifier service '$VERIFIER_NAME' not found"

# ── Helper: read variables{} for a service (returns JSON object). ───────────
read_vars() {
  local svc_id="$1"
  jq -cn --arg p "$PROJECT_ID" --arg e "$ENV_ID" --arg s "$svc_id" \
    '{query:"query($p:String!,$e:String!,$s:String){variables(projectId:$p,environmentId:$e,serviceId:$s)}", variables:{p:$p,e:$e,s:$s}}' \
    | gql | jq -e '.data.variables // {}'
}

echo
echo "── 2. Read variables from both services"
backend_vars=$(read_vars "$BACKEND_ID")
verifier_vars=$(read_vars "$VERIFIER_ID")
backend_count=$(jq 'length' <<<"$backend_vars")
verifier_count=$(jq 'length' <<<"$verifier_vars")
echo "  backend  has $backend_count vars"
echo "  verifier has $verifier_count vars"
echo "  verifier var names BEFORE: $(jq -r 'keys | sort | join(", ")' <<<"$verifier_vars")"

echo
echo "── 3. Sanity-check backend's 4 critical values"
issues=""
for k in "${CRITICAL[@]}"; do
  v=$(jq -r --arg k "$k" '.[$k] // ""' <<<"$backend_vars")
  if [ -z "$v" ]; then
    issues="${issues}\n  - backend.$k MISSING"
  elif [ "$v" = "@field-iq/backend" ] || [[ "$v" == "<"* ]] || [ ${#v} -lt 5 ]; then
    issues="${issues}\n  - backend.$k looks bogus $(redact "$v")"
  else
    echo "  ✓ backend.$k $(redact "$v")"
  fi
done
if [ -n "$issues" ]; then
  printf 'backend env vars are not in a good state, refusing to touch the verifier:%b\n' "$issues" >&2
  exit 1
fi

# ── Helper: upsert a single var. ────────────────────────────────────────────
upsert_var() {
  local svc_id="$1" name="$2" value="$3"
  local resp
  resp=$(jq -cn --arg p "$PROJECT_ID" --arg e "$ENV_ID" --arg s "$svc_id" --arg n "$name" --arg v "$value" \
    '{query:"mutation($i:VariableUpsertInput!){variableUpsert(input:$i)}", variables:{i:{projectId:$p,environmentId:$e,serviceId:$s,name:$n,value:$v}}}' \
    | gql)
  if jq -e '.errors' <<<"$resp" >/dev/null 2>&1; then
    echo "::error::variableUpsert $name failed: $(jq -r '.errors[].message' <<<"$resp")"
    return 1
  fi
}

echo
echo "── 4. Upsert 4 critical values + VERIFIER_MOCK=false onto verifier"
for k in "${CRITICAL[@]}"; do
  v=$(jq -r --arg k "$k" '.[$k]' <<<"$backend_vars")
  upsert_var "$VERIFIER_ID" "$k" "$v"
  echo "  ✓ wrote $k $(redact "$v")"
done
upsert_var "$VERIFIER_ID" "VERIFIER_MOCK" "false"
echo "  ✓ wrote VERIFIER_MOCK=false"

echo
echo "── 5. Delete spurious vars on verifier"
deleted=0
keep_pattern=" $(printf '%s ' "${KEEP[@]}")"
for k in $(jq -r 'keys[]' <<<"$verifier_vars"); do
  case "$keep_pattern" in
    *" $k "*) continue ;;
  esac
  resp=$(jq -cn --arg p "$PROJECT_ID" --arg e "$ENV_ID" --arg s "$VERIFIER_ID" --arg n "$k" \
    '{query:"mutation($i:VariableDeleteInput!){variableDelete(input:$i)}", variables:{i:{projectId:$p,environmentId:$e,serviceId:$s,name:$n}}}' \
    | gql)
  if jq -e '.errors' <<<"$resp" >/dev/null 2>&1; then
    echo "  ! could not delete $k: $(jq -r '.errors[].message' <<<"$resp")"
  else
    echo "  - deleted $k"
    deleted=$((deleted+1))
  fi
done
echo "  removed $deleted vars"

echo
echo "── 6. Confirm post-state"
after=$(read_vars "$VERIFIER_ID")
echo "  verifier var names AFTER: $(jq -r 'keys | sort | join(", ")' <<<"$after")"
# Re-assert the 5 vars are present and match.
missing_after=""
for k in "${KEEP[@]}"; do
  v=$(jq -r --arg k "$k" '.[$k] // ""' <<<"$after")
  if [ -z "$v" ]; then missing_after="$missing_after $k"; fi
done
if [ -n "$missing_after" ]; then
  abort "post-write check failed; missing on verifier:$missing_after"
fi

echo
echo "── 7. Trigger verifier redeploy"
deploy_resp=$(jq -cn --arg e "$ENV_ID" --arg s "$VERIFIER_ID" \
  '{query:"mutation($e:String!,$s:String!){serviceInstanceRedeploy(environmentId:$e,serviceId:$s)}", variables:{e:$e,s:$s}}' \
  | gql)
if jq -e '.errors' <<<"$deploy_resp" >/dev/null 2>&1; then
  echo "  serviceInstanceRedeploy unavailable: $(jq -r '.errors[].message' <<<"$deploy_resp")"
  echo "  trying serviceInstanceDeployV2…"
  deploy_resp=$(jq -cn --arg e "$ENV_ID" --arg s "$VERIFIER_ID" \
    '{query:"mutation($e:String!,$s:String!){serviceInstanceDeployV2(environmentId:$e,serviceId:$s)}", variables:{e:$e,s:$s}}' \
    | gql)
  if jq -e '.errors' <<<"$deploy_resp" >/dev/null 2>&1; then
    abort "both redeploy mutations failed: $(jq -r '.errors[].message' <<<"$deploy_resp")"
  fi
fi
echo "  redeploy mutation accepted"

echo
echo "── 8. Poll latest verifier deployment (max 5 min)"
sleep 8
deadline=$(( $(date +%s) + 300 ))
final_status=""
deployment_id=""
while [ "$(date +%s)" -lt "$deadline" ]; do
  d=$(jq -cn --arg p "$PROJECT_ID" --arg e "$ENV_ID" --arg s "$VERIFIER_ID" \
    '{query:"query($p:String!,$e:String!,$s:String!){deployments(first:1,input:{projectId:$p,environmentId:$e,serviceId:$s}){edges{node{id status createdAt}}}}", variables:{p:$p,e:$e,s:$s}}' \
    | gql)
  deployment_id=$(jq -r '.data.deployments.edges[0].node.id // ""' <<<"$d")
  status=$(jq -r '.data.deployments.edges[0].node.status // ""' <<<"$d")
  echo "  $(date -u +%H:%M:%S) deployment=${deployment_id:-?} status=${status:-?}"
  case "$status" in
    SUCCESS|FAILED|CRASHED|REMOVED) final_status="$status"; break ;;
  esac
  sleep 10
done
[ -n "$final_status" ] || echo "::warning::deployment did not reach a terminal state inside 5 min"

echo
echo "── 9. Last 50 runtime log lines"
if [ -n "$deployment_id" ]; then
  logs=$(jq -cn --arg id "$deployment_id" --argjson limit 50 \
    '{query:"query($id:String!,$limit:Int){deploymentLogs(deploymentId:$id,limit:$limit){timestamp message severity}}", variables:{id:$id, limit:$limit}}' \
    | gql)
  if jq -e '.data.deploymentLogs' <<<"$logs" >/dev/null 2>&1 && [ "$(jq '.data.deploymentLogs | length' <<<"$logs")" != "0" ]; then
    jq -r '.data.deploymentLogs[] | "  [\(.severity // "info")] \(.message)"' <<<"$logs"
  else
    echo "  (no runtime logs — falling back to build logs)"
    build=$(jq -cn --arg id "$deployment_id" --argjson limit 50 \
      '{query:"query($id:String!,$limit:Int){buildLogs(deploymentId:$id,limit:$limit){timestamp message severity}}", variables:{id:$id,limit:$limit}}' \
      | gql)
    jq -r '.data.buildLogs[]? | "  [build/\(.severity // "info")] \(.message)"' <<<"$build" || true
  fi
fi

echo
echo "── 10. Backend USE_MOCK_VERIFIER toggle"
if [ "$FLIP_BACKEND" = "true" ]; then
  current=$(jq -r '.USE_MOCK_VERIFIER // ""' <<<"$backend_vars")
  if [ "$current" = "false" ]; then
    echo "  already false on backend, no change"
  else
    upsert_var "$BACKEND_ID" "USE_MOCK_VERIFIER" "false"
    echo "  ✓ backend USE_MOCK_VERIFIER=false (was: ${current:-unset})"
    redeploy_resp=$(jq -cn --arg e "$ENV_ID" --arg s "$BACKEND_ID" \
      '{query:"mutation($e:String!,$s:String!){serviceInstanceRedeploy(environmentId:$e,serviceId:$s)}", variables:{e:$e,s:$s}}' \
      | gql)
    if jq -e '.errors' <<<"$redeploy_resp" >/dev/null 2>&1; then
      echo "  ! backend redeploy failed: $(jq -r '.errors[].message' <<<"$redeploy_resp")"
    else
      echo "  ✓ backend redeploy triggered"
    fi
  fi
else
  echo "  FLIP_BACKEND=false — leaving backend USE_MOCK_VERIFIER as-is"
fi

echo
echo "── DONE. final verifier deployment status: ${final_status:-unknown}"
[ "$final_status" = "SUCCESS" ] || [ -z "$final_status" ] || exit 2
