# LH Review Copilot 외부 전문가 배정 통합 전달서

## 기본 정보

- 작성자: Codex
- 작업일: 2026-07-29
- 기준 공유본: `team-share-20260729-v10`
- 결과 릴리스: `team-share-20260729-v11-expert-assignment`
- 작업 목적: 역할별 동일 Case 전달, 외부 전문가 전용 View, 재사용률 KPI 위치 정리

## 변경 내용

- 첫 화면에 LH 담당자·외부 전문가·설계사 역할 선택을 추가했습니다.
- LH가 `외부 전문가 검토 요청`을 보내면 같은 `REV-24-018`이 전문가의
  `배정 검토 안건`에 표시됩니다.
- 전문가 View에서는 프로젝트 콘솔과 단지 전체 BIM을 제거하고 배정된 선택 구간,
  의도, Context, 사례, 법령·지침, 대안, 전문가 판단만 제공합니다.
- 실제 로그인, 사용자 배정, 알림, 권한관리는 PoC 범위에서 제외했습니다.
- 전문가 판단 사유를 필수화하고 V1 검토지식 저장 애니메이션과 90% 자산화 KPI를
  연결했습니다.
- 설계사 V2와 LH V3를 같은 Case에 누적하고, 각 중간 상태까지 API와 타임라인에
  저장합니다.
- 60% 검증지식 재사용률은 관련 사례 상단 요약에 한 번만 표시하고 카드에는 실제
  활용 상태 배지만 남겼습니다.
- 검토·반영 화면은 V1·V2·V3 진행에 집중하도록 중복 기대효과·이력 탭·KPI를
  제거했습니다.

## 변경 파일

- `app/prototype.tsx`
- `app/review-results.tsx`
- `app/globals.css`
- `app/api/workflow/route.ts`
- `db/schema.ts`
- `db/runtime.ts`
- `tests/rendered-html.test.mjs`
- README와 팀 릴리스·QA 문서

## 데이터·백엔드

- 기준 VE·시나리오 데이터는 변경하지 않았습니다.
- D1 `workflow_cases`에 Case 상태, 검토 패키지, 설계사 확인 여부, 갱신 시각을
  저장합니다.
- 최종 반영 API는 필수 선행조건 누락 시 HTTP 409와 누락 항목을 반환합니다.
- 새 외부 서비스나 의존성은 추가하지 않았습니다.

## 검증

- [x] TypeScript
- [x] ESLint
- [x] vinext production build
- [x] Node 회귀 테스트 10/10
- [x] LH → 외부 전문가 → LH → 설계사 → LH 전체 브라우저 흐름
- [x] 1920×1080, 1440×900, 1280×720, 390×844 반응형
- [x] 관련 사례 60% KPI 1회 표시 및 Toast·Modal 중복 없음
- [x] 전문가 View의 프로젝트 콘솔·단지 전체 BIM 비노출

## 통합 담당자 참고

- 공유 ZIP에는 `.openai/hosting.json`이 없습니다. 새 Sites 프로젝트를 만들지 말고
  기존 배포 원본에 변경사항을 병합한 뒤 그 원본의 hosting 설정으로 배포하세요.
- 전달 ZIP에서 `node_modules`, `dist`, `.wrangler`, `.git`은 제외했습니다.
- Three.js 번들 크기 권고 경고는 기존 상세 BIM 구조에서 유지되며 빌드 오류가
  아닙니다.
