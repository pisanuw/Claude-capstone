#!/usr/bin/env bash
#
# test-secrets.sh — validate keys in .env by calling each service's API.
#
# - Reads .env (default) and runs a per-service check using `curl`.
# - Empty / config-only / local-only values are SKIPPED with a reason.
# - Secret values are NEVER echoed to stdout. Response bodies are stored in a
#   temp file scoped to the run and deleted on exit.
#
# Usage:
#   scripts/test-secrets.sh [--env <file>] [--only <KEY[,KEY...]>] [--verbose]
#
# Exit code: 0 if no FAIL, 1 if any check failed.
#
# Requires: bash 3.2+, curl. Optional: psql (Neon DATABASE_URL check).

set -uo pipefail

ENV_FILE=".env"
VERBOSE=0
ONLY=""

while [ $# -gt 0 ]; do
    case "$1" in
        --env)     ENV_FILE="$2"; shift 2 ;;
        --only)    ONLY="$2"; shift 2 ;;
        --verbose|-v) VERBOSE=1; shift ;;
        -h|--help) sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 1 ;;
    esac
done

command -v curl >/dev/null || { echo "curl required" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "env file not found: $ENV_FILE" >&2; exit 1; }

TMP="$(mktemp -t test-secrets.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

OK=0
FAIL=0
SKIP=0
EMPTY=0

# ── env helpers ──────────────────────────────────────────────────────────────

# get_env KEY → prints value or empty string
get_env() {
    local key="$1"
    local line
    line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" 2>/dev/null | head -1 || true)"
    [ -z "$line" ] && return 0
    local value="${line#*=}"
    # strip matching surrounding quotes
    if [ ${#value} -ge 2 ]; then
        local first="${value:0:1}" last="${value:${#value}-1:1}"
        if { [ "$first" = '"' ] && [ "$last" = '"' ]; } \
           || { [ "$first" = "'" ] && [ "$last" = "'" ]; }; then
            value="${value:1:${#value}-2}"
        fi
    fi
    printf '%s' "$value"
}

# requested KEY → 0 if --only filter allows it, 1 otherwise
requested() {
    [ -z "$ONLY" ] && return 0
    case ",$ONLY," in *",$1,"*) return 0 ;; esac
    return 1
}

# ── result printing ──────────────────────────────────────────────────────────

ok()    { OK=$((OK+1));     printf '  \033[32m✓\033[0m %-30s %s\n' "$1" "${2:-}"; }
fail()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %-30s %s\n' "$1" "${2:-}"; }
skip()  { SKIP=$((SKIP+1)); printf '  \033[33m-\033[0m %-30s %s\n' "$1" "${2:-skipped}"; }
empty() { EMPTY=$((EMPTY+1));printf '    %-30s %s\n' "$1" "(empty)"; }

verbose() { [ "$VERBOSE" -eq 1 ] && printf '      %s\n' "$1" >&2 || true; }

# ── HTTP helper ──────────────────────────────────────────────────────────────
#
# http_check LABEL URL [curl args...]
# - prints OK on 2xx, FAIL otherwise
# - returns the http code via global HTTP_CODE
# - body is in $TMP for verbose output

HTTP_CODE=0
http_check() {
    local label="$1" url="$2"; shift 2
    HTTP_CODE="$(curl -sS -o "$TMP" -w '%{http_code}' --max-time 15 "$url" "$@" 2>>"$TMP" || echo 000)"
    verbose "GET ${url%%\?*} → $HTTP_CODE"
    case "$HTTP_CODE" in
        2*) ok "$label" "[$HTTP_CODE]"; return 0 ;;
        *)  local detail
            detail="$(head -c 200 "$TMP" 2>/dev/null | tr -d '\n\r' || true)"
            fail "$label" "[$HTTP_CODE] ${detail:-no body}"
            return 1
        ;;
    esac
}

# ── individual checks ────────────────────────────────────────────────────────

