#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

API_URL="${REVIEW_COPILOT_API_URL:-http://127.0.0.1:8000}"
INBOX_DIR="${KNOWLEDGE_INBOX_DIR:-$PROJECT_DIR/knowledge/inbox}"
PROJECT_ID="${SEED_PROJECT_ID:-mvp-ramp}"
SOURCE_KIND="${SEED_SOURCE_KIND:-seed_file}"
DRY_RUN=0

usage() {
  printf '%s\n' \
    "Usage: scripts/upload_inbox.sh [options]" \
    "" \
    "Options:" \
    "  --api-url URL         Review Copilot API address" \
    "  --inbox DIR           Folder containing CSV/documents" \
    "  --project-id ID       Project ID attached to every file" \
    "  --source-kind KIND    Source type attached to every file" \
    "  --dry-run             List files without uploading" \
    "  -h, --help            Show this help"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url) API_URL="$2"; shift 2 ;;
    --inbox) INBOX_DIR="$2"; shift 2 ;;
    --project-id) PROJECT_ID="$2"; shift 2 ;;
    --source-kind) SOURCE_KIND="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage; exit 2 ;;
  esac
done

command -v curl >/dev/null 2>&1 || {
  printf 'curl is required. Run scripts/start_ollama_mac.sh to prepare prerequisites.\n' >&2
  exit 1
}

[[ -d "$INBOX_DIR" ]] || {
  printf 'Inbox does not exist: %s\n' "$INBOX_DIR" >&2
  exit 1
}

supported_file() {
  local name lower
  name="$(basename "$1")"
  lower="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"
  [[ "$name" != .* ]] && [[ "$lower" =~ \.(csv|pdf|docx|pptx|xlsx|json|txt|md)$ ]]
}

if [[ "$DRY_RUN" -eq 0 ]]; then
  curl --fail --silent --show-error "$API_URL/api/v1/health" >/dev/null || {
    printf 'API is not ready: %s\n' "$API_URL" >&2
    exit 1
  }
fi

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

found=0
uploaded=0
failed=0
while IFS= read -r -d '' file; do
  supported_file "$file" || continue
  found=$((found + 1))
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[DRY RUN] %s\n' "$file"
    continue
  fi

  printf 'Uploading: %s\n' "$(basename "$file")"
  : > "$response_file"
  if ! status="$(curl --silent --show-error \
    --output "$response_file" \
    --write-out '%{http_code}' \
    --request POST "$API_URL/api/v1/knowledge/documents" \
    --form "files=@$file" \
    --form "source_kind=$SOURCE_KIND" \
    --form "project_id=$PROJECT_ID")"; then
    status="000"
  fi

  if [[ "$status" == "200" ]]; then
    uploaded=$((uploaded + 1))
    printf '  OK: '
    tr '\n' ' ' < "$response_file"
    printf '\n'
  else
    failed=$((failed + 1))
    printf '  FAILED (HTTP %s): ' "$status" >&2
    tr '\n' ' ' < "$response_file" >&2
    printf '\n' >&2
  fi
done < <(find "$INBOX_DIR" -maxdepth 1 -type f -print0)

if [[ "$found" -eq 0 ]]; then
  printf 'No supported files found in %s\n' "$INBOX_DIR"
elif [[ "$DRY_RUN" -eq 1 ]]; then
  printf 'Dry run complete: %d supported file(s).\n' "$found"
else
  printf 'Upload complete: %d succeeded, %d failed.\n' "$uploaded" "$failed"
fi

[[ "$failed" -eq 0 ]]
