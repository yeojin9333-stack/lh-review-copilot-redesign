# LH Review Copilot AI — Ollama Edition

기존 OpenAI 버전을 수정하지 않고 별도 폴더로 만든 무료 로컬 LLM·RAG 서버입니다.
프런트가 사용하는 REST API 경로와 응답 형식은 기존 서버와 동일합니다.

- 생성 모델 기본값: `qwen3.5:4b`
- 임베딩 기본값: `embeddinggemma`
- 모델 실행: 로컬 Ollama `http://127.0.0.1:11434`
- RAG 저장소: SQLite 벡터 + FTS5 키워드 검색
- 지원 문서: CSV, PDF, DOCX, PPTX, XLSX, JSON, TXT, Markdown
- OpenAI API 키 및 호출 비용: 없음

## 전체 자동 실행

아래 통합 스크립트 하나가 설치 여부와 버전을 확인하고, 없는 항목만 설치합니다.

- Ollama 및 생성·임베딩 모델
- Python 3.11 이상과 백엔드 가상환경
- Node.js 22.13 이상과 pnpm
- pnpm 네이티브 빌드 승인 및 프런트 의존성
- 백엔드 `.env`와 프런트 `.env.local`
- FastAPI와 프런트 개발 서버

macOS:

```bash
chmod +x scripts/start_prototype_mac.sh
./scripts/start_prototype_mac.sh --dry-run
./scripts/start_prototype_mac.sh --yes
```

Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start_prototype_windows.ps1 -DryRun
.\scripts\start_prototype_windows.ps1 -Yes
```

`--yes`/`-Yes`를 빼면 설치가 필요할 때마다 확인합니다. 설치만 하고 서버를
시작하지 않으려면 macOS는 `--setup-only`, Windows는 `-SetupOnly`를 사용합니다.
최초 모델 다운로드는 수 GB의 네트워크와 디스크 공간을 사용할 수 있습니다.

현재 통합본에서는 기본 프런트 경로가 프로젝트 루트입니다. 백엔드 폴더만 다른
위치로 옮긴 경우에만 경로를 지정합니다.

```bash
./scripts/start_prototype_mac.sh --frontend-dir "/다른/경로/lh-review-copilot"
```

```powershell
.\scripts\start_prototype_windows.ps1 -FrontendDir "D:\프로젝트\lh-review-copilot"
```

백엔드만 실행하는 기존 스크립트도 유지됩니다.

```text
macOS:   scripts/start_ollama_mac.sh
Windows: scripts/start_ollama_windows.ps1
```

확인 주소:

- 상태: `http://127.0.0.1:8000/api/v1/health`
- API 문서: `http://127.0.0.1:8000/docs`

## 프런트 연결

통합 스크립트가 프로젝트 루트의 `.env.local`을 만들거나 기존 값을 갱신합니다.

```text
REVIEW_COPILOT_API_URL=http://127.0.0.1:8000
```

기존 프런트의 `/api/ai/*` 프록시가 이 서버를 호출하므로 프런트 코드는 변경할
필요가 없습니다. `/review`에서 다음 기능을 사용할 수 있습니다.

- Ollama 연결 상태와 RAG 문서 수 확인
- CSV·문서 등록
- 실시간 검토 패키지 생성
- 출처와 미확인정보 표시
- 등록 자료 기반 후속 질문

## CSV 등록

초기 자료는 `knowledge/inbox/`에 넣습니다. 서버 실행 후 다음 명령으로 등록합니다.

macOS/Linux:

```bash
./scripts/upload_inbox.sh --project-id mvp-ramp
```

Windows:

```powershell
.\scripts\upload_inbox.ps1 -ProjectId mvp-ramp
```

프런트 화면의 `RAG 자료 추가`를 사용하면 이 폴더에 복사하지 않고 직접 등록됩니다.

## 수동 실행(문제 해결용)

```bash
ollama pull qwen3.5:4b
ollama pull embeddinggemma

python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
cp .env.example .env
set -a && source .env && set +a
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Docker로 FastAPI만 실행할 수도 있습니다. 이 경우 Ollama는 호스트 PC에서 먼저
실행되어야 합니다.

```bash
cp .env.example .env
docker compose up --build
```

Compose는 컨테이너에서 `host.docker.internal:11434`의 Ollama로 연결합니다.

## 환경설정

| 이름 | 기본값 | 설명 |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama 주소 |
| `OLLAMA_MODEL` | `qwen3.5:4b` | 생성 모델 |
| `OLLAMA_EMBEDDING_MODEL` | `embeddinggemma` | 임베딩 모델 |
| `OLLAMA_CONTEXT_TOKENS` | `8192` | 문맥 크기 |
| `OLLAMA_MAX_OUTPUT_TOKENS` | `2000` | 최대 생성 토큰 |
| `DEFAULT_TOP_K` | `4` | 기본 검색 청크 수 |

메모리가 부족하면 더 작은 Ollama 모델로 `OLLAMA_MODEL`을 변경할 수 있습니다.
모델을 변경하면 이전 모델로 만든 임베딩과 섞이지 않도록 `data/`를 별도로 관리합니다.

## 비용과 배포 제한

- Ollama 로컬 실행에는 API 요금이 없지만 PC 전력·메모리·디스크를 사용합니다.
- 로컬 Ollama는 해당 PC에서만 접근할 수 있습니다.
- 공개 Sites 프런트에서 사용하려면 FastAPI와 Ollama를 접근 가능한 별도 서버에
  배치하고 HTTPS 및 인증을 추가해야 합니다.
- 실제 LH 자료를 사용하기 전에 PC 저장·접근권한·감사로그 정책을 확인합니다.

공식 문서:

- https://ollama.com/download
- https://docs.ollama.com/capabilities/embeddings
- https://ollama.com/blog/structured-outputs

## 비용 없는 오프라인 테스트

```bash
python -m pytest
python -m compileall -q app tests
bash -n scripts/start_ollama_mac.sh scripts/start_prototype_mac.sh scripts/upload_inbox.sh
./scripts/start_prototype_mac.sh --dry-run --yes
docker compose config --quiet
```

테스트는 Ollama 서버나 외부 API를 호출하지 않고 가짜 응답을 사용합니다.
