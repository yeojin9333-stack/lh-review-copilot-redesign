#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="${LH_FRONTEND_DIR:-$(cd "$BACKEND_DIR/../.." && pwd)}"
MODEL="${OLLAMA_MODEL:-qwen3.5:4b}"
EMBED_MODEL="${OLLAMA_EMBEDDING_MODEL:-embeddinggemma}"
AUTO_YES=0
SETUP_ONLY=0
DRY_RUN=0
BACKEND_PID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --frontend-dir)
      [[ $# -ge 2 ]] || { printf 'Missing value for --frontend-dir\n' >&2; exit 2; }
      FRONTEND_DIR="$2"; shift 2 ;;
    --yes) AUTO_YES=1; shift ;;
    --setup-only) SETUP_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      printf '%s\n' \
        "Usage: scripts/start_prototype_mac.sh [--frontend-dir PATH] [--yes] [--setup-only] [--dry-run]" \
        "Checks and installs Ollama, models, Python, Node.js and pnpm, then starts both servers."
      exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

confirm() {
  local prompt="$1" answer
  [[ "$AUTO_YES" -eq 1 || "$DRY_RUN" -eq 1 ]] && return
  printf '%s [y/N] ' "$prompt"
  read -r answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || die "Cancelled."
}

refresh_brew_path() {
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

install_brew() {
  have brew && return
  confirm "Homebrew is missing. Install it to prepare required tools?"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[DRY RUN] Install Homebrew from brew.sh.\n'
    return
  fi
  have curl || die "curl is required to install Homebrew."
  local installer
  installer="$(mktemp)"
  curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$installer"
  if [[ "$AUTO_YES" -eq 1 ]]; then
    NONINTERACTIVE=1 /bin/bash "$installer"
  else
    /bin/bash "$installer"
  fi
  rm -f "$installer"
  refresh_brew_path
  have brew || die "Homebrew installation completed but brew is not on PATH. Open a new terminal and retry."
}

brew_install() {
  local formula="$1" label="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[DRY RUN] Install %s with Homebrew if missing.\n' "$label"
  else
    confirm "$label is missing or too old. Install it with Homebrew?"
    brew install "$formula"
  fi
}

python_ok() {
  have python3 && python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 11))' >/dev/null 2>&1
}

node_ok() {
  have node && node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' >/dev/null 2>&1
}

wait_for_url() {
  local url="$1" attempts="${2:-30}"
  for ((attempt=1; attempt<=attempts; attempt+=1)); do
    curl -fsS --max-time 2 "$url" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

set_frontend_env() {
  local target="$FRONTEND_DIR/.env.local" key="REVIEW_COPILOT_API_URL" value="http://127.0.0.1:8000"
  if [[ ! -f "$target" ]]; then
    printf '%s=%s\n' "$key" "$value" > "$target"
  elif grep -q "^${key}=" "$target"; then
    local temp_file
    temp_file="$(mktemp)"
    sed "s|^${key}=.*|${key}=${value}|" "$target" > "$temp_file"
    mv "$temp_file" "$target"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$target"
  fi
}

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

[[ "$(uname -s)" == "Darwin" ]] || die "This script is for macOS. Use start_prototype_windows.ps1 on Windows."

step "1/6 Check package installer"
refresh_brew_path
if have brew; then
  printf 'Homebrew: %s\n' "$(brew --version | head -n 1)"
else
  install_brew
fi

step "2/6 Check Ollama and local models"
if ! have ollama; then
  brew_install "ollama" "Ollama"
else
  ollama --version
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '[DRY RUN] Start Ollama and pull %s and %s only when absent.\n' "$MODEL" "$EMBED_MODEL"
else
  mkdir -p "$BACKEND_DIR/data"
  if ! curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    nohup ollama serve >"$BACKEND_DIR/data/ollama.log" 2>&1 &
    wait_for_url http://127.0.0.1:11434/api/tags 30 || die "Ollama did not start. See data/ollama.log."
  fi
  ollama show "$MODEL" >/dev/null 2>&1 || ollama pull "$MODEL"
  ollama show "$EMBED_MODEL" >/dev/null 2>&1 || ollama pull "$EMBED_MODEL"
fi

step "3/6 Check Python and prepare FastAPI"
if python_ok; then
  printf 'Python: %s\n' "$(python3 --version)"
else
  brew_install "python@3.13" "Python 3.11 or later"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    PYTHON_PREFIX="$(brew --prefix python@3.13)"
    export PATH="$PYTHON_PREFIX/bin:$PATH"
    python_ok || die "Python 3.11 or later was not found after installation."
  fi
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '[DRY RUN] Create the backend virtual environment, install dependencies, and create .env when absent.\n'
else
  if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
    python3 -m venv "$BACKEND_DIR/.venv"
  fi
  if ! "$BACKEND_DIR/.venv/bin/python" -c 'import fastapi, uvicorn, pydantic, openpyxl, pypdf, docx, pptx, multipart' >/dev/null 2>&1; then
    "$BACKEND_DIR/.venv/bin/python" -m pip install -e "$BACKEND_DIR[dev]"
  else
    printf 'FastAPI dependencies: already installed\n'
  fi
  [[ -f "$BACKEND_DIR/.env" ]] || cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
fi

step "4/6 Check Node.js and pnpm"
if node_ok; then
  printf 'Node.js: %s\n' "$(node --version)"
else
  brew_install "node" "Node.js 22.13 or later"
  [[ "$DRY_RUN" -eq 1 ]] || node_ok || die "Node.js 22.13 or later was not found after installation."
fi
if have pnpm; then
  printf 'pnpm: %s\n' "$(pnpm --version)"
else
  brew_install "pnpm" "pnpm"
  [[ "$DRY_RUN" -eq 1 ]] || have pnpm || die "pnpm was not found after installation."
fi

step "5/6 Configure and install frontend"
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '[DRY RUN] Validate %s, set .env.local, verify approved package builds, and install locked dependencies.\n' "$FRONTEND_DIR"
else
  [[ -f "$FRONTEND_DIR/package.json" && -f "$FRONTEND_DIR/pnpm-lock.yaml" ]] || \
    die "Frontend not found at $FRONTEND_DIR. Use --frontend-dir PATH."
  set_frontend_env
  (
    cd "$FRONTEND_DIR"
    pnpm install --frozen-lockfile
  )
fi

step "6/6 Complete"
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf 'Dry run complete. Nothing was installed, changed, or started.\n'
elif [[ "$SETUP_ONLY" -eq 1 ]]; then
  printf 'Setup complete. Run scripts/start_prototype_mac.sh to start both servers.\n'
else
  if curl -fsS --max-time 2 http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
    printf 'FastAPI: already running at http://127.0.0.1:8000\n'
  else
    mkdir -p "$BACKEND_DIR/data"
    (
      cd "$BACKEND_DIR"
      set -a
      source "$BACKEND_DIR/.env"
      set +a
      exec "$BACKEND_DIR/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
    ) >"$BACKEND_DIR/data/fastapi.log" 2>&1 &
    BACKEND_PID="$!"
    wait_for_url http://127.0.0.1:8000/api/v1/health 30 || die "FastAPI did not start. See data/fastapi.log."
    printf 'FastAPI: http://127.0.0.1:8000  Docs: http://127.0.0.1:8000/docs\n'
  fi
  printf 'Frontend is starting. Press Ctrl+C to stop this session.\n'
  cd "$FRONTEND_DIR"
  pnpm dev
fi
