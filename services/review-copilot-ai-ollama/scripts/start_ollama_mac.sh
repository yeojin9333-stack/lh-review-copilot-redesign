#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
MODEL="${OLLAMA_MODEL:-qwen3.5:4b}"
EMBED_MODEL="${OLLAMA_EMBEDDING_MODEL:-embeddinggemma}"
AUTO_YES=0
SETUP_ONLY=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) AUTO_YES=1; shift ;;
    --setup-only) SETUP_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      printf '%s\n' \
        "Usage: scripts/start_ollama_mac.sh [--yes] [--setup-only] [--dry-run]" \
        "Installs Ollama if needed, pulls local models, prepares Python, and starts FastAPI."
      exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

confirm() {
  local prompt="$1" answer
  [[ "$AUTO_YES" -eq 1 ]] && return
  printf '%s [y/N] ' "$prompt"
  read -r answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || die "Cancelled."
}

step "1/5 Check Ollama"
if ! have ollama; then
  confirm "Ollama is missing. Install it from ollama.com?"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[DRY RUN] Download and run the official Ollama installer.\n'
  else
    have curl || die "curl is required to install Ollama."
    installer="$(mktemp)"
    trap 'rm -f "$installer"' EXIT
    curl -fsSL https://ollama.com/install.sh -o "$installer"
    sh "$installer"
  fi
else
  ollama --version
fi

step "2/5 Start Ollama"
have curl || die "curl is required to check the Ollama service."
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '[DRY RUN] Start Ollama and wait for http://127.0.0.1:11434/api/tags.\n'
elif ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  mkdir -p "$PROJECT_DIR/data"
  nohup ollama serve >"$PROJECT_DIR/data/ollama.log" 2>&1 &
  for _ in $(seq 1 30); do
    curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
    sleep 1
  done
  curl -fsS http://127.0.0.1:11434/api/tags >/dev/null || die "Ollama did not start. See data/ollama.log."
fi

step "3/5 Pull local models"
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '[DRY RUN] ollama pull %s\n' "$MODEL"
  printf '[DRY RUN] ollama pull %s\n' "$EMBED_MODEL"
else
  ollama pull "$MODEL"
  ollama pull "$EMBED_MODEL"
fi

step "4/5 Prepare FastAPI"
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '[DRY RUN] Create .venv, install project, and create .env.\n'
else
  have python3 || die "Python 3.11 or later is required."
  python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 11))' || die "Python 3.11 or later is required."
  [[ -d "$PROJECT_DIR/.venv" ]] || python3 -m venv "$PROJECT_DIR/.venv"
  "$PROJECT_DIR/.venv/bin/python" -m pip install -e "$PROJECT_DIR[dev]"
  [[ -f "$ENV_FILE" ]] || cp "$PROJECT_DIR/.env.example" "$ENV_FILE"
fi

step "5/5 Complete"
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf 'Dry run complete. Nothing was installed or started.\n'
elif [[ "$SETUP_ONLY" -eq 1 ]]; then
  printf 'Setup complete. Run scripts/start_ollama_mac.sh to start the API.\n'
else
  set -a
  source "$ENV_FILE"
  set +a
  printf 'FastAPI: http://127.0.0.1:8000  Docs: http://127.0.0.1:8000/docs\n'
  exec "$PROJECT_DIR/.venv/bin/python" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
fi