check_anthropic() {
    requested ANTHROPIC_API_KEY || return 0
    local k; k="$(get_env ANTHROPIC_API_KEY)"
    [ -z "$k" ] && { empty ANTHROPIC_API_KEY; return 0; }
    http_check ANTHROPIC_API_KEY "https://api.anthropic.com/v1/models" \
        -H "x-api-key: $k" -H "anthropic-version: 2023-06-01"
}

check_github() {
    requested GITHUB_TOKEN || return 0
    local k; k="$(get_env GITHUB_TOKEN)"
    [ -z "$k" ] && { empty GITHUB_TOKEN; return 0; }
    http_check GITHUB_TOKEN "https://api.github.com/user" \
        -H "Authorization: Bearer $k" -H "Accept: application/vnd.github+json"
}

check_netlify() {
    requested NETLIFY_AUTH_TOKEN || return 0
    local k; k="$(get_env NETLIFY_AUTH_TOKEN)"
    [ -z "$k" ] && { empty NETLIFY_AUTH_TOKEN; return 0; }
    http_check NETLIFY_AUTH_TOKEN "https://api.netlify.com/api/v1/user" \
        -H "Authorization: Bearer $k"
}

check_render() {
    requested RENDER_API_KEY || return 0
    local k; k="$(get_env RENDER_API_KEY)"
    [ -z "$k" ] && { empty RENDER_API_KEY; return 0; }
    http_check RENDER_API_KEY "https://api.render.com/v1/owners" \
        -H "Authorization: Bearer $k" -H "Accept: application/json"
}

# Resend: send-restricted keys legitimately return 401 with body
# {"name":"restricted_api_key"} on /domains. That means the key authenticated;
# it just lacks scope. Treat that case as OK.
_resend_check() {
    local label="$1" k="$2"
    HTTP_CODE="$(curl -sS -o "$TMP" -w '%{http_code}' --max-time 15 \
        "https://api.resend.com/domains" -H "Authorization: Bearer $k" 2>>"$TMP" || echo 000)"
    verbose "GET api.resend.com/domains → $HTTP_CODE"
    case "$HTTP_CODE" in
        2*) ok "$label" "[$HTTP_CODE]" ;;
        401) if grep -q 'restricted_api_key' "$TMP" 2>/dev/null; then
                 ok "$label" "[401 restricted send-only key, format valid]"
             else
                 fail "$label" "[401] $(head -c 200 "$TMP" | tr -d '\n\r')"
             fi ;;
        *)  fail "$label" "[$HTTP_CODE] $(head -c 200 "$TMP" | tr -d '\n\r')" ;;
    esac
}

check_resend() {
    requested RESEND_API_KEY || return 0
    local k; k="$(get_env RESEND_API_KEY)"
    [ -z "$k" ] && { empty RESEND_API_KEY; return 0; }
    _resend_check RESEND_API_KEY "$k"
}

check_resend_smtp() {
    requested AUTH_SMTP_PASS || return 0
    local k; k="$(get_env AUTH_SMTP_PASS)"
    [ -z "$k" ] && { empty AUTH_SMTP_PASS; return 0; }
    _resend_check AUTH_SMTP_PASS "$k"
}

check_google_search() {
    requested GOOGLE_API_KEY || return 0
    local k cx
    k="$(get_env GOOGLE_API_KEY)"
    cx="$(get_env GOOGLE_CX)"
    if [ -z "$k" ]; then empty GOOGLE_API_KEY; return 0; fi
    if [ -z "$cx" ]; then skip GOOGLE_API_KEY "needs GOOGLE_CX"; return 0; fi
    # This consumes a Custom Search quota unit.
    http_check GOOGLE_API_KEY "https://www.googleapis.com/customsearch/v1?key=$k&cx=$cx&q=ping&num=1"
}

check_supabase_service() {
    requested SUPABASE_SERVICE_ROLE_KEY || return 0
    local url k
    url="$(get_env SUPABASE_URL)"
    k="$(get_env SUPABASE_SERVICE_ROLE_KEY)"
    if [ -z "$k" ]; then empty SUPABASE_SERVICE_ROLE_KEY; return 0; fi
    if [ -z "$url" ]; then skip SUPABASE_SERVICE_ROLE_KEY "SUPABASE_URL empty"; return 0; fi
    http_check SUPABASE_SERVICE_ROLE_KEY "${url%/}/rest/v1/" \
        -H "apikey: $k" -H "Authorization: Bearer $k"
}

