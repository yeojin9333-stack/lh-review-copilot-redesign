# LH Review Copilot

공공주택 설계검토의 근거 수집부터 전문가 판단, 설계사 답변, LH 최종 반영 확인까지 하나의 흐름으로 연결하는 서비스 프로토타입입니다.

## Prototype routes

- `/` — 고품질 단지 Cutaway를 탐색하고 B1 곡선형 램프 R-02 Hotspot 선택
- `/review` — 램프 상세 BIM과 Context → 관련 사례 → 법령·지침 → 대안 비교 → 전문가 요청
- `/decision` — 전문가 판단 V1 → 설계사 답변 V2 → LH 최종 반영 V3의 Closed Decision Loop
- `/designer` — LH 검토의견 확인, 항목별 답변, 수정 산출물 첨부 Mock, 재제출
- `/api/cases` — 사례 검색
- `/api/cases/:caseId` — Context·관계·행위·근거 패키지
- `/api/workflow` — 전문가 판단·설계사 답변·LH 최종확인 저장
- `/api/evaluation` — 검색 평가 정답 및 검수 결과
- `/api/ai/health` — 현재 AI/RAG 실행 모드 확인
- `/api/ai/review` — 선택 시나리오의 근거 기반 검토 패키지 생성
- `/api/ai/chat` — 선택 시나리오 근거에 대한 후속 질문

기본 사용자는 검토 의도 입력, `AI 검토 시작`, `이대로 전문가 검토 요청`의 세
행동만 수행합니다. 시스템은 의도에 맞는 30개 PoC 시나리오 중 1~2개를 자동으로
선택하고 Context, 기대 근거, 유사사례, 법령·지침, 미확인정보와 대안 후보를
하나의 패키지로 구성합니다. 수정이 필요한 경우에만 `직접 수정` Drawer를 엽니다.

첫 화면에서 `LH 담당자`, `외부 전문가`, `설계사` 역할을 선택합니다. 실제 로그인,
사용자 배정, 알림, 권한관리는 구현하지 않으며 역할 View만 전환합니다. LH 담당자가
전문가 검토를 요청하면 동일 `reviewCaseId`가 외부 전문가의 `배정 검토 안건`에
나타납니다. 외부 전문가 View는 해당 안건과 선택 BIM 구간만 제공하고 프로젝트
콘솔과 단지 전체 BIM은 노출하지 않습니다.

메인 화면은 최적화된 WebP Isometric Cutaway와 동일 좌표계의 램프 Hotspot을
`react-zoom-pan-pinch`로 구성합니다. 드래그 Pan, 휠·더블클릭·Pinch Zoom,
전체 보기와 램프 상세 보기를 지원하며, 지상 단지 → 지하주차장 → 곡선형 램프의
공간 관계를 안정적으로 보여줍니다. 상세 검토 화면만 React Three
Fiber/Three.js 램프 BIM을 사용합니다. 연속 램프 바닥·벽체·차량 진행선·궤적은
하나의 공통 경로 좌표를 공유합니다. 대안 1은 내측 벽체 후퇴·P-01 운영 제외,
대안 2는 트렌치·집수정·배수 흐름, 대안 3은 반사경·검지코일·경고등·정지선을
각각 식별 가능한 형상과 라벨로 표시합니다.

기본 검토 이동은 하단 버튼을 따라 `Context → 관련 사례 → 법령·지침 →
대안 비교 → 전문가 검토` 순서로 진행합니다. 선택 대안, 펼친 사례, 판단 초안과
후속 업무 상태는 앞뒤로 이동해도 유지됩니다.

관련 사례와 법령 화면의 `전체 근거 PDF`는 상위 3건뿐 아니라 연결된 전체 VE
사례 6건, 법령·지침 15건, Context와 대안 요약을 포함한 실제 PDF를 내려받습니다.
LH 최종 상태가 D1에 저장된 뒤에는 Context → 근거 → 전문가 판단 → 설계사 답변
→ LH 반영 → 조직지식 DB 연결 애니메이션을 표시합니다.

AI 검토 화면의 `대안별 영향 요약`은 현재안과 대안 1·2·3이 공유하는 단일 대안
데이터를 사용합니다. 형상·동선·배수·공정·비용의 정성 영향, 변경 객체, 추가
확인사항과 연결 VE 사례의 원문 기대효과를 함께 표시합니다. 계산서나 수량산출
근거가 없는 비용·공기·성능 수치는 만들지 않으며, AI 신뢰도나 최적 대안으로
표현하지 않습니다.

관련 사례 카드에는 실제 상태인 `LH 완료 검토 이력`, `검토 패키지에 활용됨`만
표시합니다. `PoC 목표 검증지식 재사용률 60%`는 관련 사례 섹션 상단 요약에서
한 번만 표시하며 Toast나 Modal에서 반복하지 않습니다.

업무 상태는 아래 순서로 같은 Case에 저장됩니다.

