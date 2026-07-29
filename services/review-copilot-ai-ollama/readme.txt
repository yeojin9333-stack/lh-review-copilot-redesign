LH REVIEW COPILOT AI - OLLAMA 무료 로컬 버전
================================================

이 폴더는 기존 OpenAI 버전과 분리된 Ollama 전용 FastAPI 서버다.
기존 폴더 review-copilot-ai의 소스는 수정하지 않는다.
통합 실행 시 프런트 소스는 유지하고 .env.local, pnpm 설치 설정과 node_modules만 준비한다.

기본 모델
---------

생성: qwen3.5:4b
임베딩: embeddinggemma
Ollama: http://127.0.0.1:11434
FastAPI: http://127.0.0.1:8000
API 호출비: 없음


macOS 전체 자동 실행
---------------------

chmod +x scripts/start_prototype_mac.sh
./scripts/start_prototype_mac.sh --dry-run
./scripts/start_prototype_mac.sh --yes

스크립트가 Homebrew, Ollama, 모델, Python, Node.js, pnpm을 확인하고 없는 항목만
설치한다. 백엔드와 프런트 설정 및 의존성을 준비한 뒤 두 서버를 실행한다.


Windows 전체 자동 실행
----------------------

Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start_prototype_windows.ps1 -DryRun
.\scripts\start_prototype_windows.ps1 -Yes

WinGet, Ollama, Python, Node.js, pnpm 설치 여부를 순서대로 확인한다.


기본 프런트 위치
----------------

백엔드와 같은 상위 폴더의 lh-review-copilot-2를 자동으로 찾는다.
다른 위치에 있을 때만 아래처럼 지정한다.

프런트가 다른 위치에 있을 때
-----------------------------

macOS:
./scripts/start_prototype_mac.sh --frontend-dir "/다른/경로/lh-review-copilot-2"

Windows:
.\scripts\start_prototype_windows.ps1 -FrontendDir "D:\프로젝트\lh-review-copilot-2"


통합 스크립트가 프런트 .env.local 설정, pnpm 빌드 승인, 의존성 설치와 실행까지
처리하므로 pnpm install 또는 pnpm dev를 별도로 입력하지 않는다.


테스트 순서
-----------

1) http://127.0.0.1:11434/api/tags에서 Ollama 상태 확인
2) http://127.0.0.1:8000/api/v1/health에서 llm_configured=true 확인
3) 프런트 /review에서 RAG 자료 추가
4) 짧은 CSV 한 개 등록
5) 실시간 AI 검토 클릭
6) AI 요약, supported/needs_confirmation, S1 출처 확인
7) 후속 질문 실행


CSV 위치
--------

초기 자동 등록 파일은 knowledge/inbox/에 둔다.
화면에서 선택하는 CSV는 PC의 어느 폴더에 있어도 된다.


주의
----

- 최초 모델 다운로드는 수 GB가 될 수 있다.
- 성능은 PC 메모리와 GPU에 따라 달라진다.
- 공개된 프런트는 개인 PC의 localhost Ollama에 접근할 수 없다.
- 외부 공개 시 FastAPI/Ollama 서버의 HTTPS, 인증, 접근통제가 필요하다.
- 이미지 스캔 PDF는 별도 OCR이 필요하다.
- AI 결과는 전문가 최종 판정이 아니다.