check_supabase_anon() {
    requested VITE_SUPABASE_ANON_KEY || return 0
    local url k
    url="$(get_env VITE_SUPABASE_URL)"
    k="$(get_env VITE_SUPABASE_ANON_KEY)"
    if [ -z "$k" ]; then empty VITE_SUPABASE_ANON_KEY; return 0; fi
    if [ -z "$url" ]; then skip VITE_SUPABASE_ANON_KEY "VITE_SUPABASE_URL empty"; return 0; fi
    # /auth/v1/settings accepts anon/publishable keys; /rest/v1/ requires secret.
    http_check VITE_SUPABASE_ANON_KEY "${url%/}/auth/v1/settings" \
        -H "apikey: $k"
}

check_database_url() {
    requested DATABASE_URL || return 0
    local url; url="$(get_env DATABASE_URL)"
    [ -z "$url" ] && { empty DATABASE_URL; return 0; }
    if ! command -v psql >/dev/null 2>&1; then
        skip DATABASE_URL "psql not installed"
        return 0
    fi
    local out
    out="$(PGCONNECT_TIMEOUT=10 psql "$url" -tAc "SELECT 'pg-ok'" 2>&1)"
    if [ "$out" = "pg-ok" ]; then
        ok DATABASE_URL "psql SELECT 1 → ok"
    else
        fail DATABASE_URL "$(printf '%s' "$out" | head -c 200)"
    fi
}

check_upstash() {
    requested UPSTASH_REDIS_REST_URL || return 0
    local url tok
    url="$(get_env UPSTASH_REDIS_REST_URL)"
    tok="$(get_env UPSTASH_REDIS_REST_TOKEN)"
    if [ -z "$url" ] && [ -z "$tok" ]; then empty UPSTASH_REDIS_REST_URL; return 0; fi
    if [ -z "$url" ]; then skip UPSTASH_REDIS_REST_URL "URL empty"; return 0; fi
    if [ -z "$tok" ]; then skip UPSTASH_REDIS_REST_URL "token empty"; return 0; fi
    case "$url" in
        https://*) ;;
        *) fail UPSTASH_REDIS_REST_URL "URL must be https://*.upstash.io (got non-URL)"; return 0 ;;
    esac
    http_check UPSTASH_REDIS_REST_URL "${url%/}/ping" -H "Authorization: Bearer $tok"
}

check_sentry() {
    requested SENTRY_AUTH_TOKEN || return 0
    local k; k="$(get_env SENTRY_AUTH_TOKEN)"
    [ -z "$k" ] && { empty SENTRY_AUTH_TOKEN; return 0; }
    http_check SENTRY_AUTH_TOKEN "https://sentry.io/api/0/projects/" \
        -H "Authorization: Bearer $k"
}

check_posthog_personal() {
    requested POSTHOG_API_KEY || return 0
    local k host
    k="$(get_env POSTHOG_API_KEY)"
    host="$(get_env POSTHOG_HOST)"
    [ -z "$k" ] && { empty POSTHOG_API_KEY; return 0; }
    [ -z "$host" ] && host="https://us.posthog.com"
    # The /api endpoints live on the app host, not the ingestion host.
    host="${host/us.i.posthog.com/us.posthog.com}"
    host="${host/eu.i.posthog.com/eu.posthog.com}"
    http_check POSTHOG_API_KEY "${host%/}/api/users/@me/" \
        -H "Authorization: Bearer $k"
}

check_posthog_project() {
    requested NEXT_PUBLIC_POSTHOG_KEY || return 0
    local k; k="$(get_env NEXT_PUBLIC_POSTHOG_KEY)"
    [ -z "$k" ] && { empty NEXT_PUBLIC_POSTHOG_KEY; return 0; }
    # phc_* is a write-only project token; only format-validate to avoid sending events.
    case "$k" in
        phc_*) ok NEXT_PUBLIC_POSTHOG_KEY "format ok (write-only token, not contacted)" ;;
        *)     fail NEXT_PUBLIC_POSTHOG_KEY "expected phc_* prefix" ;;
    esac
}