`EXPERT_REVIEW_REQUESTED → EXPERT_DECISION_SAVED → DESIGNER_RESPONSE_REQUESTED
→ DESIGNER_RESPONSE_PENDING → DESIGNER_RESPONSE_SUBMITTED
→ DESIGNER_RESPONSE_CONFIRMED → FINAL_REFLECTION_READY
→ FINAL_REFLECTION_SAVED`

## Data-backed prototype

`데이터_20260727_표준화화확장.xlsx`를 서비스용 데이터셋으로 변환해 다음 기능에 연결했습니다.

- 354개 VE 사례의 구조화 검색과 상세 조회
- 사례별 객체·이슈 관계, 개선행위, 법령·지침 근거 패키지
- 신뢰등급·추론 여부·사람 검수 상태 표시
- 전문가 판단, 설계사 재제출, LH 최종 확인의 D1 영구 저장
- 일반 키워드 검색과 Context 검색을 비교하는 평가 API

`주차장_램프_PoC_시나리오데이터.xlsx`는 다음 데이터로 변환해 사용합니다.

- 30개 램프 검토 입력과 난이도
- 시나리오별 표준 Context와 추정 금지 조건
- 263개 기대 Evidence와 원본 VE 사례·법령·LH 지침 후보
- 미확인정보와 추가 질문

읽기 전용 기준정보는 버전이 고정된 데이터 패키지로 제공하고, 협업 과정에서 발생하는 판단·답변·반영 상태는 D1에 저장합니다. BIM Viewer 형상은 실제 IFC가 아닌 프로토타입 모식도입니다. 비용·공기 수치는 연결된 산출 근거가 없으므로 임의 숫자를 만들지 않고 `산출자료 필요` 또는 정성적 영향 상태로 표시합니다.

## Local development

Node.js 22.13 이상과 pnpm이 필요합니다.

```bash
pnpm install
pnpm scenario:build
pnpm dev
pnpm test
```

`pnpm test`는 vinext 프로덕션 빌드와 서버 렌더링 스모크 테스트를 실행합니다.

## LLM/RAG 실행 모드

공개 Sites 배포에서는 별도 LLM 서버 없이도 `scenario-rag-grounded-v1`이
시나리오 Context와 기대 Evidence를 구조·키워드로 회수합니다. 이는 근거 검색과
템플릿 기반 합성이며 생성형 LLM은 아닙니다.

검토 패키지는 내부적으로 `sourceMode: "llm" | "rule" | "mock"`을 포함합니다.
개발 환경의 `개발용 AI 연결 상태`에서 Provider 호출 경로, 모델, 검색 시나리오,
화면에 반영된 근거 수를 확인할 수 있습니다. 비밀정보와 API 키 값은 표시하거나
기록하지 않습니다. 외부 Provider 장애 시에는 실패 상태를 알리고 시연용 패키지로
흐름을 계속합니다.

팀원 버전의 실제 LLM+벡터 RAG는
`services/review-copilot-ai-ollama`에 통합되어 있습니다. 로컬에서 실행하려면:

```bash
cd services/review-copilot-ai-ollama
./scripts/start_prototype_mac.sh --dry-run
./scripts/start_prototype_mac.sh --yes
```

Windows는 `scripts/start_prototype_windows.ps1`을 사용합니다. 백엔드가 실행되면
루트 `.env.local`의 `REVIEW_COPILOT_API_URL=http://127.0.0.1:8000`을 통해 같은
화면이 Ollama LLM+벡터 RAG로 전환되고 자료 업로드가 활성화됩니다. 공개 사이트에서
이 모드를 쓰려면 백엔드를 별도 HTTPS 서버에 배포하고 인증·접근제어를 추가해야 합니다.

## Team sharing with Google Drive

압축본으로 협업할 때는 [TEAM_GUIDE.md](./TEAM_GUIDE.md)의 단일 편집자, 버전명,
검증·배포 규칙을 따릅니다. `node_modules`, `dist`, `.wrangler`, 실제 값이 든
`.env`·`.env.local`은 압축에서 제외하되 키 이름만 있는 `.env.example`은 포함합니다.
최신 표준화 Excel은 `shared-data/standardized-data.xlsx`, 시나리오 Excel은
`shared-data/scenario-data.xlsx`로 둡니다.
다른 AI 도구에 작업을 맡길 때는 `README_TEAM_AI.txt`를 먼저 전달합니다.

```bash
pnpm data:build
pnpm scenario:build
pnpm lint
pnpm test
pnpm share:check
```

Google Drive에 압축본을 올리는 것만으로 운영 사이트가 자동 배포되지는 않습니다.
팀 공유 ZIP에서는 `.openai/hosting.json`을 제외합니다. 팀원은
`TEAM_HANDOFF_TEMPLATE.md` 형식으로 수정사항을 전달하고, 지정된 통합·배포
담당자가 기존 원본 폴더에 변경사항을 병합·검증한 뒤 새 버전을 배포합니다.

이번 릴리스의 검증 결과는
[`QA_REPORT_V11.md`](./QA_REPORT_V11.md)에서 확인할 수 있습니다.
