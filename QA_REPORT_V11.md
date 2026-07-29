# LH Review Copilot v11 QA

검증일: 2026-07-29  
대상: 외부 전문가 배정·관련 사례 KPI·Closed Decision Loop 통합본  
배포 상태: 팀 전달용 ZIP, 미배포

## 구현 범위

- PoC 역할 선택: LH 담당자, 외부 전문가, 설계사
- LH 요청 후 동일 `reviewCaseId`의 외부 전문가 `배정 검토 안건` 표시
- 전문가 View에서 프로젝트 콘솔·단지 전체 BIM 제외, 배정된 선택 구간만 제공
- 검토 의도, Review Context, 사례, 법령·지침, 대안, 전문가 판단을 한 안건에 구성
- V1 판단과 사유 저장, V2 설계사 요청·제출·확인, V3 LH 최종 반영 연결
- 관련 사례 상단에 `PoC 목표 검증지식 재사용률 60%`를 한 번만 표시
- 개별 완료 이력 카드에는 `LH 완료 검토 이력`, `검토 패키지에 활용됨`만 표시
- 검토·반영 화면에서 중복 기대효과·이력 탭·KPI 제거

## 자동 검증

- TypeScript `tsc --noEmit`: 통과
- ESLint: 통과
- vinext production build: 통과
- Node 회귀 테스트: 10/10 통과
- 모든 앱·API 라우트 빌드 확인

Three.js가 포함된 일부 클라이언트 청크의 500KB 권고 경고는 남아 있습니다.
기존 상세 BIM 구조에 따른 성능 권고이며 빌드 실패는 아닙니다.

## 브라우저 시나리오

아래 흐름을 동일 `REV-24-018`로 끝까지 확인했습니다.

1. LH 검토 패키지에서 외부 전문가 검토 요청
2. 외부 전문가 역할 전환 후 배정 목록 및 선택 BIM 구간 확인
3. 전문가 `보완 필요` 판단과 필수 사유 V1 저장
4. LH 역할에서 설계사 보완 요청
5. 설계사 역할에서 답변·Mock 첨부자료 V2 제출
6. LH 역할에서 답변 및 첨부자료 확인 완료
7. V3 잠금 해제 후 최종 반영 상태·의견·필수 확인항목 저장
8. `FINAL_REFLECTION_SAVED`와 Closed Decision Loop 완료 확인

## 반응형 확인

다음 viewport에서 문서 가로 넘침이 없음을 확인했습니다.

- 1920×1080
- 1440×900
- 1280×720
- 390×844

## 상태 흐름

`EXPERT_REVIEW_REQUESTED → EXPERT_DECISION_SAVED
→ DESIGNER_RESPONSE_REQUESTED → DESIGNER_RESPONSE_PENDING
→ DESIGNER_RESPONSE_SUBMITTED → DESIGNER_RESPONSE_CONFIRMED
→ FINAL_REFLECTION_READY → FINAL_REFLECTION_SAVED`

최종 반영 API는 V1, V2, LH 답변 확인, 최종 상태, LH 의견, 필수 확인항목,
`FINAL_REFLECTION_READY`가 모두 충족되지 않으면 HTTP 409를 반환합니다.

## 공유·배포 확인

- `.env`, API 키, 토큰, 개인 키를 추가하지 않았습니다.
- 전달 ZIP에서 `node_modules`, `dist`, `.wrangler`, `.git`을 제외합니다.
- `.openai/hosting.json`을 만들거나 포함하지 않습니다.
- 기존 공개 사이트에는 배포하지 않았습니다.
