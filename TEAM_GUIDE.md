# LH Review Copilot 팀 공유 가이드

이 프로젝트는 Google Drive에서 압축본을 주고받는 방식으로도 협업할 수 있습니다.
다만 압축 파일은 Git처럼 변경사항을 자동 병합하지 못하므로 아래 규칙을 지켜야
합니다.

팀원이나 AI 도구가 작업하기 전에는 `TEAM_START_HERE.txt`와
`README_TEAM_AI.txt`를 가장 먼저 읽습니다.

## 1. 기본 원칙

- Google Drive에는 항상 `최신본` 폴더와 날짜가 붙은 `백업본`을 함께 보관합니다.
- 각 팀원은 같은 기준 ZIP을 서로 다른 로컬 폴더에 풀어 작업합니다.
- 작업 시작 전에 팀 채널에 담당자·작업 범위·주요 변경 파일을 알리고, 같은 파일을
  여러 명이 동시에 수정하지 않도록 나눕니다.
- 기존 ZIP을 덮어쓰지 말고 `lh-review-copilot_YYYYMMDD_HHMM_이름.zip`으로 올립니다.
- 새 압축본을 올리기 전에 `TEAM_CHANGELOG.md`에 변경 내용을 기록합니다.
- 팀 공유 ZIP에는 `.openai/hosting.json`을 포함하지 않습니다. 기존 공개 사이트
  연결정보는 지정된 통합·배포 담당자의 원본 폴더에서만 관리합니다.
- Google Drive 업로드만으로 사이트가 자동 배포되지는 않습니다.

## 2. 압축에 포함할 항목

- `app`, `lib`, `db`, `data`, `drizzle`, `public`, `scripts`, `tests`, `services`
- `public/assets/project-overview-cutaway.webp`와 전체 근거 PDF
- `shared-data`의 최신 표준화 Excel과 시나리오 Excel
- `package.json`, `pnpm-lock.yaml`, 설정 파일, README와 팀 가이드
- `.openai/TEAM_DEPLOYMENT_NOTICE.txt`

다음 항목은 용량이 크거나 개인 환경에서 다시 생성되므로 제외합니다.

- `node_modules`, `dist`, `.vinext`, `.wrangler`, `.next`, `.git`
- `.env`, `.env.local` 등 실제 값이 든 환경변수 파일, 인증 토큰, 개인 키, 임시 출력물
- `.openai/hosting.json`
- 키 이름과 설명만 있는 `.env.example`은 포함

## 3. 압축본을 받은 팀원의 실행 순서

```bash
corepack enable
pnpm install
pnpm dev
```

기능 수정이 끝나면 다음 순서로 확인합니다.

```bash
pnpm lint
pnpm test
pnpm share:check
```

## 4. 데이터 갱신

최신 Excel을 `shared-data/standardized-data.xlsx`로 저장한 뒤 실행합니다.

```bash
pnpm data:build
pnpm test
```

램프 PoC 시나리오 Excel은 `shared-data/scenario-data.xlsx`로 저장한 뒤 실행합니다.

```bash
pnpm scenario:build
pnpm test
```

`data/ve-context.json`, `data/ramp-scenarios.json`,
`drizzle/0001_seed-cases.sql`은 자동 생성 파일이므로 직접 편집하지 않습니다.
Excel의 `case_id`, `relation_id`, `action_id`, `mapping_id`, `시나리오 ID`,
`Evidence ID`는 기존 값과 중복되지 않아야 합니다.

Excel은 동시에 편집하지 않습니다. Google Drive 버전 기록을 켜고, 갱신 전 파일을
날짜가 포함된 이름으로 백업합니다.

근거 데이터 범위가 바뀌면 `scripts/generate-evidence-pdf.py`로 전체 근거 PDF를
다시 생성하고 한글 글꼴·페이지 잘림을 확인합니다. 메인 Cutaway를 교체할 때는
같은 파일명과 16:9에 가까운 비율을 유지하고 Hotspot 좌표도 함께 검증합니다.

## 5. 배포 규칙

- 팀원은 수정 ZIP과 작성한 `TEAM_HANDOFF_이름_날짜.md`를 함께 제출합니다.
- 통합·배포 담당자는 수정 ZIP을 별도 폴더에 풀고 기존 원본과 변경 파일을 비교합니다.
- 충돌을 해결해 담당자의 기존 원본에 수정사항을 병합한 뒤 전체 테스트를 실행합니다.
- 테스트가 통과한 통합본만 기존 공개 사이트에 새 버전으로 배포합니다.
- 배포 후 `/api/cases`, `/api/workflow`, 대표 사례 화면을 확인합니다.
- `/api/ai/health`가 공개 환경에서는 `scenario-rag`, 로컬 Ollama 연결 환경에서는
  LLM 연결 상태를 반환하는지 확인합니다.
- 문제가 생기면 직전 날짜의 ZIP으로 되돌립니다.

## 6. 현재 구조에서 알아둘 점

- 공개 링크를 가진 사용자는 사이트를 볼 수 있습니다.
- 현재 업무 저장 API에는 역할별 접근통제가 충분하지 않으므로 외부에 민감한 실제
  프로젝트 자료를 넣지 않습니다.
- IFC·PDF 첨부는 아직 실제 파일 업로드가 아닌 Mock입니다.
- BIM 형상과 What-if 비용·공기 수치는 데모 가정값입니다.
- 공개 배포의 내장 RAG는 구조·키워드 검색과 근거 템플릿 합성입니다. 생성형 LLM과
  벡터 검색은 `services/review-copilot-ai-ollama`를 별도 실행했을 때 활성화됩니다.
