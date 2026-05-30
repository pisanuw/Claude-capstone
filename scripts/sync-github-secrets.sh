#!/usr/bin/env bash
#
# sync-github-secrets.sh — push values from a local .env file to a GitHub
# repository's Actions secrets.
#
# GitHub does NOT expose secret values via the API once set, so this script
# can only:
#   - list existing secret NAMES on the repo
#   - upload values from .env
#   - report a diff (new vs. updated vs. orphan vs. skipped-empty)
#
# Empty .env values are SKIPPED (not pushed as empty strings) so that real
# secrets already on GitHub are not accidentally wiped.
#
# Usage:
#   scripts/sync-github-secrets.sh [--env <file>] [--repo <owner/name>]
#                                  [--app actions|dependabot|codespaces]
#                                  [--env-name <github-environment>]
#                                  [--yes] [--dry-run] [--allow-empty]
#
# Defaults:
#   --env       .env
#   --repo      auto-detected from `gh repo view`
#   --app       actions
#   no --yes    interactive confirmation required
#
# Requires: gh CLI (logged in). Portable bash (works on macOS bash 3.2).

set -euo pipefail

ENV_FILE=".env"
REPO=""
APP="actions"
ENV_NAME=""
ASSUME_YES=0
DRY_RUN=0
ALLOW_EMPTY=0

usage() {
    sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --env)         ENV_FILE="$2"; shift 2 ;;
        --repo)        REPO="$2"; shift 2 ;;
        --app)         APP="$2"; shift 2 ;;
        --env-name)    ENV_NAME="$2"; shift 2 ;;
        --yes|-y)      ASSUME_YES=1; shift ;;
        --dry-run|-n)  DRY_RUN=1; shift ;;
        --allow-empty) ALLOW_EMPTY=1; shift ;;
        -h|--help)     usage 0 ;;
        *) echo "unknown arg: $1" >&2; usage 1 ;;
    esac
done

# ── preflight ────────────────────────────────────────────────────────────────

command -v gh >/dev/null || { echo "gh CLI not found. Install: https://cli.github.com" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated. Run: gh auth login" >&2; exit 1; }

[ -f "$ENV_FILE" ] || { echo "env file not found: $ENV_FILE" >&2; exit 1; }

if [ -z "$REPO" ]; then
    REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
    [ -n "$REPO" ] || { echo "could not detect repo. Pass --repo owner/name" >&2; exit 1; }
fi

case "$APP" in
    actions|dependabot|codespaces) ;;
    *) echo "--app must be actions|dependabot|codespaces" >&2; exit 1 ;;
esac

GH_LIST_ARGS=(--repo "$REPO" --app "$APP")
GH_SET_ARGS=(--repo "$REPO" --app "$APP")
if [ -n "$ENV_NAME" ]; then
    [ "$APP" = "actions" ] || { echo "--env-name only valid with --app actions" >&2; exit 1; }
    GH_LIST_ARGS=(--repo "$REPO" --env "$ENV_NAME")
    GH_SET_ARGS=(--repo "$REPO" --env "$ENV_NAME")
fi

# ── helpers ──────────────────────────────────────────────────────────────────

# membership check: contains <needle> "${array[@]}"
contains() {
    local needle="$1"; shift
    local x
    for x in "$@"; do
        [ "$x" = "$needle" ] && return 0
    done
    return 1
}

# ── read existing secret names from GitHub ───────────────────────────────────

echo "==> Listing existing secrets on $REPO ($APP${ENV_NAME:+, env=$ENV_NAME})"

EXISTING=()
while IFS= read -r name; do
    [ -n "$name" ] && EXISTING+=("$name")
done < <(gh secret list "${GH_LIST_ARGS[@]}" --json name -q '.[].name' | sort)

# ── parse .env into parallel KEY / VALUE arrays ──────────────────────────────

ENV_KEYS=()
ENV_VALS=()
TO_CREATE=()
TO_UPDATE=()
TO_SKIP_EMPTY=()