check_cloudflare() {
    requested CLOUDFLARE_API_TOKEN || return 0
    local k; k="$(get_env CLOUDFLARE_API_TOKEN)"
    [ -z "$k" ] && { empty CLOUDFLARE_API_TOKEN; return 0; }
    http_check CLOUDFLARE_API_TOKEN "https://api.cloudflare.com/client/v4/user/tokens/verify" \
        -H "Authorization: Bearer $k"
}

check_linear() {
    requested LINEAR_API_KEY || return 0
    local k; k="$(get_env LINEAR_API_KEY)"
    [ -z "$k" ] && { empty LINEAR_API_KEY; return 0; }
    http_check LINEAR_API_KEY "https://api.linear.app/graphql" \
        -X POST -H "Authorization: $k" -H "Content-Type: application/json" \
        --data '{"query":"{ viewer { id } }"}'
}

check_expo() {
    requested EXPO_TOKEN || return 0
    local k; k="$(get_env EXPO_TOKEN)"
    [ -z "$k" ] && { empty EXPO_TOKEN; return 0; }
    http_check EXPO_TOKEN "https://api.expo.dev/v2/auth/userInfo" \
        -H "Authorization: Bearer $k"
}

check_discord() {
    requested DISCORD_TOKEN || return 0
    local k; k="$(get_env DISCORD_TOKEN)"
    [ -z "$k" ] && { empty DISCORD_TOKEN; return 0; }
    http_check DISCORD_TOKEN "https://discord.com/api/v10/users/@me" \
        -H "Authorization: Bot $k"
}

check_e2b() {
    requested E2B_API_KEY || return 0
    local k; k="$(get_env E2B_API_KEY)"
    [ -z "$k" ] && { empty E2B_API_KEY; return 0; }
    # E2B exposes /sandboxes (auth required, 200 with an empty list).
    http_check E2B_API_KEY "https://api.e2b.dev/sandboxes" -H "X-API-KEY: $k"
}

# Format-only checks (no API call possible for these)
check_oauth_format() {
    local name="$1" pattern="$2" key
    requested "$name" || return 0
    key="$(get_env "$name")"
    [ -z "$key" ] && { empty "$name"; return 0; }
    case "$key" in
        $pattern) ok "$name" "format ok (OAuth secret, no API endpoint to validate)" ;;
        *)        fail "$name" "unexpected format" ;;
    esac
}

# ── run ──────────────────────────────────────────────────────────────────────

echo "==> Validating secrets in $ENV_FILE"
echo

echo "Anthropic"
check_anthropic
echo

echo "GitHub"
check_github
echo

echo "Deploy"
check_netlify
check_render
echo

echo "Email (Resend)"
check_resend
check_resend_smtp
echo

echo "Google"
check_google_search
check_oauth_format GOOGLE_CLIENT_ID      "*.apps.googleusercontent.com"
check_oauth_format GOOGLE_CLIENT_SECRET  "GOCSPX-*"
check_oauth_format AUTH_GOOGLE_ID        "*.apps.googleusercontent.com"
check_oauth_format AUTH_GOOGLE_SECRET    "GOCSPX-*"
echo

echo "Database"
check_database_url
echo

echo "Supabase"
check_supabase_service
check_supabase_anon
echo

echo "Upstash Redis"
check_upstash
echo

echo "Sentry"
check_sentry
echo

echo "PostHog"
check_posthog_personal
check_posthog_project
echo

echo "Cloudflare"
check_cloudflare
echo

echo "Linear"
check_linear
echo

echo "Expo EAS"
check_expo
echo

echo "Discord"
check_discord
echo

echo "E2B"
check_e2b
echo

printf "Summary: %d ok, %d fail, %d skip, %d empty\n" "$OK" "$FAIL" "$SKIP" "$EMPTY"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