line_no=0
while IFS= read -r raw || [ -n "$raw" ]; do
    line_no=$((line_no + 1))
    # strip trailing CR
    raw="${raw%$'\r'}"
    # skip blank lines
    [ -z "${raw//[[:space:]]/}" ] && continue
    # skip comments (allow leading whitespace)
    trimmed="${raw#"${raw%%[![:space:]]*}"}"
    case "$trimmed" in '#'*) continue ;; esac
    # require KEY=...
    case "$raw" in *=*) ;; *) echo "  warn: line $line_no has no '=' — skipping: $raw" >&2; continue ;; esac

    key="${raw%%=*}"
    value="${raw#*=}"
    # trim whitespace around key
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"

    # key must look like an identifier
    case "$key" in
        [A-Za-z_]*)
            # check remaining chars
            rest="${key:1}"
            bad=0
            case "$rest" in
                *[!A-Za-z0-9_]*) bad=1 ;;
            esac
            if [ "$bad" -eq 1 ]; then
                echo "  warn: skipping invalid key on line $line_no: '$key'" >&2
                continue
            fi
            ;;
        *) echo "  warn: skipping invalid key on line $line_no: '$key'" >&2; continue ;;
    esac

    # strip matching surrounding quotes
    if [ ${#value} -ge 2 ]; then
        first="${value:0:1}"
        last="${value:${#value}-1:1}"
        if { [ "$first" = '"' ] && [ "$last" = '"' ]; } \
           || { [ "$first" = "'" ] && [ "$last" = "'" ]; }; then
            value="${value:1:${#value}-2}"
        fi
    fi

    ENV_KEYS+=("$key")
    ENV_VALS+=("$value")

    if [ -z "$value" ] && [ "$ALLOW_EMPTY" -eq 0 ]; then
        TO_SKIP_EMPTY+=("$key")
        continue
    fi

    if contains "$key" "${EXISTING[@]+"${EXISTING[@]}"}"; then
        TO_UPDATE+=("$key")
    else
        TO_CREATE+=("$key")
    fi
done < "$ENV_FILE"

# orphans: exist on GitHub but not in .env
ORPHAN=()
for n in "${EXISTING[@]+"${EXISTING[@]}"}"; do
    if ! contains "$n" "${ENV_KEYS[@]+"${ENV_KEYS[@]}"}"; then
        ORPHAN+=("$n")
    fi
done

# ── diff report ──────────────────────────────────────────────────────────────

print_list() {
    label="$1"; shift
    if [ "$#" -eq 0 ]; then
        echo "  $label: (none)"
    else
        echo "  $label ($#):"
        for item in "$@"; do
            printf '    - %s\n' "$item"
        done
    fi
}

echo
echo "==> Plan for $REPO ($APP${ENV_NAME:+, env=$ENV_NAME})"
print_list "Create"                            "${TO_CREATE[@]+"${TO_CREATE[@]}"}"
print_list "Update"                            "${TO_UPDATE[@]+"${TO_UPDATE[@]}"}"
print_list "Skip (empty in .env)"              "${TO_SKIP_EMPTY[@]+"${TO_SKIP_EMPTY[@]}"}"
print_list "On GitHub, absent from .env"       "${ORPHAN[@]+"${ORPHAN[@]}"}"

TOTAL_WRITE=$(( ${#TO_CREATE[@]} + ${#TO_UPDATE[@]} ))

if [ "$TOTAL_WRITE" -eq 0 ]; then
    echo
    echo "Nothing to push."
    exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
    echo
    echo "Dry run. No changes made."
    exit 0
fi

if [ "$ASSUME_YES" -ne 1 ]; then
    echo
    printf 'Push %d secret(s) to %s? [y/N] ' "$TOTAL_WRITE" "$REPO"
    read -r ans
    case "$ans" in [Yy]*) ;; *) echo "Aborted."; exit 1 ;; esac
fi

# ── push ─────────────────────────────────────────────────────────────────────

# locate value for a key in the parallel arrays
value_of() {
    local needle="$1" i=0
    while [ "$i" -lt "${#ENV_KEYS[@]}" ]; do
        if [ "${ENV_KEYS[$i]}" = "$needle" ]; then
            printf '%s' "${ENV_VALS[$i]}"
            return 0
        fi
        i=$((i + 1))
    done
    return 1
}

push_one() {
    local key="$1"
    local value
    value="$(value_of "$key")"
    # --body-file - keeps the value out of argv
    printf '%s' "$value" | gh secret set "$key" "${GH_SET_ARGS[@]}" --body-file - >/dev/null
    echo "  ✓ $key"
}

echo
echo "==> Pushing"
for k in "${TO_CREATE[@]+"${TO_CREATE[@]}"}"; do push_one "$k"; done
for k in "${TO_UPDATE[@]+"${TO_UPDATE[@]}"}"; do push_one "$k"; done

echo
echo "Done. Wrote $TOTAL_WRITE secret(s) to $REPO."
if [ "${#ORPHAN[@]}" -gt 0 ]; then
    echo "Reminder: ${#ORPHAN[@]} secret(s) exist on GitHub but not in .env — review and delete with 'gh secret delete <NAME>' if obsolete."
fi
exit 0
