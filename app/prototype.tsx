"use client";

import Link from "next/link";
import {
  createContext,
  FormEvent,
  useContext,
  useEffect,
  useState,
} from "react";
import { ProjectBimViewer } from "@/app/project-bim-viewer";
import { BimViewer } from "@/app/bim-viewer";
import { PreparedReviewResults } from "@/app/review-results";
import type { CaseBundle, CaseRecord, EvidenceRecord } from "@/lib/corpus";
import {
  askGroundedQuestion,
  createLiveReviewPackage,
  createReviewAlternatives,
  getAiHealth,
  type AiHealth,
  type GroundedChat,
  type ReviewPackage,
  type ReviewSourceMode,
} from "@/lib/review-copilot";
import {
  getRampScenario,
  scenarioMeta,
  type RampScenario,
} from "@/lib/scenarios";

export type PrototypeMode = "dashboard" | "review" | "decision" | "designer";
type DemoRole = "lh" | "expert" | "designer";
type WorkflowStatus =
  | "EXPERT_REVIEW_REQUESTED"
  | "EXPERT_DECISION_SAVED"
  | "DESIGNER_RESPONSE_REQUESTED"
  | "DESIGNER_RESPONSE_PENDING"
  | "DESIGNER_RESPONSE_SUBMITTED"
  | "DESIGNER_RESPONSE_CONFIRMED"
  | "FINAL_REFLECTION_READY"
  | "FINAL_REFLECTION_SAVED";

type Scenario = "current" | "a" | "b";
type ReviewView = "context" | "bim" | "package" | "whatif" | "judgement";
const WORKFLOW_CASE_ID = "REV-24-018";
const DISPLAY_CASE_ID = "REV-24-018";
const WORKFLOW_STATUS_KEY = "lh-review-workflow-status";
const ACTIVE_ROLE_KEY = "lh-review-active-role";

const navItems = [
  { href: "/", label: "프로젝트", mark: "P" },
  { href: "/review", label: "AI 설계검토", mark: "R" },
  { href: "/decision", label: "검토·반영", mark: "D" },
  { href: "/designer", label: "설계사 답변", mark: "A" },
] as const;

const roleMeta: Record<
  DemoRole,
  { label: string; mark: string; description: string; home: string }
> = {
  lh: {
    label: "LH 담당자",
    mark: "LH",
    description: "프로젝트 검토를 시작하고 설계사 답변과 최종 반영을 관리합니다.",
    home: "/",
  },
  expert: {
    label: "외부 전문가",
    mark: "EX",
    description: "AI가 준비한 근거와 대안을 검토하고 전문 판단을 기록합니다.",
    home: "/review",
  },
  designer: {
    label: "설계사",
    mark: "DS",
    description: "검토의견을 확인하고 답변과 수정자료를 제출합니다.",
    home: "/designer",
  },
};

const RoleContext = createContext<{
  role: DemoRole;
  selectRole: (role: DemoRole | null) => void;
}>({
  role: "lh",
  selectRole: () => undefined,
});

function useDemoRole() {
  return useContext(RoleContext);
}

function saveWorkflowStatus(status: WorkflowStatus) {
  window.localStorage.setItem(WORKFLOW_STATUS_KEY, status);
}

function RoleSelection({
  onSelect,
}: {
  onSelect: (role: DemoRole) => void;
}) {
  return (
    <main className="role-selection-page">
      <section className="role-branding-panel" aria-label="서비스 소개">
        <div className="role-branding-copy">
          <img className="role-brand-logo" src="/images/logo.jpg" alt="LH" />
          <h1>AI Review Copilot</h1>
          <h2>AI 기반 설계검토 지원 시스템</h2>
          <span className="role-branding-line" />
          <p>
            AI가 BIM·설계기준·VE 사례를 연결하여
            <br />
            설계검토 업무를 더 빠르고 정확하게 지원합니다.
          </p>
        </div>
        <div className="role-branding-image" aria-hidden="true" />
      </section>
      <section className="role-selection-panel">
        <div className="role-selection-heading">
          <h1>역할을 선택해 주세요.</h1>
          <p>같은 프로젝트를 역할별 업무 화면에서 확인할 수 있습니다.</p>
        </div>
        <div className="role-card-grid">
          {(Object.keys(roleMeta) as DemoRole[]).map((role) => {
            const meta = roleMeta[role];
            return (
              <button key={role} onClick={() => onSelect(role)} type="button">
                <span className={`role-card-mark role-${role}`}>{meta.mark}</span>
                <strong>{meta.label}</strong>
                <p>{meta.description}</p>
                <small>이 역할로 보기 →</small>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const scenarioData: Record<
  Scenario,
  {
    label: string;
    tag: string;
    distance: number;
    conflicts: number;
    stalls: number;
    cost: string;
    schedule: string;
    score: number;
    note: string;
  }
> = {
  current: {
    label: "현재안",
    tag: "기준",
    distance: 412,
    conflicts: 4,
    stalls: 184,
    cost: "—",
    schedule: "—",
    score: 54,
    note: "램프가 서측에 편중되고 진입이 외곽을 향해 내부 회차가 길어집니다.",
  },
  a: {
    label: "대안 A",
    tag: "AI 추천",
    distance: 291,
    conflicts: 1,
    stalls: 180,
    cost: "+3.2억",
    schedule: "+18일",
    score: 91,
    note: "중앙부 보조 램프를 추가하고 두 램프의 진입방향을 중앙으로 정렬합니다.",
  },
  b: {
    label: "대안 B",
    tag: "최소변경",
    distance: 326,
    conflicts: 2,
    stalls: 182,
    cost: "+1.8억",
    schedule: "+9일",
    score: 78,
    note: "기존 램프를 확폭하고 일방향 순환동선을 적용해 공사 범위를 줄입니다.",
  },
};

const contextAxes = [
  {
    no: "01",
    title: "사업 조건",
    value: "A-17BL · 1,240세대",
    detail: "지하 2층 / 계획 1,468대 / 실시설계 60%",
    status: "확인",
  },
  {
    no: "02",
    title: "공간·동선",
    value: "서측 램프 편중",
    detail: "외곽 진입 · 내부 이동거리 412m · 합류 4개소",
    status: "위험",
  },
  {
    no: "03",
    title: "BIM 객체",
    value: "램프 1 · 차로 14",
    detail: "주차구획 184 · 기둥 38 · LOD 300",
    status: "확인",
  },
  {
    no: "04",
    title: "법령·지침",
    value: "직접 1 · 후보 4",
    detail: "주차장법 시행규칙 제6조 · LH BIM 지침",
    status: "조건부",
  },
  {
    no: "05",
    title: "VE 사례",
    value: "유사 17건",
    detail: "채택 사례 12 · 최상 유사도 92% · L4",
    status: "근거있음",
  },
  {
    no: "06",
    title: "비용·미확인",
    value: "공사비 ±20%",
    detail: "지반조건 · 구조계산 · 관할 조례 확인 필요",
    status: "3건",
  },
] as const;

const timeline = [
  {
    date: "07.23 09:12",
    actor: "AI Copilot",
    title: "램프 동선 이슈 탐지",
    detail: "BIM 객체 53개와 VE 사례 354건을 비교해 검토 패키지를 생성했습니다.",
    state: "done",
  },
  {
    date: "07.23 14:30",
    actor: "김민수 · 교통전문가",
    title: "보완필요 판정",
    detail: "대안 A를 기본으로 구조·소방 검토와 법정 주차대수 재산정을 요청했습니다.",
    state: "done",
  },
  {
    date: "07.24 10:18",
    actor: "박지연 · LH",
    title: "설계사에 검토의견 발송",
    detail: "검토의견, 법령 후보, What-if 대안 비교표를 함께 전달했습니다.",
    state: "done",
  },
  {
    date: "07.27 11:05",
    actor: "한빛건축 설계팀",
    title: "수정안 재제출",
    detail: "BIM·도면·구조검토서를 첨부하고 대안 A 일부 반영으로 답변했습니다.",
    state: "current",
  },
  {
    date: "확인 대기",
    actor: "LH 담당자",
    title: "최종 반영 확인",
    detail: "수정 BIM과 설계사 답변을 대조해 반영 상태를 확정합니다.",
    state: "pending",
  },
] as const;

function Brand() {
  return (
    <Link className="brand" href="/" aria-label="LH Review Copilot 홈">
      <img className="lh-brand-logo" src="/images/logo.jpg" alt="LH" />
      <span>
        <strong>Review Copilot</strong>
        <small>AI 기반 설계검토 지원 시스템</small>
      </span>
    </Link>
  );
}

function AppShell({
  mode,
  children,
  compact = false,
}: {
  mode: PrototypeMode;
  children: React.ReactNode;
  compact?: boolean;
}) {
  const [shellNotice, setShellNotice] = useState("");
  const { role, selectRole } = useDemoRole();
  const activeRole = roleMeta[role];
  const visibleNav =
    role === "lh"
      ? navItems.filter((item) => item.href !== "/designer")
      : role === "expert"
        ? [{ href: "/review", label: "배정 검토 안건", mark: "R" } as const]
        : [{ href: "/designer", label: "설계사 답변", mark: "A" } as const];

  return (
    <div className={`app-shell ${compact ? "compact-shell" : ""}`}>
      <header className="topbar">
        <Brand />
        <div className={`project-switcher ${role !== "lh" ? "readonly" : ""}`}>
          <span className="eyebrow">CURRENT PROJECT</span>
          <button
            disabled={role !== "lh"}
            onClick={() => setShellNotice("현재 프로토타입은 A-17BL 단일 시연 프로젝트를 사용합니다.")}
            type="button"
          >
            A-17BL 공공주택 <span>⌄</span>
          </button>
        </div>
        <div className="top-actions">
          <button
            className="active-role-button"
            onClick={() => selectRole(null)}
            type="button"
          >
            <span>{activeRole.mark}</span>
            <strong>{activeRole.label}</strong>
            <small>역할 전환</small>
          </button>
          <button
            className="icon-button"
            onClick={() =>
              setShellNotice(
                "단지 BIM에서 검토 위치를 선택한 뒤 하단 버튼을 따라 사례·법령·대안을 확인하세요.",
              )
            }
            type="button"
            aria-label="도움말"
          >
            <span className="notification-dot" />?
          </button>
          <div className="avatar">{activeRole.mark}</div>
        </div>
        {shellNotice && (
          <button
            aria-label="안내 닫기"
            className="shell-notice"
            onClick={() => setShellNotice("")}
            type="button"
          >
            {shellNotice} <span>×</span>
          </button>
        )}
      </header>
      <aside className="side-nav">
        <nav aria-label="주요 메뉴">
          {visibleNav.map((item) => {
            const active =
              (mode === "dashboard" && item.href === "/") ||
              (mode !== "dashboard" && item.href.includes(mode));
            return (
              <Link className={active ? "active" : ""} href={item.href} key={item.href}>
                <span className="nav-mark">{item.mark}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="side-help">
          <span>{activeRole.mark}</span>
          <div>
            <strong>{activeRole.label} View</strong>
            <small>실제 로그인·권한관리 제외</small>
          </div>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}

function PageHeading({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Dashboard() {
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setSelected(
        window.sessionStorage.getItem("lh-selected-review-target") === "B1-R02",
      ),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const selectReviewTarget = () => {
    setSelected(true);
    window.sessionStorage.setItem("lh-selected-review-target", "B1-R02");
  };

  return (
    <AppShell mode="dashboard">
      <div className="page-wrap focused-dashboard">
        <section className="lh-home-hero">
          <div className="lh-home-hero-content">
            <span className="lh-hero-label">A-17BL PUBLIC HOUSING</span>
            <h1>A-17BL 공공주택 전체 설계 모델</h1>
            <p>
              AI가 BIM을 분석하여 설계기준, VE 사례, 과거 검토이력을 기반으로
              <br />
              최적의 검토 항목을 제안합니다.
            </p>
            <div className="lh-hero-actions">
              <Link className="button primary" href="/review">
                새 검토 시작 <span>→</span>
              </Link>
              <Link className="button hero-secondary" href="/decision">
                최근 검토 이어가기
              </Link>
            </div>
          </div>
          <div className="lh-hero-status" aria-label="프로젝트 상태">
            <span>실시설계</span>
            <span><i /> BIM 검증 완료</span>
          </div>
        </section>

        <header className="focused-project-bar">
          <div>
            <span className="eyebrow">A-17BL PUBLIC HOUSING</span>
            <h1>A-17BL 공동주택 전체 설계 모델</h1>
          </div>
          <div className="project-state-line">
            <span className="status-chip blue">실시설계</span>
            <span><i /> BIM 검증 완료</span>
          </div>
        </header>

        <section className="bim-dashboard-hero">
          <ProjectBimViewer onSelect={selectReviewTarget} selected={selected} />
          <aside className="single-review-card">
            <div>
              <span className="eyebrow">AI 검토 대상</span>
              <span className="single-count">1</span>
            </div>
            <span className={`status-chip ${selected ? "green" : "blue"}`}>
              {selected ? "검토 대상 선택됨" : "검토 의도 입력 전"}
            </span>
            <h2>B1 곡선형 램프 R-02</h2>
            <p className="review-card-topic">차량 동선·시야·배수 복합검토</p>
            <div className="review-readiness">
              <span className={selected ? "is-ready" : ""}>검토 준비 완료</span>
              <span className="is-ready">설계기준 연결</span>
              <span className="is-ready">VE 사례 연결</span>
              <span>과거 검토 연결</span>
              <span>Review Package 생성</span>
            </div>
            <dl>
              <div>
                <dt>위치</dt>
                <dd>지하주차장 B1 · 곡선부</dd>
              </div>
              <div>
                <dt>현재 상태</dt>
                <dd>검토 의도 입력 전</dd>
              </div>
              <div>
                <dt>미확인 정보</dt>
                <dd>2건</dd>
              </div>
            </dl>
            <p>
              {selected
                ? "선택한 공간의 검토 의도를 입력하면 AI가 Context·사례·법령·대안을 준비합니다."
                : "Cutaway의 청록색 램프 Hotspot을 선택해 검토를 시작하세요."}
            </p>
            {selected ? (
              <Link
                className="button primary dashboard-main-cta"
                href="/review?selected=B1-R02"
              >
                검토 의도 입력 <span>→</span>
              </Link>
            ) : (
              <button
                className="button primary dashboard-main-cta"
                disabled
                type="button"
              >
                검토 의도 입력 <span>→</span>
              </button>
            )}
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

type CaseSearchItem = CaseRecord & { score?: number };

function issueTone(category?: string | null) {
  if (category === "동선") return "warn";
  if (category === "시야") return "blue";
  if (category === "안전") return "purple";
  return "gray";
}

function IssueRail({
  cases,
  loading,
  onSelect,
  query,
  selected,
  setQuery,
}: {
  cases: CaseSearchItem[];
  loading: boolean;
  onSelect: (caseId: string) => void;
  query: string;
  selected: string;
  setQuery: (query: string) => void;
}) {
  return (
    <aside className="issue-rail">
      <div className="issue-rail-head">
        <div>
          <span className="eyebrow">REVIEW ITEMS</span>
          <strong>{loading ? "데이터 검색 중" : `검색결과 ${cases.length}`}</strong>
        </div>
        <button className="square-button" type="button" aria-label="필터">
          ≡
        </button>
      </div>
      <label className="issue-search">
        <span>⌕</span>
        <input
          aria-label="사례 검색"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="램프 · 동선 · 배수 검색"
          value={query}
        />
      </label>
      <div className="issue-list">
        {cases.map((issue) => (
          <button
            className={issue.case_id === selected ? "selected" : ""}
            key={issue.case_id}
            onClick={() => onSelect(issue.case_id)}
            type="button"
          >
            <span className="issue-topline">
              <span className={`risk-label ${issueTone(issue.primary_issue_category)}`}>
                {issue.primary_issue_category ?? "미확인"}
              </span>
              <span>{issue.case_id}</span>
            </span>
            <strong>{issue.title}</strong>
            <span className="issue-meta">
              <span>{issue.final_decision ?? "미확인"}</span>
              <span>{issue.overall_confidence ?? "등급없음"}</span>
            </span>
          </button>
        ))}
        {!loading && cases.length === 0 && (
          <div className="empty-search">조건에 맞는 사례가 없습니다.</div>
        )}
      </div>
      <div className="issue-legend">
        <span>
          <i className="risk-dot warn" /> 표준화 사례 354
        </span>
        <span>
          <i className="risk-dot blue" /> L5 검수 0
        </span>
      </div>
    </aside>
  );
}

function ReviewFlow({
  view,
  setView,
}: {
  view: ReviewView;
  setView: (view: ReviewView) => void;
}) {
  const items: Array<[ReviewView, string, string]> = [
    ["context", "01", "Context 6축"],
    ["bim", "02", "3D BIM"],
    ["package", "03", "AI 패키지"],
    ["whatif", "04", "What-if"],
    ["judgement", "05", "전문가 판단"],
  ];
  return (
    <div className="review-flow" role="tablist" aria-label="검토 단계">
      {items.map(([key, no, label], index) => (
        <button
          aria-selected={view === key}
          className={view === key ? "active" : ""}
          key={key}
          onClick={() => setView(key)}
          role="tab"
          type="button"
        >
          <span>{no}</span>
          <strong>{label}</strong>
          {index < items.length - 1 && <i>›</i>}
        </button>
      ))}
    </div>
  );
}

function ScenarioToggle({
  scenario,
  setScenario,
}: {
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
}) {
  return (
    <div className="scenario-toggle" aria-label="대안 선택">
      {(Object.keys(scenarioData) as Scenario[]).map((key) => (
        <button
          className={scenario === key ? "active" : ""}
          key={key}
          onClick={() => setScenario(key)}
          type="button"
        >
          {scenarioData[key].label}
          {key === "a" && <span>추천</span>}
        </button>
      ))}
    </div>
  );
}

function BimScene({ scenario }: { scenario: Scenario }) {
  const data = scenarioData[scenario];
  return (
    <div className={`bim-scene scene-${scenario}`}>
      <div className="viewer-toolbar">
        <button type="button">전체</button>
        <button type="button">B2</button>
        <button type="button">단면</button>
        <span />
        <button type="button">＋</button>
        <button type="button">−</button>
      </div>
      <div className="north-mark">
        <strong>N</strong>
        <i />
      </div>
      <div className="model-stage" aria-label={`${data.label} 지하주차장 모델 모식도`}>
        <div className="model-floor">
          <div className="parking-bays bay-top" />
          <div className="parking-bays bay-bottom" />
          <div className="lane lane-main">
            <span>→</span>
            <span>→</span>
            <span>→</span>
          </div>
          <div className="column-grid">
            {Array.from({ length: 15 }).map((_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="ramp ramp-west">
            <span>RAMP 01</span>
          </div>
          {scenario === "a" && (
            <div className="ramp ramp-center">
              <span>RAMP 02</span>
            </div>
          )}
          {scenario === "b" && (
            <div className="route-loop">
              <i>→</i>
              <i>→</i>
            </div>
          )}
          <button className="issue-pin pin-one" type="button" aria-label="검토이슈 1">
            1
          </button>
          <button className="issue-pin pin-two" type="button" aria-label="검토이슈 2">
            2
          </button>
          <div className="zone-label">주차장 중앙부</div>
        </div>
      </div>
      <div className="viewer-legend">
        <span>
          <i className="legend-line blue" /> 차량동선
        </span>
        <span>
          <i className="legend-line amber" /> 검토 객체
        </span>
        <span>
          <i className="legend-box" /> BIM 객체
        </span>
      </div>
    </div>
  );
}

function evidenceText(
  evidence: EvidenceRecord | undefined,
  keys: string[],
  fallback: string,
) {
  for (const key of keys) {
    const value = evidence?.[key];
    if (value !== null && value !== undefined && value !== "") return String(value);
  }
  return fallback;
}

function EvidencePackage({ bundle }: { bundle: CaseBundle | null }) {
  const [open, setOpen] = useState<"case" | "law" | "gap">("case");
  const record = bundle?.case;
  const legal = bundle?.legalMappings[0];
  const guideline = bundle?.guidelineMappings[0];
  const legalCount =
    (bundle?.legalMappings.length ?? 0) + (bundle?.guidelineMappings.length ?? 0);
  return (
    <aside className="evidence-panel">
      <div className="evidence-head">
        <div>
          <span className="eyebrow">AI REVIEW PACKAGE</span>
          <h3>판단에 필요한 근거</h3>
        </div>
        <span className="confidence-ring">86</span>
      </div>
      <div className="ai-summary">
        <span className="spark-mark">✦</span>
        <div>
          <strong>AI 검토 요약</strong>
          <p>
            {record?.context_summary ??
              "램프가 한쪽에 편중되고 외곽으로 진입해 내부 이동거리와 합류 충돌이 증가합니다."}
          </p>
        </div>
      </div>
      <div className="evidence-accordion">
        <button onClick={() => setOpen("case")} type="button">
          <span>
            <i className="evidence-icon ve">VE</i>
            유사 VE 사례
          </span>
          <b>{bundle ? bundle.similarCases.length + 1 : 17}건</b>
        </button>
        {open === "case" && (
          <div className="evidence-detail">
            <div className="evidence-title-row">
              <span className="status-chip green">
                {record?.final_decision ?? "채택여부 미확인"}
              </span>
              <span className="level-badge">{record?.overall_confidence ?? "L4"}</span>
            </div>
            <strong>
              {record?.case_id ?? "DET-2022-P098"} ·{" "}
              {record?.title ?? "지하주차장 램프 추가설치"}
            </strong>
            <p>“{record?.proposed_action ?? "램프를 추가 설치하고 진입방향을 재배치"}”</p>
            <small>
              {record?.source_file ?? "2022 설계VE ANNUAL REPORT"} ·{" "}
              {record?.source_locator ?? "p.98"} · {record?.human_review_status ?? "미검수"}
            </small>
          </div>
        )}
        <button onClick={() => setOpen("law")} type="button">
          <span>
            <i className="evidence-icon law">§</i>
            법령·LH 지침
          </span>
          <b>{legalCount || 5}건</b>
        </button>
        {open === "law" && (
          <div className="evidence-detail">
            <div className="law-row">
              <div>
                <strong>
                  {evidenceText(legal, ["근거ID", "법령명"], "LAW-003")}
                </strong>
                <small>
                  {evidenceText(
                    legal,
                    ["핵심 조문", "적용 조건·검토 포인트"],
                    "주차장법 시행규칙 제6조 적용성 확인",
                  )}
                </small>
              </div>
              <span className="level-badge inferred">
                {evidenceText(legal, ["confidence_level"], "L3")} 추론
              </span>
            </div>
            <div className="law-row">
              <div>
                <strong>
                  {evidenceText(guideline, ["지침명", "근거ID"], "LH 공동주택 BIM 적용지침")}
                </strong>
                <small>
                  {evidenceText(
                    guideline,
                    ["핵심 조문·근거위치", "적용성 판정"],
                    "사업별 발주·계약 문서 우선",
                  )}
                </small>
              </div>
              <span className="level-badge inferred">L3 추론</span>
            </div>
            <small className="mapping-note">
              원문 인용 ID는 직접 근거이며, 현재 사례와의 연결 관계는 조건부 추론입니다.
            </small>
          </div>
        )}
        <button onClick={() => setOpen("gap")} type="button">
          <span>
            <i className="evidence-icon gap">?</i>
            차이·미확인정보
          </span>
          <b className="amber-text">3건</b>
        </button>
        {open === "gap" && (
          <div className="evidence-detail gap-list">
            <p>
              <span>01</span>{" "}
              {record?.human_review_status === "미검수"
                ? "사람 검수 미완료 — L5 부여 전"
                : "대상 주차장의 노외/부설 구분과 관할 조례"}
            </p>
            <p>
              <span>02</span>{" "}
              {evidenceText(
                legal,
                ["적용 조건·검토 포인트"],
                "추가 램프 구간 지반조건 및 구조계산",
              )}
            </p>
            <p>
              <span>03</span>{" "}
              {evidenceText(
                guideline,
                ["적용 조건·검토 포인트"],
                "소방차·피난 동선과의 변경 전후 간섭",
              )}
            </p>
          </div>
        )}
      </div>
      <button className="button subtle full" type="button">
        근거 패키지 전체 보기 <span>↗</span>
      </button>
    </aside>
  );
}

function ContextView({
  bundle,
  scenarioRecord,
}: {
  bundle: CaseBundle | null;
  scenarioRecord: RampScenario;
}) {
  const record = bundle?.case;
  const context = scenarioRecord.context;
  const dynamicAxes = context
    ? [
        {
          no: "01",
          title: "공간·주요객체",
          value: `${context.공간} · ${context.주요객체}`,
          detail: context.객체유형,
          status: "확인",
        },
        {
          no: "02",
          title: "형상·운영·위치",
          value: context.형상조건,
          detail: `${context.운영조건} · ${context.위치조건}`,
          status: context.형상조건 === "미확인" ? "확인필요" : "조건",
        },
        {
          no: "03",
          title: "연관객체·관계",
          value: context.연관객체,
          detail: context.공간관계,
          status: "Context",
        },
        {
          no: "04",
          title: "관찰조건·이슈",
          value: context.이슈,
          detail: context.관찰조건,
          status: context.이슈.includes("안전") ? "위험" : "검토",
        },
        {
          no: "05",
          title: "검토의도·적용",
          value: context["검토의도·개선행위"],
          detail: context["적용성 조건"],
          status: "조건부",
        },
        {
          no: "06",
          title: "신뢰·미확인",
          value: context.신뢰등급,
          detail: scenarioRecord["미확인·추가 질문"] || context["필수 확인값"],
          status: context.신뢰등급.startsWith("C1") ? "확인필요" : "근거있음",
        },
      ]
    : contextAxes;

  return (
    <section className="review-content-section context-view">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">REVIEW CONTEXT · 6 AXES</span>
          <h2>판단 전에 프로젝트 맥락을 한 장으로 정렬합니다</h2>
        </div>
        <span className="status-chip blue">AI 자동 구성 · 검토자 확인 필요</span>
      </div>
      <div className="context-grid">
        {dynamicAxes.map((axis) => (
          <article key={axis.no}>
            <div className="axis-top">
              <span>{axis.no}</span>
              <span className={axis.status === "위험" ? "axis-danger" : ""}>
                {axis.status}
              </span>
            </div>
            <h3>{axis.title}</h3>
            <strong>{axis.value}</strong>
            <p>{axis.detail}</p>
          </article>
        ))}
      </div>
      <div className="context-bottom">
        <div className="context-question">
          <span>핵심 판단 질문</span>
          <h3>
            “{scenarioRecord["사용자 입력"]}”을 검토할 때{" "}
            {context?.["적용성 조건"] ?? "대상 조건"}을 만족하는가?
          </h3>
        </div>
        <div className="context-sources">
          <span>연결된 데이터</span>
          <strong>시나리오 {scenarioMeta.counts.scenarios}건</strong>
          <strong>기대 근거 {scenarioRecord.evidence.length}건</strong>
          <strong>VE 사례 {scenarioMeta.counts.sourceCases}건</strong>
        </div>
      </div>
      <p className="scenario-notice">
        {scenarioMeta.usageNotice} 현재 연결 사례: {record?.case_id ?? "검색 중"}.
      </p>
    </section>
  );
}

function BimView({
  bundle,
  scenario,
  scenarioRecord,
  setScenario,
}: {
  bundle: CaseBundle | null;
  scenario: Scenario;
  scenarioRecord: RampScenario;
  setScenario: (scenario: Scenario) => void;
}) {
  const data = scenarioData[scenario];
  return (
    <section className="bim-review-grid">
      <div className="viewer-column">
        <div className="viewer-titlebar">
          <div>
            <span className="eyebrow">BIM MODEL · {scenarioRecord["시나리오 ID"]}</span>
            <h2>{data.label} · {scenarioRecord["사용자 입력"]}</h2>
          </div>
          <ScenarioToggle scenario={scenario} setScenario={setScenario} />
        </div>
        <BimScene scenario={scenario} />
        <div className="viewer-metrics">
          <div>
            <span>내부 이동거리</span>
            <strong>{data.distance}m</strong>
            <small className={scenario !== "current" ? "green-text" : ""}>
              {scenario === "current" ? "기준값" : `−${412 - data.distance}m`}
            </small>
          </div>
          <div>
            <span>합류·교차</span>
            <strong>{data.conflicts}개소</strong>
            <small className={scenario !== "current" ? "green-text" : ""}>
              {scenario === "current" ? "고위험 2" : `−${4 - data.conflicts}`}
            </small>
          </div>
          <div>
            <span>주차대수</span>
            <strong>{data.stalls}대</strong>
            <small>{scenario === "current" ? "계획" : `${data.stalls - 184}대`}</small>
          </div>
          <div>
            <span>대안 점수</span>
            <strong>{data.score}</strong>
            <small>/ 100</small>
          </div>
        </div>
      </div>
      <EvidencePackage bundle={bundle} />
    </section>
  );
}

function LiveAiReviewPanel({
  error,
  loading,
  onGenerate,
  packageData,
  question,
  scenarioId,
  setQuestion,
}: {
  error: string;
  loading: boolean;
  onGenerate: () => void;
  packageData: ReviewPackage | null;
  question: string;
  scenarioId: string;
  setQuestion: (value: string) => void;
}) {
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<GroundedChat | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  async function askQuestion() {
    if (chatQuestion.trim().length < 2) return;
    setChatLoading(true);
    setChatError("");
    try {
      setChatAnswer(
        await askGroundedQuestion({
          message: chatQuestion.trim(),
          project_id: "mvp-ramp",
          scenario_id: scenarioId,
          top_k: 5,
        }),
      );
    } catch (requestError) {
      setChatError(
        requestError instanceof Error ? requestError.message : "질문 처리에 실패했습니다.",
      );
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <article className="live-ai-panel">
      <div className="live-ai-heading">
        <div>
          <span className="eyebrow">GROUNDED REVIEW · {scenarioId}</span>
          <h3>실시간 근거 기반 검토</h3>
          <p>선택한 시나리오의 Context와 기대 근거만 회수하며, 확인되지 않은 값은 질문으로 남깁니다.</p>
        </div>
        {packageData && <span className="status-chip green">{packageData.model}</span>}
      </div>
      <div className="live-ai-prompt">
        <label htmlFor="live-review-question">검토 요청</label>
        <textarea
          id="live-review-question"
          onChange={(event) => setQuestion(event.target.value)}
          value={question}
        />
        <button className="button primary" disabled={loading} onClick={onGenerate} type="button">
          {loading ? "근거 검색·검토 중…" : packageData ? "검토 패키지 다시 생성" : "근거 기반 검토 생성"}
        </button>
      </div>
      {error && <p className="ai-error" role="alert">{error}</p>}

      {packageData && (
        <div className="live-ai-result">
          <section className="live-ai-summary">
            <span>검토 요약</span>
            <p>{packageData.summary}</p>
          </section>
          <div className="live-review-points">
            {packageData.review_points.map((point, index) => (
              <article key={`${point.topic}-${index}`}>
                <div>
                  <span className={`status-chip ${point.status === "supported" ? "green" : "amber"}`}>
                    {point.status === "supported" ? "근거있음" : "확인필요"}
                  </span>
                  <strong>{point.topic}</strong>
                </div>
                <h4>{point.finding}</h4>
                <p>{point.why_it_matters}</p>
                <small>{point.evidence_ids.length ? point.evidence_ids.join(" · ") : "연결 근거 없음"}</small>
              </article>
            ))}
          </div>
          <div className="live-ai-evidence-grid">
            <section>
              <span className="eyebrow">MISSING INFORMATION</span>
              <ul>
                {packageData.missing_information.map((item) => <li key={item}>{item}</li>)}
              </ul>
              {packageData.missing_information.length === 0 && <p>추가 확인 항목이 없습니다.</p>}
            </section>
            <section>
              <span className="eyebrow">TRACEABLE SOURCES</span>
              <div className="live-source-list">
                {packageData.sources.map((source) => (
                  <details key={source.source_id}>
                    <summary>{source.source_id} · {source.document_id}</summary>
                    <small>{source.source_kind} · {source.locator ?? "위치 미지정"}</small>
                    <p>{source.excerpt}</p>
                  </details>
                ))}
                {packageData.sources.length === 0 && <p>검색된 근거가 없습니다.</p>}
              </div>
            </section>
          </div>
          <section className="grounded-chat">
            <div>
              <span className="eyebrow">GROUNDED FOLLOW-UP</span>
              <strong>선택 시나리오 근거에 후속 질문</strong>
            </div>
            <div className="grounded-chat-form">
              <input
                aria-label="근거 기반 후속 질문"
                onChange={(event) => setChatQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void askQuestion();
                }}
                placeholder="예: 현재 조건과 과거 사례의 차이는?"
                value={chatQuestion}
              />
              <button className="button dark" disabled={chatLoading} onClick={askQuestion} type="button">
                {chatLoading ? "답변 중…" : "질문"}
              </button>
            </div>
            {chatError && <p className="ai-error" role="alert">{chatError}</p>}
            {chatAnswer && (
              <div className="grounded-answer">
                <p>{chatAnswer.answer}</p>
                <small>
                  {chatAnswer.cited_source_ids.length
                    ? `인용: ${chatAnswer.cited_source_ids.join(", ")}`
                    : "인용 근거 없음"}
                </small>
              </div>
            )}
          </section>
        </div>
      )}
    </article>
  );
}

function PackageView({
  aiError,
  aiLoading,
  aiPackage,
  aiQuestion,
  bundle,
  onGenerateAi,
  scenarioId,
  setAiQuestion,
}: {
  aiError: string;
  aiLoading: boolean;
  aiPackage: ReviewPackage | null;
  aiQuestion: string;
  bundle: CaseBundle | null;
  onGenerateAi: () => void;
  scenarioId: string;
  setAiQuestion: (value: string) => void;
}) {
  const record = bundle?.case;
  const legal = bundle?.legalMappings[0];
  const guideline = bundle?.guidelineMappings[0];
  return (
    <section className="review-content-section package-view">
      <div className="package-heading">
        <div>
          <span className="eyebrow">TRACEABLE EVIDENCE</span>
          <h2>AI 검토 패키지</h2>
          <p>사실, 적용 후보, 추론, 미확인을 구분해 전문가가 근거의 강도를 바로 확인합니다.</p>
        </div>
        <div className="package-score-card">
          <span>종합 신뢰도</span>
          <strong>{record?.overall_confidence ?? "L4"}</strong>
          <small>{record?.human_review_status ?? "전문가 확인 전"}</small>
        </div>
      </div>
      <LiveAiReviewPanel
        error={aiError}
        key={scenarioId}
        loading={aiLoading}
        onGenerate={onGenerateAi}
        packageData={aiPackage}
        question={aiQuestion}
        scenarioId={scenarioId}
        setQuestion={setAiQuestion}
      />
      <div className="package-columns">
        <article className="package-block">
          <div className="block-head">
            <span className="block-no">01</span>
            <div>
              <span className="eyebrow">VE CASE</span>
              <h3>유사 사례</h3>
            </div>
            <span className="level-badge">{record?.overall_confidence ?? "L4"}</span>
          </div>
          <strong className="block-title">
            {record?.case_id ?? "DET-2022-P098"} · {record?.title ?? "램프 추가설치"}
          </strong>
          <p>{record?.context_summary ?? "표준화된 VE Context를 불러오는 중입니다."}</p>
          <div className="evidence-chain">
            <span>{record?.source_locator ?? "원문 위치"}</span>
            <i>→</i>
            <span>구조화 데이터</span>
            <i>→</i>
            <span>{record?.human_review_status ?? "미검수"}</span>
          </div>
        </article>
        <article className="package-block">
          <div className="block-head">
            <span className="block-no">02</span>
            <div>
              <span className="eyebrow">LEGAL BASIS</span>
              <h3>법령·지침</h3>
            </div>
            <span className="level-badge inferred">조건부</span>
          </div>
          <div className="law-citation">
            <strong>
              {evidenceText(legal, ["근거ID", "핵심 조문"], "주차장법 시행규칙 제6조")}
            </strong>
            <p>
              {evidenceText(
                legal,
                ["적용 조건·검토 포인트"],
                "출입구 시야·차로와 주차장 유형을 설계도서에서 재확인합니다.",
              )}
            </p>
            <small>
              원문 인용 {evidenceText(legal, ["원문인용 ID"], "연결")} · 사례 적용 관계는{" "}
              {evidenceText(legal, ["confidence_level"], "L3")} 추론
            </small>
          </div>
          <div className="law-citation muted">
            <strong>
              {evidenceText(guideline, ["지침명", "근거ID"], "LH 공동주택 BIM 적용지침")}
            </strong>
            <p>
              {evidenceText(
                guideline,
                ["적용 조건·검토 포인트"],
                "모델·정보 수준 및 사업별 발주·납품 요건을 우선 확인합니다.",
              )}
            </p>
          </div>
        </article>
        <article className="package-block">
          <div className="block-head">
            <span className="block-no">03</span>
            <div>
              <span className="eyebrow">DIFF & UNKNOWN</span>
              <h3>차이·미확인</h3>
            </div>
            <span className="count-badge amber">3</span>
          </div>
          <ul className="unknown-list">
            <li>
              <span>!</span>
              <div>
                <strong>주차장 유형</strong>
                <p>
                  {evidenceText(
                    legal,
                    ["적용성 판정"],
                    "부설/노외 구분에 따라 직접 적용성이 달라집니다.",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>!</span>
              <div>
                <strong>전문가 검수</strong>
                <p>
                  신뢰등급 {record?.overall_confidence ?? "L4"} ·{" "}
                  {record?.human_review_status ?? "미검수"} 상태입니다.
                </p>
              </div>
            </li>
            <li>
              <span>!</span>
              <div>
                <strong>원문과 적용 관계</strong>
                <p>원문 인용 자체와 현재 사례에 대한 조건부 적용 판단을 구분해야 합니다.</p>
              </div>
            </li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function WhatIfView({
  scenario,
  setScenario,
}: {
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
}) {
  return (
    <section className="review-content-section whatif-view">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">WHAT-IF COMPARISON</span>
          <h2>현재안 / 대안 A / 대안 B</h2>
          <p>비용·공기 수치는 프로토타입용 개략 가정이며, 실제 산출물 연결 전입니다.</p>
        </div>
        <span className="status-chip purple">5개 지표 정규화</span>
      </div>
      <div className="whatif-layout">
        <div className="comparison-cards">
          {(Object.keys(scenarioData) as Scenario[]).map((key) => {
            const data = scenarioData[key];
            return (
              <button
                className={`comparison-card ${scenario === key ? "selected" : ""}`}
                key={key}
                onClick={() => setScenario(key)}
                type="button"
              >
                <div className="comparison-top">
                  <div>
                    <span className="eyebrow">{data.tag}</span>
                    <h3>{data.label}</h3>
                  </div>
                  <span className="score-pill">{data.score}</span>
                </div>
                <p>{data.note}</p>
                <dl>
                  <div>
                    <dt>이동거리</dt>
                    <dd>{data.distance}m</dd>
                  </div>
                  <div>
                    <dt>합류·교차</dt>
                    <dd>{data.conflicts}개소</dd>
                  </div>
                  <div>
                    <dt>주차대수</dt>
                    <dd>{data.stalls}대</dd>
                  </div>
                  <div>
                    <dt>공사비</dt>
                    <dd>{data.cost}</dd>
                  </div>
                  <div>
                    <dt>공기</dt>
                    <dd>{data.schedule}</dd>
                  </div>
                </dl>
                <span className="select-line">
                  {scenario === key ? "비교 기준으로 선택됨" : "이 대안 보기"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mini-viewer">
          <BimScene scenario={scenario} />
          <div className="recommendation-note">
            <span className="spark-mark">✦</span>
            <div>
              <strong>AI 추천 · 대안 A</strong>
              <p>
                동선·안전 개선 폭이 가장 크고 VE 채택 사례와 구조가 일치합니다. 단,
                주차 4면 감소와 구조·소방 검토를 전제로 합니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function JudgementView({ caseId }: { caseId: string }) {
  const [decision, setDecision] = useState<"채택" | "보완필요" | "기각">("보완필요");
  const [reason, setReason] = useState(
    "대안 A를 기준으로 검토하되, 추가 램프 구간의 구조계산·소방 동선·법정 주차대수를 재확인한 수정안을 제출해 주세요.",
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveDecision() {
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "review", caseId, decision, reason }),
      });
      setSaved(response.ok);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="review-content-section judgement-view">
      <div className="judgement-layout">
        <div className="judgement-main">
          <span className="eyebrow">EXPERT JUDGEMENT</span>
          <h2>AI 권고를 전문가 판단으로 확정합니다</h2>
          <p>판정과 사유는 설계사 답변 요청 및 LH 최종 반영 확인 화면에 이어집니다.</p>
          <div className="decision-options">
            {[
              ["채택", "근거와 대안이 충분해 그대로 추진"],
              ["보완필요", "핵심 방향은 타당하나 추가 확인 필요"],
              ["기각", "효과·근거 부족 또는 적용 불가"],
            ].map(([label, detail]) => (
              <button
                className={decision === label ? "selected" : ""}
                key={label}
                onClick={() => setDecision(label as typeof decision)}
                type="button"
              >
                <span className="radio-dot" />
                <strong>{label}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="judgement-reason">
            판단 사유 <span>설계사에게 전달됩니다</span>
          </label>
          <textarea
            id="judgement-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          <div className="form-actions">
            <span>{saved ? "✓ D1에 판단이 저장되었습니다." : "서버 저장 대기"}</span>
            <button
              className="button primary"
              disabled={saving}
              onClick={saveDecision}
              type="button"
            >
              {saving ? "저장 중…" : "판단 확정 및 LH 전달"}
            </button>
          </div>
        </div>
        <aside className="judgement-summary">
          <span className="eyebrow">DECISION BRIEF</span>
          <h3>판단 요약</h3>
          <dl>
            <div>
              <dt>AI 권고</dt>
              <dd>대안 A · 점수 91</dd>
            </div>
            <div>
              <dt>최상 유사사례</dt>
              <dd>DET-2022-P098 · L4</dd>
            </div>
            <div>
              <dt>직접 근거</dt>
              <dd>법령 원문 1 · 사례 1</dd>
            </div>
            <div>
              <dt>추론 근거</dt>
              <dd>법령·지침 후보 4 · L3</dd>
            </div>
            <div>
              <dt>미확인정보</dt>
              <dd className="amber-text">3건</dd>
            </div>
          </dl>
          <div className="next-step">
            <span>다음 단계</span>
            <strong>설계사 답변 요청</strong>
            <p>수정 BIM·도면·계산서를 함께 제출하도록 요청합니다.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

// 기존 상세 검토 구성요소는 직접 수정 흐름의 확장 기반으로만 보존하고,
// 기본 사용자 화면에서는 렌더링하지 않습니다.
void [
  IssueRail,
  ReviewFlow,
  ContextView,
  BimView,
  PackageView,
  WhatIfView,
  JudgementView,
];

type ReviewPrepStage = "intent" | "processing" | "ready";

const reviewProgressSteps = [
  "BIM 공간조건 확인",
  "관련 사례 검색",
  "법령·지침 연결",
  "검토 대안 구성",
  "검토 준비 완료",
] as const;

const quickReviewIntents = [
  "차량 동선",
  "진입 시야",
  "배수·결빙",
  "유지관리",
  "전기·설비",
] as const;

const quickIntentPrompts: Record<(typeof quickReviewIntents)[number], string> = {
  "차량 동선": "B1 곡선형 램프의 차량 동선과 회전구간을 검토해줘.",
  "진입 시야": "B1 곡선형 램프 진입부의 시야와 벽체 간섭을 검토해줘.",
  "배수·결빙": "B1 램프의 우수 유입, 트렌치 배수와 결빙 위험을 검토해줘.",
  유지관리: "B1 램프의 구조·설비 간섭과 유지관리 조건을 검토해줘.",
  "전기·설비": "B1 램프 인근 전기차 충전구획과 설비 간섭을 검토해줘.",
};

const fallbackCases = [
  {
    title: "곡선형 램프 내측 벽체 조정 사례",
    similarity_reason: "곡선부 진입 시야와 차량 동선을 함께 검토한 사례",
    different_conditions: [
      "과거 사례는 외기 비노출 램프이며 현재 설계는 배수조건 확인 필요",
    ],
    evidence_ids: [],
  },
  {
    title: "램프 하부 우수유입 방지 트렌치 설치 사례",
    similarity_reason: "램프 종점부의 우수 유입과 트렌치 위치를 함께 검토한 사례",
    different_conditions: ["현재안은 집수정 연결 상세와 동절기 운영조건 확인 필요"],
    evidence_ids: [],
  },
  {
    title: "주차장 램프 진출입 동선 개선 사례",
    similarity_reason: "인접 주차면과 램프 차량 궤적의 간섭을 검토한 사례",
    different_conditions: ["과거 사례와 현재 램프의 구배·회전반경이 다름"],
    evidence_ids: [],
  },
];

function scenarioIdsForIntent(intent: string) {
  const ids: string[] = [];
  if (/배수|결빙|우수|트렌치|집수정/.test(intent)) ids.push("RMP-S19");
  if (/시야|옹벽|벽체/.test(intent)) ids.push("RMP-S09");
  if (/전기|설비|충전/.test(intent)) ids.push("RMP-S16");
  if (/유지관리|층고|구조/.test(intent)) ids.push("RMP-S20");
  if (/곡선|회전|차량|동선/.test(intent)) ids.push("RMP-S26");
  return [...new Set(ids.length ? ids : ["RMP-S28"])].slice(0, 2);
}

function mergeReviewPackages(packages: ReviewPackage[]): ReviewPackage {
  const [first] = packages;
  const uniqueBy = <T,>(items: T[], key: (item: T) => string) =>
    [...new Map(items.map((item) => [key(item), item])).values()];

  return {
    ...first,
    sourceMode: (
      packages.some((item) => item.sourceMode === "llm")
        ? "llm"
        : packages.some((item) => item.sourceMode === "rule")
          ? "rule"
          : "mock"
    ) satisfies ReviewSourceMode,
    summary: packages.map((item) => item.summary).join(" "),
    review_points: uniqueBy(
      packages.flatMap((item) => item.review_points),
      (item) => `${item.topic}-${item.finding}`,
    ),
    similar_cases: uniqueBy(
      packages.flatMap((item) => item.similar_cases),
      (item) => item.title,
    ),
    missing_information: [
      ...new Set(packages.flatMap((item) => item.missing_information)),
    ],
    recommended_questions: [
      ...new Set(packages.flatMap((item) => item.recommended_questions)),
    ],
    limitations: [...new Set(packages.flatMap((item) => item.limitations))],
    cited_source_ids: [
      ...new Set(packages.flatMap((item) => item.cited_source_ids)),
    ],
    sources: uniqueBy(
      packages.flatMap((item) => item.sources),
      (item) => item.source_id,
    ),
    model: [...new Set(packages.map((item) => item.model))].join(" + "),
    alternatives: uniqueBy(
      packages.flatMap((item) => item.alternatives),
      (item) => item.id,
    ).slice(0, 4),
  };
}

function mockReviewPackage(): ReviewPackage {
  const citedSourceIds = ["MOCK-CTX"];
  return {
    sourceMode: "mock",
    summary:
      "B1 곡선형 램프의 형상·차량 동선·시야·배수 조건을 시연 데이터로 구성했습니다. 미확인 수치와 법적 적용 여부는 전문가 확인이 필요합니다.",
    review_points: [
      {
        topic: "Context 정합성",
        finding: "곡선형 램프, 내측 벽체, 인접 주차면과 배수 객체를 함께 확인",
        why_it_matters: "형상 변경이 동선과 배수에 미치는 연쇄 영향을 함께 보기 위해서입니다.",
        evidence_ids: citedSourceIds,
        status: "needs_confirmation",
      },
    ],
    similar_cases: fallbackCases,
    missing_information: ["회전반경 자료", "집수정 연결 상세"],
    recommended_questions: ["차량 궤적도와 배수계산서를 확인할 수 있나요?"],
    limitations: ["외부 AI 연결 실패 시 사용하는 시연 데이터입니다."],
    cited_source_ids: citedSourceIds,
    target: {
      name: "B1 곡선형 램프 R-02",
      category: "Ramp",
      location: "지하주차장 B1",
    },
    sources: [],
    model: "scenario-demo-fallback",
    alternatives: createReviewAlternatives(citedSourceIds),
  };
}

function ReviewWorkspace() {
  const [stage, setStage] = useState<ReviewPrepStage>("intent");
  const [intent, setIntent] = useState(
    "B1 램프의 차량 동선, 곡선부 시야와 우수 유입·배수 조건을 함께 검토해줘.",
  );
  const [progress, setProgress] = useState(0);
  const [aiPackage, setAiPackage] = useState<ReviewPackage | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [scenarioIds, setScenarioIds] = useState(["RMP-S26", "RMP-S19"]);
  const [aiError, setAiError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [includedContext, setIncludedContext] = useState([
    "형상·구배",
    "벽체·주차면",
    "차량 동선",
    "배수·집수정",
    "안전설비",
    "운영조건",
  ]);
  const [conditionDraft, setConditionDraft] = useState(
    "곡선형 · 구배 14% · 내측 벽체 존재 · 인접 주차면 존재",
  );
  const [alternativeDraft, setAlternativeDraft] = useState(
    "벽체 후퇴, 트렌치 위치 조정, 현재 형상 유지 후 추가 검증",
  );
  const [missingDecision, setMissingDecision] = useState("");
  useEffect(() => {
    const savedIntent = window.sessionStorage.getItem("lh-review-intent");
    if (savedIntent) {
      const frame = window.requestAnimationFrame(() => setIntent(savedIntent));
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const savedIntent = window.sessionStorage.getItem("lh-review-intent")?.trim();
    const savedPackage = window.sessionStorage.getItem("lh-review-ready-package");
    if (query.get("resume") !== "1" || !savedIntent || !savedPackage) return;
    try {
      const restored = JSON.parse(savedPackage) as ReviewPackage;
      if (!restored?.target || restored.alternatives?.length !== 4) return;
      const frame = window.requestAnimationFrame(() => {
        setIntent(savedIntent);
        setAiPackage(restored);
        setStage("ready");
      });
      return () => window.cancelAnimationFrame(frame);
    } catch {
      window.sessionStorage.removeItem("lh-review-ready-package");
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("lh-review-intent", intent);
  }, [intent]);

  useEffect(() => {
    const controller = new AbortController();
    getAiHealth(controller.signal)
      .then(setAiHealth)
      .catch(() =>
        setAiHealth({
          status: "ok",
          llm_configured: false,
          model: "scenario-demo-fallback",
          embedding_model: "unavailable",
          documents: 0,
          sourceMode: "mock",
          fallback_active: true,
        }),
      );
    return () => controller.abort();
  }, []);

  async function prepareReview() {
    if (!intent.trim()) return;
    const nextScenarioIds = scenarioIdsForIntent(intent);
    setScenarioIds(nextScenarioIds);
    setStage("processing");
    setProgress(0);
    setAiError("");
    setRequestError("");

    const progressTask = (async () => {
      for (let index = 1; index <= reviewProgressSteps.length; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 360));
        setProgress(index);
      }
    })();

    const packageTask = Promise.allSettled(
      nextScenarioIds.map((scenarioId) => {
        const scenario = getRampScenario(scenarioId);
        const context = scenario.context;
        const relatedElements = (context?.연관객체 ?? "")
          .split(/\s*\|\s*/)
          .filter(Boolean)
          .slice(0, 8)
          .map((name) => ({ name, category: "scenario-context" }));
        return createLiveReviewPackage({
          project_id: "mvp-ramp",
          scenario_id: scenarioId,
          top_k: 7,
          question: `${intent} 관련 Context·유사사례·법령·차이·미확인정보와 검토 대안을 근거와 함께 준비해 줘.`,
          target: {
            name: "B1 곡선형 램프 R-02",
            category: context?.주요객체 ?? "Ramp",
            location: "지하주차장 B1",
            properties: {
              scenario_id: scenarioId,
              review_intent: intent,
              confirmed_information: scenario["확인된 정보"],
              missing_information: scenario["미확인·추가 질문"],
              spatial_conditions: conditionDraft,
              included_context: includedContext,
              alternative_conditions: alternativeDraft,
              attached_materials: attachments,
              missing_information_disposition: missingDecision,
            },
            related_elements: relatedElements,
          },
        });
      }),
    );

    const [settled] = await Promise.all([packageTask, progressTask]);
    const completed = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (completed.length) {
      const merged = mergeReviewPackages(completed);
      setAiPackage(merged);
      window.sessionStorage.setItem("lh-review-ready-package", JSON.stringify(merged));
    } else {
      const fallback = mockReviewPackage();
      setAiPackage(fallback);
      window.sessionStorage.setItem(
        "lh-review-ready-package",
        JSON.stringify(fallback),
      );
      setAiError(
        "AI 연결 실패로 시연 데이터를 사용했습니다. 전문가 요청 전에 근거 원문을 확인해 주세요.",
      );
    }
    setStage("ready");
  }

  async function requestExpertReview() {
    setRequesting(true);
    setRequestError("");
    const firstCaseId = WORKFLOW_CASE_ID;
    const packageForExpert = {
      intent,
      scenarioIds,
      context: {
        target: "B1 곡선형 램프 R-02",
        conditions: conditionDraft,
        includedContext,
        missingInformation:
          aiPackage?.missing_information.slice(0, 4) ?? [
            "회전반경 자료",
            "집수정 연결 상세",
          ],
        attachments,
        missingDecision,
      },
      similarCases: (aiPackage?.similar_cases.length
        ? aiPackage.similar_cases
        : fallbackCases
      ).slice(0, 3),
      legalSources: (aiPackage?.sources ?? [])
        .filter((source) => /법령|지침|BIM/.test(source.source_kind))
        .slice(0, 3),
      alternatives: aiPackage?.alternatives ?? createReviewAlternatives(),
      sourceMode: aiPackage?.sourceMode ?? "mock",
      model: aiPackage?.model ?? "scenario-data-fallback",
    };

    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "request",
          caseId: firstCaseId,
          scenarioId: scenarioIds.join(","),
          intent,
          reviewPackage: packageForExpert,
        }),
      });
      if (!response.ok) throw new Error("전문가 검토 요청을 저장하지 못했습니다.");
      window.sessionStorage.setItem(
        "lh-expert-review-package",
        JSON.stringify(packageForExpert),
      );
      saveWorkflowStatus("EXPERT_REVIEW_REQUESTED");
      window.location.href = `/decision?requested=1&caseId=${encodeURIComponent(firstCaseId)}`;
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "전문가 검토 요청에 실패했습니다.",
      );
      setRequesting(false);
    }
  }

  const displayedCases = (
    aiPackage?.similar_cases.length ? aiPackage.similar_cases : fallbackCases
  ).slice(0, 3);
  const displayedLaws = (aiPackage?.sources ?? [])
    .filter((source) => /법령|지침|BIM/.test(source.source_kind))
    .slice(0, 3);
  const missingInformation =
    aiPackage?.missing_information.slice(0, 2) ?? [
      "회전반경 자료",
      "집수정 연결 상세",
    ];
  const showLegacyReady = false as boolean;

  return (
    <AppShell mode="review">
      <div className="page-wrap ai-prep-page">
        {stage === "intent" && (
          <section className="intent-screen">
            <nav className="review-location-path" aria-label="현재 BIM 위치">
              <Link href="/">A-17BL 공동주택</Link>
              <span>›</span>
              <span>지하주차장 B1</span>
              <span>›</span>
              <strong>곡선형 램프 R-02</strong>
              <Link href="/">전체 프로젝트로 돌아가기</Link>
            </nav>
            <div className="intent-heading">
              <span className="eyebrow">AI REVIEW PREPARATION</span>
              <h1>무엇을 검토할까요?</h1>
              <p>
                BIM에서 확인된 대상에 검토 의도만 알려주세요. 필요한 맥락과 근거,
                대안은 AI가 준비합니다.
              </p>
            </div>
            <div className="intent-card">
              <div className="project-target-grid">
                <article>
                  <span>현재 프로젝트</span>
                  <strong>A-17BL 공공주택</strong>
                  <small>공공주택 · 실시설계 검토</small>
                </article>
                <article className="auto-target-card">
                  <span>BIM에서 자동 확인된 대상 공간</span>
                  <strong>B1 · 곡선형 램프 R-02</strong>
                  <small>
                    <i /> BIM 모델 연결됨 · 주변 객체 자동 인식
                  </small>
                </article>
              </div>
              <label className="intent-field" htmlFor="review-intent">
                <span>검토 의도</span>
                <input
                  id="review-intent"
                  onChange={(event) => setIntent(event.target.value)}
                  placeholder="예: B1 곡선형 램프의 차량 동선·시야·배수를 검토해줘."
                  value={intent}
                />
              </label>
              <div className="quick-intents">
                <span>빠른 검토 의도</span>
                <div>
                  {quickReviewIntents.map((item) => (
                    <button
                      key={item}
                      onClick={() => setIntent(quickIntentPrompts[item])}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="button primary intent-start-button"
                disabled={!intent.trim()}
                onClick={() => void prepareReview()}
                type="button"
              >
                AI 검토 시작 <span>→</span>
              </button>
            </div>
            <p className="ux-principle">
              복잡한 검토 준비는 AI가 완료하고, 사용자는 근거와 대안을 확인한 뒤
              결정합니다.
            </p>
          </section>
        )}

        {stage === "processing" && (
          <section className="processing-screen" aria-live="polite">
            <div className="processing-orbit">
              <span>AI</span>
            </div>
            <span className="eyebrow">AUTOMATIC REVIEW SETUP</span>
            <h1>검토에 필요한 정보를 준비하고 있습니다.</h1>
            <p>사용자 입력 없이 BIM 공간조건과 근거 데이터를 연결합니다.</p>
            <ol className="processing-steps">
              {reviewProgressSteps.map((item, index) => (
                <li
                  className={
                    progress > index
                      ? "complete"
                      : progress === index
                        ? "active"
                        : ""
                  }
                  key={item}
                >
                  <span>{progress > index ? "✓" : index + 1}</span>
                  <strong>{item}</strong>
                </li>
              ))}
            </ol>
          </section>
        )}

        {stage === "ready" && aiPackage && (
          <PreparedReviewResults
            aiError={aiError}
            aiHealth={aiHealth}
            aiPackage={aiPackage}
            missingDecision={missingDecision}
            onBack={() => setStage("intent")}
            onEdit={() => setEditOpen(true)}
            onMissingDecision={setMissingDecision}
            onRequest={() => void requestExpertReview()}
            requesting={requesting}
            requestError={requestError}
            scenarioIds={scenarioIds}
          />
        )}

        {showLegacyReady && (
          <section className="ready-screen">
            <header className="review-ready-header">
              <div className="ready-check">✓</div>
              <div>
                <span className="eyebrow">AI REVIEW PACKAGE READY</span>
                <h1>검토 준비가 완료됐습니다.</h1>
                <p>
                  AI가 BIM 공간조건을 분석하고 관련 사례·법령·검토 대안을
                  정리했습니다.
                </p>
              </div>
              <span className="rag-ready-chip">
                <i /> {aiPackage ? "시나리오 RAG 근거 연결됨" : "내장 시나리오 근거"}
              </span>
            </header>

            {aiError && <div className="ai-error">{aiError}</div>}

            <article className="ready-section context-ready-section">
              <div className="ready-section-heading">
                <div>
                  <span className="section-number">01</span>
                  <div>
                    <span className="eyebrow">REVIEW CONTEXT</span>
                    <h2>AI가 확인한 Context</h2>
                  </div>
                </div>
                <strong>AI가 6개 검토 맥락을 확인했습니다.</strong>
              </div>
              <div className="context-summary-grid">
                <div>
                  <span>검토 대상</span>
                  <strong>B1 곡선형 램프 R-02</strong>
                </div>
                <div>
                  <span>공간조건</span>
                  <ul>
                    <li>곡선형</li>
                    <li>구배 14%</li>
                    <li>내측 벽체 존재</li>
                    <li>인접 주차면 존재</li>
                  </ul>
                </div>
                <div>
                  <span>함께 확인한 객체</span>
                  <ul>
                    <li>벽체</li>
                    <li>트렌치</li>
                    <li>집수정</li>
                    <li>차량 동선</li>
                    <li>차단기·검지코일</li>
                  </ul>
                </div>
                <div className="missing-context">
                  <span>미확인 정보</span>
                  <ul>
                    {missingInformation.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <details className="context-details">
                <summary>검토 범위 자세히 보기</summary>
                <p>
                  {aiPackage?.summary ??
                    "BIM 형상, 주변 객체, 차량 동선, 배수, 안전설비와 운영조건을 하나의 검토 맥락으로 구성했습니다."}
                </p>
                <small>자동 연결 시나리오 · {scenarioIds.join(" + ")}</small>
              </details>
              {missingInformation[0] && !missingDecision && (
                <div className="single-missing-question">
                  <div>
                    <span>추가 확인사항</span>
                    <strong>{missingInformation[0]}가 확인되지 않았습니다.</strong>
                    <small>지금 확인하지 않아도 전문가 검토 요청을 계속할 수 있습니다.</small>
                  </div>
                  <div>
                    <button
                      className="button subtle"
                      onClick={() => setMissingDecision("도면에서 확인 예정")}
                      type="button"
                    >
                      도면에서 확인
                    </button>
                    <button
                      className="button subtle"
                      onClick={() => setEditOpen(true)}
                      type="button"
                    >
                      자료 첨부
                    </button>
                    <button
                      className="button subtle"
                      onClick={() => setMissingDecision("미확인 상태로 계속")}
                      type="button"
                    >
                      미확인 상태로 계속
                    </button>
                  </div>
                </div>
              )}
              {missingDecision && (
                <p className="missing-decision">✓ {missingDecision}으로 패키지에 기록했습니다.</p>
              )}
            </article>

            <article className="ready-section">
              <div className="ready-section-heading">
                <div>
                  <span className="section-number">02</span>
                  <div>
                    <span className="eyebrow">SIMILAR VE CASES</span>
                    <h2>관련 사례</h2>
                  </div>
                </div>
                <span>현재 맥락과 가까운 사례만 요약했습니다.</span>
              </div>
              <div className="evidence-summary-list">
                {displayedCases.map((item, index) => (
                  <article key={`${item.title}-${index}`}>
                    <span className="evidence-type case">VE</span>
                    <div>
                      <h3>{item.title}</h3>
                      <dl>
                        <div>
                          <dt>유사한 이유</dt>
                          <dd>{item.similarity_reason}</dd>
                        </div>
                        <div>
                          <dt>다른 조건</dt>
                          <dd>
                            {item.different_conditions[0] ??
                              "현재 BIM 형상과 운영조건은 별도 확인 필요"}
                          </dd>
                        </div>
                      </dl>
                      <details>
                        <summary>사례 보기</summary>
                        <p>
                          이 사례는 대안 탐색을 위한 참고 근거이며 현재 프로젝트에
                          그대로 적용되는 것으로 판정하지 않습니다.
                        </p>
                      </details>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="ready-section">
              <div className="ready-section-heading">
                <div>
                  <span className="section-number">03</span>
                  <div>
                    <span className="eyebrow">LEGAL & GUIDELINE REFERENCES</span>
                    <h2>관련 법령·지침</h2>
                  </div>
                </div>
                <span>충족·위반 여부는 전문가가 최종 확인합니다.</span>
              </div>
              <div className="evidence-summary-list law-list">
                {(displayedLaws.length
                  ? displayedLaws
                  : [
                      {
                        source_id: "fallback-law-1",
                        document_id: "주차장법 시행규칙",
                        filename: "주차장법 시행규칙",
                        source_kind: "법령",
                        locator: "제6조",
                        excerpt: "램프 구조와 유효폭 관련 기준",
                        score: 0,
                        metadata: {
                          caution:
                            "현재 램프 형상과 적용 대상 여부는 전문가 확인 필요",
                        },
                      },
                      {
                        source_id: "fallback-law-2",
                        document_id: "LH 공동주택 BIM 적용지침",
                        filename: "LH 공동주택 BIM 적용지침",
                        source_kind: "LH 지침·상세도",
                        locator: "공간·객체 정보 작성 기준",
                        excerpt: "검토 대상 객체와 연관 공간정보의 확인 기준",
                        score: 0,
                        metadata: {
                          caution: "발주·납품 단계와 적용 범위 확인 필요",
                        },
                      },
                    ]
                ).map((source) => (
                  <article key={source.source_id}>
                    <span className="evidence-type law">§</span>
                    <div>
                      <h3>
                        {source.document_id || source.filename}
                        {source.locator ? ` · ${source.locator}` : ""}
                      </h3>
                      <dl>
                        <div>
                          <dt>검토 연결</dt>
                          <dd>{source.excerpt}</dd>
                        </div>
                        <div>
                          <dt>확인 조건</dt>
                          <dd>
                            {String(
                              source.metadata.caution ??
                                source.metadata.applicability ??
                                "현재 BIM 형상과 적용 대상 여부는 전문가 확인 필요",
                            )}
                          </dd>
                        </div>
                      </dl>
                      <details>
                        <summary>원문 보기</summary>
                        <p>{source.excerpt}</p>
                      </details>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="ready-section alternatives-ready-section">
              <div className="ready-section-heading">
                <div>
                  <span className="section-number">04</span>
                  <div>
                    <span className="eyebrow">REVIEW ALTERNATIVES</span>
                    <h2>검토 대안</h2>
                  </div>
                </div>
                <span>현재 조건에서 검토할 수 있는 대안 후보</span>
              </div>
              <div className="simple-alternative-grid">
                <article className="current">
                  <span>현재안</span>
                  <h3>기존 벽체·트렌치 위치 유지</h3>
                  <p>현재 BIM 형상과 설비 위치를 기준으로 검토합니다.</p>
                </article>
                <article>
                  <span>대안 1</span>
                  <h3>내측 벽체 일부 후퇴</h3>
                  <ul>
                    <li>차량 시야와 회전구간 검토</li>
                    <li>인접 주차면 운영조건 확인 필요</li>
                  </ul>
                </article>
                <article>
                  <span>대안 2</span>
                  <h3>트렌치 위치 조정</h3>
                  <ul>
                    <li>배수 경로 검토</li>
                    <li>집수정 연결 상세 확인 필요</li>
                  </ul>
                </article>
                <article>
                  <span>대안 3</span>
                  <h3>현재 형상 유지 + 추가 검증</h3>
                  <ul>
                    <li>회전반경 자료 보완</li>
                    <li>시거 및 배수계산서 확인</li>
                  </ul>
                </article>
              </div>
              {alternativeDraft !==
                "벽체 후퇴, 트렌치 위치 조정, 현재 형상 유지 후 추가 검증" && (
                <p className="alternative-edited-note">
                  직접 수정한 대안 조건 · {alternativeDraft}
                </p>
              )}
            </article>

            <div className="review-action-bar">
              <button
                className="button subtle back-action"
                onClick={() => setStage("intent")}
                type="button"
              >
                ← 뒤로
              </button>
              <div>
                <button
                  className="button edit-action"
                  onClick={() => setEditOpen(true)}
                  type="button"
                >
                  직접 수정
                </button>
                <button
                  className="button primary"
                  disabled={requesting}
                  onClick={requestExpertReview}
                  type="button"
                >
                  {requesting ? "요청 중…" : "이대로 전문가 검토 요청"}{" "}
                  <span>→</span>
                </button>
              </div>
            </div>
            {requestError && <div className="ai-error">{requestError}</div>}
            <p className="ux-principle ready-principle">
              복잡한 검토 준비는 AI가 완료하고, 사용자는 근거와 대안을 확인한 뒤
              결정합니다.
            </p>
          </section>
        )}
      </div>

      {editOpen && (
        <div className="drawer-backdrop" role="presentation">
          <aside className="review-edit-drawer" aria-label="검토 패키지 직접 수정">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">OPTIONAL EDIT</span>
                <h2>AI가 준비한 내용 수정</h2>
                <p>잘못 인식된 내용이 있을 때만 수정하세요.</p>
              </div>
              <button
                aria-label="닫기"
                onClick={() => setEditOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="review-edit-form">
              <label>
                <span>검토 의도</span>
                <textarea
                  onChange={(event) => setIntent(event.target.value)}
                  value={intent}
                />
              </label>
              <fieldset>
                <legend>Context 항목 추가·제외</legend>
                {[
                  "형상·구배",
                  "벽체·주차면",
                  "차량 동선",
                  "배수·집수정",
                  "안전설비",
                  "운영조건",
                ].map((item) => (
                  <label key={item}>
                    <input
                      checked={includedContext.includes(item)}
                      onChange={() =>
                        setIncludedContext((current) =>
                          current.includes(item)
                            ? current.filter((value) => value !== item)
                            : [...current, item],
                        )
                      }
                      type="checkbox"
                    />
                    {item}
                  </label>
                ))}
              </fieldset>
              <label>
                <span>공간조건 수정</span>
                <textarea
                  onChange={(event) => setConditionDraft(event.target.value)}
                  value={conditionDraft}
                />
              </label>
              <label>
                <span>추가 자료 첨부</span>
                <input
                  accept=".ifc,.dwg,.pdf,.xlsx"
                  multiple
                  onChange={(event) =>
                    setAttachments(
                      Array.from(event.target.files ?? []).map((file) => file.name),
                    )
                  }
                  type="file"
                />
                <small>
                  {attachments.length
                    ? `${attachments.length}개 자료가 검토 패키지에 추가됩니다.`
                    : "BIM·도면·계산서 첨부 (프로토타입 Mock)"}
                </small>
              </label>
              <label>
                <span>대안 조건 수정</span>
                <textarea
                  onChange={(event) => setAlternativeDraft(event.target.value)}
                  value={alternativeDraft}
                />
              </label>
            </div>
            <div className="drawer-actions">
              <button
                className="button subtle"
                onClick={() => setEditOpen(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setEditOpen(false);
                  void prepareReview();
                }}
                type="button"
              >
                수정 반영
              </button>
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function DesignerAnswerDrawer({
  answer,
  open,
  onClose,
  onConfirm,
  onRequestRevision,
}: {
  answer?: {
    response?: string;
    reason?: string;
    submitted_at?: string;
  } | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onRequestRevision: () => void;
}) {
  if (!open) return null;
  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="answer-drawer" aria-label="설계사 답변 상세">
        <div className="drawer-head">
          <div>
            <span className="eyebrow">DESIGNER RESPONSE</span>
            <h2>한빛건축 설계팀 답변</h2>
          </div>
          <button onClick={onClose} type="button" aria-label="닫기">
            ×
          </button>
        </div>
        <div className="drawer-meta">
          <span className="status-chip blue">재제출 완료</span>
          <span>{answer?.submitted_at?.slice(0, 16) ?? "2026.07.27 11:05"}</span>
          <span>작성자 · 이서준 책임</span>
        </div>
        <section className="drawer-section">
          <span className="section-index">01</span>
          <div>
            <h3>답변 내용</h3>
            <p>
              {answer?.response ??
                "제안된 대안 A를 기준으로 보조 램프를 중앙부에 추가했습니다. 기존 램프 진입방향도 중앙부로 조정했으며, 소방차 동선과의 간섭은 없는 것으로 1차 확인했습니다."}
            </p>
          </div>
        </section>
        <section className="drawer-section">
          <span className="section-index">02</span>
          <div>
            <h3>일부 미반영 사유</h3>
            <p>
              {answer?.reason ??
                "구조벽 위치로 인해 VE 사례와 동일한 램프 폭은 적용하지 못했습니다. 유효폭 6.5m 대신 6.2m를 적용하고 회전반경을 보완했습니다."}
            </p>
          </div>
        </section>
        <section className="drawer-section">
          <span className="section-index">03</span>
          <div>
            <h3>첨부 산출물</h3>
            <div className="attachment-list">
              <button
                onClick={() => window.alert("시연용 첨부파일입니다. 실제 다운로드는 제공하지 않습니다.")}
                type="button"
              >
                <span>IFC</span>
                A17_B2_RAMP_REV03.ifc
                <small>42.8 MB</small>
              </button>
              <button
                onClick={() => window.alert("시연용 첨부파일입니다. 실제 다운로드는 제공하지 않습니다.")}
                type="button"
              >
                <span>PDF</span>
                지하2층_주차동선_변경도면.pdf
                <small>8.4 MB</small>
              </button>
              <button
                onClick={() => window.alert("시연용 첨부파일입니다. 실제 다운로드는 제공하지 않습니다.")}
                type="button"
              >
                <span>XLS</span>
                법정주차대수_재산정.xlsx
                <small>1.2 MB</small>
              </button>
            </div>
          </div>
        </section>
        <div className="drawer-callout">
          <span>AI 대조 결과</span>
          <strong>검토 요구사항 5개 중 4개 일치</strong>
          <p>램프 유효폭과 구조계산서 서명본은 추가 확인이 필요합니다.</p>
        </div>
        <div className="drawer-actions">
          <button className="button subtle" onClick={onRequestRevision} type="button">
            재보완 요청
          </button>
          <button className="button primary" onClick={onConfirm} type="button">
            답변 확인 완료
          </button>
        </div>
      </aside>
    </div>
  );
}

type ExpertReviewPackage = {
  intent?: string;
  scenarioIds?: string[];
  context?: {
    target?: string;
    conditions?: string;
    missingInformation?: string[];
    attachments?: string[];
    missingDecision?: string;
  };
  similarCases?: Array<{ title?: string }>;
  legalSources?: Array<{ document_id?: string; filename?: string; locator?: string }>;
  alternatives?: ReviewPackage["alternatives"];
  sourceMode?: ReviewSourceMode;
  model?: string;
};

type WorkflowApiResponse = {
  status?: WorkflowStatus;
  designerConfirmed?: boolean;
  review?: {
    decision?: string;
    reason?: string;
    updated_at?: string;
  } | null;
  reflection?: { status?: string; note?: string } | null;
  designer?: {
    response?: string;
    reason?: string;
    submitted_at?: string;
  } | null;
  timeline?: Array<{
    actor: string;
    title: string;
    detail: string;
    state: string;
    created_at: string;
  }>;
};

function parseExpertRequestDetail(detail: string) {
  try {
    const parsed = JSON.parse(detail) as {
      intent?: string;
      reviewPackage?: ExpertReviewPackage;
    };
    return parsed.reviewPackage
      ? { ...parsed.reviewPackage, intent: parsed.reviewPackage.intent ?? parsed.intent }
      : null;
  } catch {
    return null;
  }
}

function readableTimelineDetail(detail: string) {
  const reviewPackage = parseExpertRequestDetail(detail);
  return reviewPackage?.intent
    ? `검토 의도 · ${reviewPackage.intent}`
    : detail;
}

const expertV1Nodes = [
  "Review Context",
  "관련 사례",
  "법령·지침",
  "검토 대안",
  "전문가 판단",
  "판단 사유",
] as const;

function ExpertV1SaveAnimation({
  decision,
  onClose,
  onHandoff,
  open,
}: {
  decision: string;
  onClose: () => void;
  onHandoff: () => void;
  open: boolean;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => setPhase(0));
    const timers = [
      window.setTimeout(() => setPhase(1), 450),
      window.setTimeout(() => setPhase(6), 1450),
      window.setTimeout(() => setPhase(7), 2250),
      window.setTimeout(() => setPhase(8), 3000),
    ];
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [open]);

  if (!open) return null;
  const complete = phase >= 8;

  return (
    <div className="knowledge-save-backdrop" role="presentation">
      <section
        aria-labelledby="expert-v1-title"
        aria-live="polite"
        aria-modal="true"
        className="knowledge-save-dialog expert-v1-dialog"
        role="dialog"
      >
        <span className="eyebrow">V1 REVIEW KNOWLEDGE</span>
        <h2 id="expert-v1-title">
          {complete ? "1차 검토지식 저장 완료" : "전문가 판단을 기록하고 있습니다."}
        </h2>
        {!complete && phase < 7 && (
          <ol className="expert-v1-checks">
            {expertV1Nodes.map((label, index) => (
              <li className={phase >= 6 || index === 0 ? "active" : ""} key={label}>
                <span>{phase >= 6 || index === 0 ? "✓" : "·"}</span>
                {label}
              </li>
            ))}
          </ol>
        )}
        {phase === 7 && (
          <div className="v1-structure-stage">
            <article>
              <span>{DISPLAY_CASE_ID}</span>
              <strong>B1 곡선형 램프 R-02</strong>
              <small>{decision}</small>
            </article>
            <i>→</i>
            <div>
              <strong>검토지식 구조화 중</strong>
              <small>검색 가능한 지식으로 연결합니다.</small>
            </div>
          </div>
        )}
        {complete && (
          <>
            <p>
              전문가 판단과 사유가 다음 유사 Context의 검색·추천 근거로
              저장되었습니다.
            </p>
            <div className="poc-kpi asset-kpi">
              <span>PoC 목표</span>
              <strong>검토지식 자산화율 90%</strong>
            </div>
            <div className="knowledge-save-actions">
              <button className="button subtle" onClick={onClose} type="button">
                저장된 판단 확인
              </button>
              <button className="button primary" onClick={onHandoff} type="button">
                동일 Case 검토·반영으로 이동
              </button>
            </div>
          </>
        )}
        {!complete && (
          <button className="skip-v1-animation" onClick={() => setPhase(8)} type="button">
            애니메이션 건너뛰기
          </button>
        )}
      </section>
    </div>
  );
}

function ExpertDecisionCompact({ caseId }: { caseId: string }) {
  const { selectRole } = useDemoRole();
  const [decision, setDecision] = useState("보완 필요");
  const [reason, setReason] = useState(
    "곡선형 램프의 차량 동선·진입 시야·배수 조건을 함께 검토해야 합니다. 회전반경 자료와 집수정 연결 상세가 미확인 상태이므로, 대안별 적용 조건을 확인한 뒤 설계에 반영해 주세요.",
  );
  const [reviewPackage, setReviewPackage] = useState<ExpertReviewPackage | null>(null);
  const [selectedCase, setSelectedCase] = useState(false);
  const [status, setStatus] = useState<WorkflowStatus>("EXPERT_REVIEW_REQUESTED");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveAnimationOpen, setSaveAnimationOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const cached = window.sessionStorage.getItem("lh-expert-review-package");
      const draft = JSON.parse(
        window.sessionStorage.getItem("lh-expert-decision-draft") ?? "null",
      ) as { decision?: string; reason?: string } | null;
      const localStatus = window.localStorage.getItem(WORKFLOW_STATUS_KEY);
      const frame = window.requestAnimationFrame(() => {
        if (cached) setReviewPackage(JSON.parse(cached) as ExpertReviewPackage);
        if (draft?.decision && ["채택", "보완 필요", "기각"].includes(draft.decision)) {
          setDecision(draft.decision);
        }
        if (draft?.reason) setReason(draft.reason);
        if (localStatus) setStatus(localStatus as WorkflowStatus);
        if (new URLSearchParams(window.location.search).get("caseId") === caseId) {
          setSelectedCase(true);
        }
      });
      return () => window.cancelAnimationFrame(frame);
    } catch {
      window.sessionStorage.removeItem("lh-expert-decision-draft");
    }
  }, [caseId]);

  useEffect(() => {
    window.sessionStorage.setItem(
      "lh-expert-decision-draft",
      JSON.stringify({ decision, reason }),
    );
  }, [decision, reason]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workflow?caseId=${encodeURIComponent(caseId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => (await response.json()) as WorkflowApiResponse)
      .then((payload) => {
        const requestEvent = Array.isArray(payload.timeline)
          ? payload.timeline.find((item) => item.title === "전문가 검토 요청")
          : null;
        if (requestEvent?.detail) {
          const nextPackage = parseExpertRequestDetail(requestEvent.detail);
          if (nextPackage) setReviewPackage(nextPackage);
        }
        if (payload.status) setStatus(payload.status);
        if (payload.review) {
          setDecision(payload.review.decision ?? "보완 필요");
          if (payload.review.reason) setReason(payload.review.reason);
          setSaved(true);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [caseId]);

  async function confirmDecision() {
    if (!reason.trim()) {
      setError("판단 사유를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "review", caseId, decision, reason }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "전문가 판단을 저장하지 못했습니다.");
      }
      setSaved(true);
      setStatus("EXPERT_DECISION_SAVED");
      saveWorkflowStatus("EXPERT_DECISION_SAVED");
      setSaveAnimationOpen(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "전문가 판단 저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  const hasAssignment = Boolean(reviewPackage);
  const alternatives = reviewPackage?.alternatives ?? createReviewAlternatives();

  return (
    <AppShell mode="review">
      <div className="page-wrap expert-assignment-page">
        <PageHeading
          kicker="ASSIGNED REVIEW CASES"
          title="배정 검토 안건"
          description="LH 담당자가 검토 요청한 안건만 표시됩니다. 프로젝트 콘솔과 단지 전체 BIM에는 접근하지 않습니다."
        />

        {!selectedCase && (
          <section className="assignment-list" aria-label="배정된 검토 안건 목록">
            <div className="assignment-list-heading">
              <div>
                <span>내 배정 안건</span>
                <strong>{hasAssignment ? "1건" : "0건"}</strong>
              </div>
              <small>동일 reviewCaseId로 LH 요청과 연결됩니다.</small>
            </div>
            {hasAssignment ? (
              <button
                className="assignment-case-card"
                onClick={() => setSelectedCase(true)}
                type="button"
              >
                <span className="assignment-state">
                  {status === "EXPERT_REVIEW_REQUESTED" ? "판단 대기" : "판단 저장"}
                </span>
                <div>
                  <small>{DISPLAY_CASE_ID}</small>
                  <strong>A-17BL 공공주택 · B1 곡선형 램프 R-02</strong>
                  <p>{reviewPackage?.intent}</p>
                </div>
                <span>안건 열기 →</span>
              </button>
            ) : (
              <div className="assignment-empty">
                <span>◎</span>
                <h2>배정된 검토 안건이 없습니다.</h2>
                <p>LH 담당자가 외부 전문가 검토 요청을 보내면 이 목록에 나타납니다.</p>
              </div>
            )}
          </section>
        )}

        {selectedCase && reviewPackage && (
          <>
            <button
              className="back-to-assignments"
              onClick={() => setSelectedCase(false)}
              type="button"
            >
              ← 배정 검토 안건
            </button>
            <header className="expert-case-header">
              <div>
                <span className="case-id">{DISPLAY_CASE_ID}</span>
                <h1>A-17BL 공공주택 · B1 곡선형 램프 R-02</h1>
                <p>지하주차장 B1 · 곡선부 · 차량 동선·시야·배수 복합검토</p>
              </div>
              <span className="status-chip amber">외부 전문가 판단 대기</span>
            </header>

            <section className="expert-case-layout">
              <div className="assigned-bim-view">
                <span>선택 BIM 구간 상세 Viewer</span>
                <BimViewer compact selectedVariant="current" />
                <small>배정된 R-02 구간만 표시 · 단지 전체 BIM 접근 제외</small>
              </div>
              <article className="assigned-intent">
                <span>검토 의도</span>
                <strong>{reviewPackage.intent}</strong>
                <dl>
                  <div>
                    <dt>Review Context</dt>
                    <dd>{reviewPackage.context?.conditions}</dd>
                  </div>
                  <div>
                    <dt>미확인 정보</dt>
                    <dd>
                      {reviewPackage.context?.missingInformation?.join(" · ") ||
                        "회전반경 자료 · 집수정 연결 상세"}
                    </dd>
                  </div>
                </dl>
              </article>
            </section>

            <section className="expert-evidence-sections">
              <details open>
                <summary>관련 사례 · {reviewPackage.similarCases?.length ?? 3}건</summary>
                <div>
                  {(reviewPackage.similarCases ?? [])
                    .slice(0, 3)
                    .map((item, index) => (
                      <article key={`${item.title}-${index}`}>
                        <span>{index === 2 ? "LH 완료 검토 이력" : "외부 VE 사례"}</span>
                        <strong>{item.title}</strong>
                      </article>
                    ))}
                </div>
              </details>
              <details>
                <summary>법령·지침 · {reviewPackage.legalSources?.length ?? 2}건</summary>
                <div>
                  {(reviewPackage.legalSources ?? []).map((source, index) => (
                    <article key={`${source.document_id}-${index}`}>
                      <span>원문·적용 관점</span>
                      <strong>
                        {source.document_id || source.filename}
                        {source.locator ? ` · ${source.locator}` : ""}
                      </strong>
                    </article>
                  ))}
                </div>
              </details>
              <details open>
                <summary>대안 비교 · 현재안 + 대안 1·2·3</summary>
                <div className="expert-alternative-grid">
                  {alternatives.map((item) => (
                    <article key={item.id}>
                      <span>{item.label}</span>
                      <strong>{item.title}</strong>
                      <p>{item.summary}</p>
                      <small>추가 확인 · {item.requiredChecks.join(" · ")}</small>
                    </article>
                  ))}
                </div>
              </details>
            </section>

            <section className="expert-decision-card">
              <div className="ready-section-heading">
                <div>
                  <span className="section-number">V1</span>
                  <div>
                    <span className="eyebrow">EXPERT DECISION</span>
                    <h2>전문가 판단</h2>
                  </div>
                </div>
                <span>판단 사유 필수</span>
              </div>
              <div className="expert-decision-options">
                {["채택", "보완 필요", "기각"].map((item) => (
                  <button
                    className={decision === item ? "selected" : ""}
                    key={item}
                    onClick={() => setDecision(item)}
                    type="button"
                  >
                    <span>{decision === item ? "✓" : ""}</span>
                    {item}
                  </button>
                ))}
              </div>
              <label className="expert-reason-field">
                <span>판단 사유</span>
                <textarea
                  onChange={(event) => setReason(event.target.value)}
                  value={reason}
                />
                <small>V1 검토지식에는 판단과 사유가 함께 저장됩니다.</small>
              </label>
              {error && <div className="ai-error">{error}</div>}
              <div className="expert-confirm-row">
                <span>{saved ? "✓ 같은 Case에 V1 판단이 저장되었습니다." : "저장 전"}</span>
                <button
                  className="button primary"
                  disabled={saving || !reason.trim()}
                  onClick={confirmDecision}
                  type="button"
                >
                  {saving ? "저장 중…" : saved ? "판단 다시 저장" : "V1 전문가 판단 저장"}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
      <ExpertV1SaveAnimation
        decision={decision}
        onClose={() => setSaveAnimationOpen(false)}
        onHandoff={() => {
          setSaveAnimationOpen(false);
          selectRole("lh");
          window.location.href = `/decision?caseId=${encodeURIComponent(caseId)}`;
        }}
        open={saveAnimationOpen}
      />
    </AppShell>
  );
}

const knowledgeSaveNodes = [
  ["C", "Review Context"],
  ["E", "관련 근거"],
  ["J", "전문가 판단"],
  ["A", "설계사 답변"],
  ["LH", "LH 최종 반영"],
  ["DB", "완료 검토지식"],
] as const;

function KnowledgeSaveAnimation({
  mock,
  onClose,
  onViewHistory,
  open,
}: {
  mock: boolean;
  onClose: () => void;
  onViewHistory: () => void;
  open: boolean;
}) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => setActiveStep(1));
    const timers = knowledgeSaveNodes.slice(1).map((_, index) =>
      window.setTimeout(() => setActiveStep(index + 2), 250 * (index + 1)),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [open]);

  if (!open) return null;
  const complete = activeStep >= knowledgeSaveNodes.length;

  return (
    <div className="knowledge-save-backdrop" role="presentation">
      <section
        aria-labelledby="knowledge-save-title"
        aria-live="polite"
        aria-modal="true"
        className="knowledge-save-dialog"
        role="dialog"
      >
        <span className="eyebrow">CONNECTED REVIEW HISTORY</span>
        <h2 id="knowledge-save-title">
          {complete
            ? "Closed Decision Loop가 완성되었습니다."
            : "완료 검토지식을 연결하고 있습니다."}
        </h2>
        <p>
          전문가 판단·설계사 답변·LH 최종 반영 결과가 하나의 완료 검토지식으로
          연결되었습니다.{mock ? " PoC 로컬 저장 상태입니다." : ""}
        </p>
        <ol className="knowledge-save-flow">
          {knowledgeSaveNodes.map(([mark, label], index) => (
            <li className={index < activeStep ? "active" : ""} key={label}>
              <span>{index < activeStep ? "✓" : mark}</span>
              <strong>{label}</strong>
              {index < knowledgeSaveNodes.length - 1 && <i>→</i>}
            </li>
          ))}
        </ol>
        <p className="knowledge-reuse-note">
          동일 Case ID의 전체 타임라인과 함께 다음 검토의 관련 사례로 재사용됩니다.
        </p>
        <div className="knowledge-save-actions">
          <button
            className="button subtle"
            disabled={!complete}
            onClick={onViewHistory}
            type="button"
          >
            동일 Case 이력 보기
          </button>
          <Link className={`button primary ${complete ? "" : "is-disabled"}`} href="/">
            프로젝트로 돌아가기
          </Link>
        </div>
        <button
          aria-label="저장 안내 닫기"
          className="knowledge-save-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </section>
    </div>
  );
}

function DecisionLoop() {
  const [tab, setTab] = useState<"summary" | "timeline" | "files">("summary");
  const [workflowStatus, setWorkflowStatus] =
    useState<WorkflowStatus>("EXPERT_REVIEW_REQUESTED");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reflection, setReflection] = useState("확인대기");
  const [reflectionSaving, setReflectionSaving] = useState(false);
  const [reflectionError, setReflectionError] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowNotice, setWorkflowNotice] = useState("");
  const [verificationChecks, setVerificationChecks] = useState({
    model: false,
    parking: false,
    structural: false,
  });
  const [knowledgeSaveOpen, setKnowledgeSaveOpen] = useState(false);
  const [knowledgeSaveMock, setKnowledgeSaveMock] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<{
    decision?: string;
    reason?: string;
    updated_at?: string;
  } | null>(null);
  const [designerAnswer, setDesignerAnswer] = useState<{
    response?: string;
    reason?: string;
    submitted_at?: string;
  } | null>(null);
  const [liveTimeline, setLiveTimeline] = useState<
    Array<{
      actor: string;
      title: string;
      detail: string;
      state: string;
      created_at: string;
    }>
  >([]);
  const [note, setNote] = useState(
    "",
  );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const frame = window.requestAnimationFrame(() => {
      const localStatus = window.localStorage.getItem(WORKFLOW_STATUS_KEY);
      if (localStatus) setWorkflowStatus(localStatus as WorkflowStatus);
      if (query.get("requested") === "1") {
        setWorkflowStatus("EXPERT_REVIEW_REQUESTED");
        setWorkflowNotice(
          "외부 전문가 검토 요청을 보냈습니다. 역할 전환에서 외부 전문가 View를 선택하면 같은 Case가 배정 목록에 표시됩니다.",
        );
      }
      if (query.get("submitted") === "1") setDrawerOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workflow?caseId=${WORKFLOW_CASE_ID}`, { signal: controller.signal })
      .then(async (response) => (await response.json()) as WorkflowApiResponse)
      .then((workflow) => {
        if (workflow.status) {
          setWorkflowStatus(workflow.status);
          saveWorkflowStatus(workflow.status);
        }
        if (workflow.review) setReviewDecision(workflow.review);
        if (workflow.reflection) {
          setReflection(workflow.reflection.status ?? "확인대기");
          setNote(workflow.reflection.note ?? "");
        }
        if (workflow.designer) setDesignerAnswer(workflow.designer);
        if (Array.isArray(workflow.timeline)) setLiveTimeline(workflow.timeline);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function postWorkflow(
    kind: "designer_request" | "designer_confirm" | "designer_revise",
  ) {
    setWorkflowBusy(true);
    setWorkflowNotice("");
    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, caseId: WORKFLOW_CASE_ID }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; status?: WorkflowStatus }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "상태를 변경하지 못했습니다.");
      let nextStatus =
        result?.status ??
        (kind === "designer_confirm"
          ? "DESIGNER_RESPONSE_CONFIRMED"
          : "DESIGNER_RESPONSE_REQUESTED");
      if (kind === "designer_confirm") {
        const readyResponse = await fetch("/api/workflow", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "final_ready", caseId: WORKFLOW_CASE_ID }),
        });
        const readyResult = (await readyResponse.json().catch(() => null)) as
          | { error?: string; status?: WorkflowStatus }
          | null;
        if (!readyResponse.ok) {
          throw new Error(
            readyResult?.error ?? "V3 최종 반영 준비 상태로 전환하지 못했습니다.",
          );
        }
        nextStatus = readyResult?.status ?? "FINAL_REFLECTION_READY";
      }
      setWorkflowStatus(nextStatus);
      saveWorkflowStatus(nextStatus);
      setDrawerOpen(false);
      setWorkflowNotice(
        kind === "designer_request"
          ? "설계사 보완 요청을 보냈습니다. 같은 Case가 설계사 View에 표시됩니다."
          : kind === "designer_confirm"
            ? "설계사 답변 확인이 완료되어 V3 최종 반영 잠금이 해제되었습니다."
            : "재보완 요청을 보냈습니다.",
      );
    } catch (error) {
      setWorkflowNotice(
        error instanceof Error ? error.message : "워크플로 상태 변경에 실패했습니다.",
      );
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function saveReflection() {
    setReflectionSaving(true);
    setReflectionError("");
    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "reflection",
          caseId: WORKFLOW_CASE_ID,
          status: reflection,
          note,
          verificationChecks,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { persistence?: string; error?: string; missing?: string[] }
        | null;
      if (!response.ok) {
        throw new Error(
          result?.missing?.length
            ? `누락 항목: ${result.missing.join(" · ")}`
            : result?.error ?? "최종 반영 상태를 저장하지 못했습니다.",
        );
      }
      setWorkflowStatus("FINAL_REFLECTION_SAVED");
      saveWorkflowStatus("FINAL_REFLECTION_SAVED");
      setKnowledgeSaveMock(result?.persistence !== "D1");
      setKnowledgeSaveOpen(true);
    } catch (error) {
      setReflectionError(
        error instanceof Error ? error.message : "최종 반영 상태 저장에 실패했습니다.",
      );
    } finally {
      setReflectionSaving(false);
    }
  }

  const visibleTimeline = liveTimeline.length
    ? liveTimeline.map((item) => ({
        date: item.created_at.slice(5, 16).replace("T", " "),
        actor: item.actor,
        title: item.title,
        detail: readableTimelineDetail(item.detail),
        state: item.state || "done",
      }))
    : timeline;
  const expertDone = workflowStatus !== "EXPERT_REVIEW_REQUESTED";
  const designerRequested = [
    "DESIGNER_RESPONSE_REQUESTED",
    "DESIGNER_RESPONSE_PENDING",
    "DESIGNER_RESPONSE_SUBMITTED",
    "DESIGNER_RESPONSE_CONFIRMED",
    "FINAL_REFLECTION_READY",
    "FINAL_REFLECTION_SAVED",
  ].includes(workflowStatus);
  const designerSubmitted = [
    "DESIGNER_RESPONSE_SUBMITTED",
    "DESIGNER_RESPONSE_CONFIRMED",
    "FINAL_REFLECTION_READY",
    "FINAL_REFLECTION_SAVED",
  ].includes(workflowStatus);
  const designerConfirmed = [
    "DESIGNER_RESPONSE_CONFIRMED",
    "FINAL_REFLECTION_READY",
    "FINAL_REFLECTION_SAVED",
  ].includes(workflowStatus);
  const finalReady = workflowStatus === "FINAL_REFLECTION_READY";
  const finalSaved = workflowStatus === "FINAL_REFLECTION_SAVED";
  const checksComplete = Object.values(verificationChecks).every(Boolean);
  const canSaveFinal =
    finalReady && reflection !== "확인대기" && Boolean(note.trim()) && checksComplete;
  const currentStageLabel = finalSaved
    ? "최종 반영 저장 완료"
    : finalReady
      ? "LH 최종 반영"
      : designerSubmitted
        ? "설계사 답변 확인"
        : designerRequested
          ? "설계사 답변 대기"
          : expertDone
            ? "설계사 보완 요청"
            : "외부 전문가 판단 대기";
  const nextAction = finalSaved
    ? "동일 Case의 완료 검토지식과 타임라인 확인"
    : finalReady
      ? "최종 반영 상태·의견·필수 확인항목 저장"
      : designerSubmitted
        ? "설계사 답변과 제출자료 확인"
        : designerRequested
          ? "설계사 답변 수신 후 반영 여부 확인"
          : expertDone
            ? "설계사에 보완 요청 전달"
            : "외부 전문가 판단 수신";

  return (
    <AppShell mode="decision">
      <div className="page-wrap decision-page">
        <PageHeading
          kicker="CLOSED DECISION LOOP"
          title="검토·반영"
          description="전문가 판단 V1 → 설계사 답변 V2 → LH 최종 반영 V3를 같은 Case에 누적합니다."
        />

        <div className="decision-context-bar">
          <div className="decision-case-icon">R</div>
          <div>
            <span>{DISPLAY_CASE_ID} · A-17BL 공공주택</span>
            <strong>B1 곡선형 램프 R-02</strong>
          </div>
          <div className="decision-context-meta">
            <span className="status-chip amber">{currentStageLabel}</span>
            <span>reviewCaseId 유지</span>
          </div>
        </div>

        <section className="decision-progress-brief">
          <div>
            <span>현재 단계</span>
            <strong>{currentStageLabel}</strong>
          </div>
          <div>
            <span>다음 행동</span>
            <strong>{nextAction}</strong>
          </div>
          <code>{workflowStatus}</code>
        </section>
        {workflowNotice && <p className="workflow-notice">{workflowNotice}</p>}

        <nav className="decision-tabs" aria-label="반영 관리 탭">
          <button
            className={tab === "summary" ? "active" : ""}
            onClick={() => setTab("summary")}
            type="button"
          >
            진행 요약
          </button>
          <button
            className={tab === "timeline" ? "active" : ""}
            onClick={() => setTab("timeline")}
            type="button"
          >
            검토·반영 타임라인
          </button>
          <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")} type="button">
            제출자료
          </button>
        </nav>

        {tab === "summary" && (
          <section className="workflow-step-list" aria-label="V1 V2 V3 진행 요약">
            <article className={expertDone ? "complete" : "current"}>
              <header>
                <span>{expertDone ? "✓" : "1"}</span>
                <div>
                  <strong>① 전문가 판단 · V1</strong>
                  <small>{expertDone ? "저장 완료" : "판단 대기"}</small>
                </div>
              </header>
              {expertDone ? (
                <div className="workflow-step-body">
                  <span className="status-chip amber">
                    {reviewDecision?.decision ?? "보완 필요"}
                  </span>
                  <p>
                    {reviewDecision?.reason ??
                      "전문가 판단과 사유가 같은 Case의 V1 검토지식으로 저장되었습니다."}
                  </p>
                </div>
              ) : (
                <div className="workflow-step-body">
                  <p>외부 전문가 View의 배정 검토 안건에 같은 Case가 전달되었습니다.</p>
                  <button
                    className="button primary"
                    onClick={() =>
                      setWorkflowNotice("상단 역할 전환에서 외부 전문가를 선택해 주세요.")
                    }
                    type="button"
                  >
                    외부 전문가 배정 상태 확인
                  </button>
                </div>
              )}
            </article>

            <article
              className={
                designerConfirmed ? "complete" : expertDone ? "current" : "locked"
              }
            >
              <header>
                <span>{designerConfirmed ? "✓" : "2"}</span>
                <div>
                  <strong>② 설계사 답변 · V2</strong>
                  <small>
                    {designerConfirmed
                      ? "답변 확인 완료"
                      : designerSubmitted
                        ? "답변 도착"
                        : designerRequested
                          ? "답변 대기"
                          : expertDone
                            ? "보완 요청 전"
                            : "잠김"}
                  </small>
                </div>
              </header>
              {expertDone && (
                <div className="workflow-step-body">
                  {!designerRequested && (
                    <>
                      <p>대표 PoC 판단은 보완 필요이며 설계사 답변이 필수입니다.</p>
                      <button
                        className="button primary"
                        disabled={workflowBusy}
                        onClick={() => void postWorkflow("designer_request")}
                        type="button"
                      >
                        설계사 보완 요청
                      </button>
                    </>
                  )}
                  {designerRequested && !designerSubmitted && (
                    <>
                      <strong>요청한 보완사항</strong>
                      <ul>
                        <li>회전반경 검토자료</li>
                        <li>집수정 연결 상세</li>
                        <li>수정 BIM 도면</li>
                      </ul>
                      <p>설계사 역할 View에 같은 {DISPLAY_CASE_ID}가 표시됩니다.</p>
                    </>
                  )}
                  {designerSubmitted && !designerConfirmed && (
                    <>
                      <div className="response-arrived-summary">
                        <span>답변 일자 · {designerAnswer?.submitted_at?.slice(0, 10) ?? "2026.07.29"}</span>
                        <span>제출자료 · 3건</span>
                        <span>미반영 항목 · 1건</span>
                      </div>
                      <button
                        className="button primary"
                        onClick={() => setDrawerOpen(true)}
                        type="button"
                      >
                        답변 및 첨부자료 확인
                      </button>
                    </>
                  )}
                  {designerConfirmed && <p>설계사 답변과 제출자료 확인을 완료했습니다.</p>}
                </div>
              )}
            </article>

            <article className={finalSaved ? "complete" : finalReady ? "current" : "locked"}>
              <header>
                <span>{finalSaved ? "✓" : "3"}</span>
                <div>
                  <strong>③ LH 최종 반영 · V3</strong>
                  <small>{finalSaved ? "저장 완료" : finalReady ? "입력 가능" : "잠김"}</small>
                </div>
              </header>
              {!finalReady && !finalSaved && (
                <div className="workflow-step-body locked-copy">
                  <p>설계사 답변과 제출자료를 확인한 뒤 최종 반영 상태를 저장할 수 있습니다.</p>
                  <button className="button primary" disabled type="button">
                    최종 상태 저장 — 비활성
                  </button>
                </div>
              )}
              {finalReady && (
                <div className="workflow-step-body">
                  <div className="reflection-options">
                    {["반영완료", "일부반영", "미반영"].map((item) => (
                      <button
                        className={reflection === item ? "selected" : ""}
                        key={item}
                        onClick={() => setReflection(item)}
                        type="button"
                      >
                        <span className="radio-dot" />
                        {item}
                      </button>
                    ))}
                  </div>
                  <label className="field-label" htmlFor="reflection-note">
                    LH 확인 의견 <b>*</b>
                  </label>
                  <textarea
                    id="reflection-note"
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="최종 반영 판단과 확인 결과를 작성하세요."
                    value={note}
                  />
                  <div className="check-row">
                    {[
                      ["model", "수정 BIM과 도면 대조"],
                      ["structural", "구조계산서 서명본 확인"],
                      ["parking", "법정 주차대수 확인"],
                    ].map(([key, label]) => (
                      <label key={key}>
                        <input
                          checked={verificationChecks[key as keyof typeof verificationChecks]}
                          onChange={(event) =>
                            setVerificationChecks((current) => ({
                              ...current,
                              [key]: event.target.checked,
                            }))
                          }
                          type="checkbox"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="final-prerequisite-list">
                    {[
                      ["V1 전문가 판단 및 사유", expertDone],
                      ["설계사 보완 요청", designerRequested],
                      ["V2 설계사 답변 제출", designerSubmitted],
                      ["LH 답변 확인", designerConfirmed],
                      ["최종 반영 상태 선택", reflection !== "확인대기"],
                      ["LH 확인 의견 작성", Boolean(note.trim())],
                      ["필수 확인항목 완료", checksComplete],
                    ].map(([label, complete]) => (
                      <span className={complete ? "done" : ""} key={String(label)}>
                        {complete ? "✓" : "○"} {String(label)}
                      </span>
                    ))}
                  </div>
                  <div className="form-actions">
                    <span>{canSaveFinal ? "저장 조건 충족" : "필수 조건을 확인해 주세요."}</span>
                    <button
                      className="button primary"
                      disabled={!canSaveFinal || reflectionSaving}
                      onClick={saveReflection}
                      type="button"
                    >
                      {reflectionSaving ? "저장 중…" : "V3 최종 상태 저장"}
                    </button>
                  </div>
                  {reflectionError && (
                    <p className="reflection-save-error">{reflectionError}</p>
                  )}
                </div>
              )}
              {finalSaved && (
                <div className="workflow-step-body">
                  <span className="status-chip green">{reflection}</span>
                  <p>{note}</p>
                  <button
                    className="button subtle"
                    onClick={() => setKnowledgeSaveOpen(true)}
                    type="button"
                  >
                    완료 검토지식 연결 보기
                  </button>
                </div>
              )}
            </article>
          </section>
        )}

        {tab === "timeline" && (
          <section className="timeline-view">
            <div className="timeline-heading">
              <span className="eyebrow">AUDITABLE HISTORY</span>
              <h2>검토·반영 타임라인</h2>
              <p>누가 어떤 근거로 판단하고 무엇을 제출·확인했는지 한 흐름으로 남깁니다.</p>
            </div>
            <div className="timeline-list">
              {visibleTimeline.map((item) => (
                <article className={item.state} key={`${item.date}-${item.title}`}>
                  <time>{item.date}</time>
                  <span className="timeline-dot" />
                  <div>
                    <small>{item.actor}</small>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "files" && (
          <section className="submitted-files-view">
            <div>
              <span className="eyebrow">SUBMITTED MATERIALS</span>
              <h2>설계사 제출자료</h2>
              <p>V2 답변과 같은 Case에 연결된 Mock 산출물입니다.</p>
            </div>
            {designerSubmitted ? (
              <div className="submitted-file-grid">
                {[
                  ["IFC", "A17_B1_RAMP_REV03.ifc", "수정 BIM"],
                  ["PDF", "B1_램프_배수·동선_변경도면.pdf", "변경도면"],
                  ["XLSX", "회전반경·주차대수_검토표.xlsx", "검토자료"],
                ].map(([type, name, label]) => (
                  <article key={name}>
                    <span>{type}</span>
                    <div>
                      <strong>{name}</strong>
                      <small>{label} · 제출 완료</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-files">설계사 답변 제출 후 자료가 표시됩니다.</p>
            )}
          </section>
        )}
      </div>
      <DesignerAnswerDrawer
        answer={designerAnswer}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onConfirm={() => void postWorkflow("designer_confirm")}
        onRequestRevision={() => void postWorkflow("designer_revise")}
      />
      <KnowledgeSaveAnimation
        mock={knowledgeSaveMock}
        onClose={() => setKnowledgeSaveOpen(false)}
        onViewHistory={() => {
          setKnowledgeSaveOpen(false);
          setTab("timeline");
        }}
        open={knowledgeSaveOpen}
      />
    </AppShell>
  );
}

function DesignerPortal() {
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [response, setResponse] = useState(
    "제안된 대안 A를 기준으로 보조 램프를 중앙부에 추가했습니다. 기존 램프 진입방향도 중앙부로 조정했습니다.",
  );
  const [reason, setReason] = useState(
    "구조벽 위치로 인해 VE 사례와 동일한 6.5m 폭은 적용하지 못하고 유효폭 6.2m로 조정했습니다.",
  );
  const [attached, setAttached] = useState(false);
  const [checks, setChecks] = useState([true, true, false]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [evidenceNotice, setEvidenceNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const savedDraft = window.sessionStorage.getItem("lh-designer-draft");
    if (!savedDraft) return;
    try {
      const draft = JSON.parse(savedDraft) as {
        response?: string;
        reason?: string;
        attached?: boolean;
        checks?: boolean[];
      };
      const frame = window.requestAnimationFrame(() => {
        if (draft.response) setResponse(draft.response);
        if (draft.reason) setReason(draft.reason);
        if (typeof draft.attached === "boolean") setAttached(draft.attached);
        if (Array.isArray(draft.checks) && draft.checks.length === 3) {
          setChecks(draft.checks);
        }
      });
      return () => window.cancelAnimationFrame(frame);
    } catch {
      window.sessionStorage.removeItem("lh-designer-draft");
    }
  }, []);

  useEffect(() => {
    const localStatus = window.localStorage.getItem(WORKFLOW_STATUS_KEY);
    const frame = window.requestAnimationFrame(() => {
      if (localStatus) setWorkflowStatus(localStatus as WorkflowStatus);
    });
    const controller = new AbortController();
    fetch(`/api/workflow?caseId=${encodeURIComponent(WORKFLOW_CASE_ID)}`, {
      signal: controller.signal,
    })
      .then(async (result) => (await result.json()) as WorkflowApiResponse)
      .then(async (result) => {
        let nextStatus = result.status;
        if (result.status === "DESIGNER_RESPONSE_REQUESTED") {
          const pendingResponse = await fetch("/api/workflow", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "designer_pending",
              caseId: WORKFLOW_CASE_ID,
            }),
          });
          const pendingResult = (await pendingResponse
            .json()
            .catch(() => null)) as { status?: WorkflowStatus } | null;
          if (pendingResponse.ok) {
            nextStatus = pendingResult?.status ?? "DESIGNER_RESPONSE_PENDING";
            saveWorkflowStatus(nextStatus);
          }
        }
        if (nextStatus) setWorkflowStatus(nextStatus);
      })
      .catch(() => undefined);
    return () => {
      window.cancelAnimationFrame(frame);
      controller.abort();
    };
  }, []);

  function saveDesignerDraft() {
    window.sessionStorage.setItem(
      "lh-designer-draft",
      JSON.stringify({ response, reason, attached, checks }),
    );
    setDraftSaved(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const request = await fetch("/api/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "designer",
          caseId: WORKFLOW_CASE_ID,
          response,
          reason,
          attachments: attached
            ? ["A17_B2_RAMP_REV03.ifc", "지하2층_주차동선_변경도면.pdf"]
            : [],
        }),
      });
      const result = (await request.json().catch(() => null)) as
        | { error?: string; status?: WorkflowStatus }
        | null;
      if (!request.ok) throw new Error(result?.error ?? "답변을 저장하지 못했습니다.");
      setWorkflowStatus("DESIGNER_RESPONSE_SUBMITTED");
      saveWorkflowStatus("DESIGNER_RESPONSE_SUBMITTED");
      setSubmitted(true);
      setSubmitting(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "재제출에 실패했습니다.");
      setSubmitting(false);
    }
  }

  const assigned = Boolean(
    workflowStatus &&
      [
        "DESIGNER_RESPONSE_REQUESTED",
        "DESIGNER_RESPONSE_PENDING",
        "DESIGNER_RESPONSE_SUBMITTED",
        "DESIGNER_RESPONSE_CONFIRMED",
        "FINAL_REFLECTION_READY",
        "FINAL_REFLECTION_SAVED",
      ].includes(workflowStatus),
  );

  return (
    <AppShell mode="designer">
      <div className="page-wrap designer-page">
        <section className="designer-project-strip">
          <div>
            <span className="lh-hero-label">A-17BL PUBLIC HOUSING</span>
            <h1>A-17BL 공공주택</h1>
            <p>설계검토 의견 확인 및 수정안 제출</p>
          </div>
          <div className="lh-hero-status" aria-label="프로젝트 상태">
            <span>실시설계</span>
            <span><i /> BIM 검증 완료</span>
          </div>
        </section>
        <div className="designer-banner">
          <div>
            <span className="eyebrow">DESIGNER RESPONSE PORTAL</span>
            <h1>검토의견을 확인하고 수정안을 재제출하세요</h1>
            <p>LH가 전달한 의견과 근거는 읽기 전용이며, 답변과 수정 산출물만 작성합니다.</p>
          </div>
          <div className="designer-assignment-chip">
            <span>배정 Case</span>
            <strong>{assigned ? DISPLAY_CASE_ID : "0건"}</strong>
          </div>
        </div>

        {!assigned ? (
          <section className="designer-empty assignment-empty">
            <span>◎</span>
            <h2>배정된 보완 Case가 없습니다.</h2>
            <p>LH 담당자가 설계사 보완 요청을 보내면 같은 Case가 이 화면에 표시됩니다.</p>
          </section>
        ) : (
        <div className="designer-layout">
          <aside className="review-readonly">
            <div className="readonly-head">
              <span className="status-chip amber">보완필요</span>
              <span className="case-id">{DISPLAY_CASE_ID}</span>
            </div>
            <h2>램프 편중 배치 및 외곽방향 진입</h2>
            <p className="review-opinion">
              대안 A를 기준으로 검토하되, 추가 램프 구간의 구조계산·소방 동선·법정
              주차대수를 재확인한 수정안을 제출해 주세요.
            </p>
            <div className="readonly-meta">
              <span>발신 · 박지연 / LH</span>
              <span>회신기한 · 2026.07.29</span>
            </div>
            <div className="readonly-evidence">
              <span className="eyebrow">공유된 근거</span>
              <button
                onClick={() => setEvidenceNotice("VE 사례 상세는 읽기 전용 근거로 연결됩니다.")}
                type="button"
              >
                <i className="evidence-icon ve">VE</i>
                <span>
                  <strong>DET-2022-P098</strong>
                  <small>램프 추가설치 · 채택 · L4</small>
                </span>
                <b>↗</b>
              </button>
              <button
                onClick={() => setEvidenceNotice("법령 원문은 적용조건 확인용 읽기 화면으로 연결됩니다.")}
                type="button"
              >
                <i className="evidence-icon law">§</i>
                <span>
                  <strong>주차장법 시행규칙 제6조</strong>
                  <small>출입구 시야·차로 · 적용성 확인</small>
                </span>
                <b>↗</b>
              </button>
              <button
                onClick={() => setEvidenceNotice("LH 지침은 발주·납품 조건 확인용 근거입니다.")}
                type="button"
              >
                <i className="evidence-icon law">LH</i>
                <span>
                  <strong>공동주택 BIM 적용지침</strong>
                  <small>발주·납품 조건 우선 · L3 추론</small>
                </span>
                <b>↗</b>
              </button>
              {evidenceNotice && <p className="evidence-link-notice">{evidenceNotice}</p>}
            </div>
            <div className="readonly-warning">
              <strong>확인 필요 3건</strong>
              <p>주차장 유형 · 구조/지반 조건 · 관할 조례</p>
            </div>
          </aside>

          <form className="response-form" onSubmit={submit}>
            <div className="form-section">
              <div className="form-section-head">
                <span>01</span>
                <div>
                  <h3>항목별 답변</h3>
                  <p>검토의견에 대한 조치 내용과 변경 위치를 구체적으로 작성하세요.</p>
                </div>
              </div>
              <label className="field-label" htmlFor="designer-response">
                조치 내용 <b>*</b>
              </label>
              <textarea
                id="designer-response"
                onChange={(event) => setResponse(event.target.value)}
                value={response}
              />
              <div className="response-checks">
                {["중앙부 보조 램프 추가", "기존 램프 진입방향 조정", "구조·소방 재검토"].map(
                  (item, index) => (
                    <label key={item}>
                      <input
                        checked={checks[index]}
                        onChange={() =>
                          setChecks((current) =>
                            current.map((value, currentIndex) =>
                              currentIndex === index ? !value : value,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      {item}
                    </label>
                  ),
                )}
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-head">
                <span>02</span>
                <div>
                  <h3>수정 산출물 첨부</h3>
                  <p>BIM, 변경도면, 계산서를 한 번에 첨부할 수 있습니다. (Mock)</p>
                </div>
              </div>
              {!attached ? (
                <button
                  className="upload-zone"
                  onClick={() => setAttached(true)}
                  type="button"
                >
                  <span>＋</span>
                  <strong>파일을 선택하거나 여기로 끌어오세요</strong>
                  <small>IFC · RVT · DWG · PDF · XLSX / 파일당 최대 200MB</small>
                </button>
              ) : (
                <div className="uploaded-files">
                  <div>
                    <span>IFC</span>
                    <div>
                      <strong>A17_B2_RAMP_REV03.ifc</strong>
                      <small>42.8 MB · 업로드 완료</small>
                    </div>
                    <button onClick={() => setAttached(false)} type="button">
                      ×
                    </button>
                  </div>
                  <div>
                    <span>PDF</span>
                    <div>
                      <strong>지하2층_주차동선_변경도면.pdf</strong>
                      <small>8.4 MB · 업로드 완료</small>
                    </div>
                    <button onClick={() => setAttached(false)} type="button">
                      ×
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="form-section">
              <div className="form-section-head">
                <span>03</span>
                <div>
                  <h3>미반영·일부반영 사유</h3>
                  <p>원안과 다르게 반영한 부분의 기술적·행정적 사유를 작성하세요.</p>
                </div>
              </div>
              <label className="field-label" htmlFor="designer-reason">
                사유
              </label>
              <textarea
                id="designer-reason"
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </div>

            <div className="submit-bar">
              <div>
                <strong>
                  {submitted
                    ? "LH에 V2 답변이 제출되었습니다."
                    : "제출 후 LH 담당자 View에 답변 도착으로 표시됩니다."}
                </strong>
                <small>
                  {submitError ||
                    (submitted
                      ? `같은 ${DISPLAY_CASE_ID}에 답변과 자료가 연결되었습니다.`
                      : "답변과 제출자료는 같은 Case에 누적됩니다.")}
                </small>
              </div>
              <button className="button subtle" onClick={saveDesignerDraft} type="button">
                {draftSaved ? "저장됨 ✓" : "임시저장"}
              </button>
              <button className="button primary" disabled={submitting || submitted} type="submit">
                {submitting ? "제출 중…" : submitted ? "제출 완료 ✓" : "LH에 제출 →"}
              </button>
            </div>
          </form>
        </div>
        )}
      </div>
    </AppShell>
  );
}

export function PrototypeApp({ mode }: { mode: PrototypeMode }) {
  const [role, setRole] = useState<DemoRole | null>(null);

  useEffect(() => {
    const queryRole = new URLSearchParams(window.location.search).get("role");
    const savedRole = window.localStorage.getItem(ACTIVE_ROLE_KEY);
    const nextRole = (
      ["lh", "expert", "designer"].includes(queryRole ?? "")
        ? queryRole
        : ["lh", "expert", "designer"].includes(savedRole ?? "")
          ? savedRole
          : null
    ) as DemoRole | null;
    const frame = window.requestAnimationFrame(() => setRole(nextRole));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function selectRole(nextRole: DemoRole | null) {
    if (!nextRole) {
      window.localStorage.removeItem(ACTIVE_ROLE_KEY);
      setRole(null);
      window.history.replaceState({}, "", "/");
      return;
    }
    window.localStorage.setItem(ACTIVE_ROLE_KEY, nextRole);
    setRole(nextRole);
    if (window.location.pathname !== roleMeta[nextRole].home) {
      window.location.href = roleMeta[nextRole].home;
    }
  }

  if (!role) return <RoleSelection onSelect={selectRole} />;

  let view: React.ReactNode;
  if (role === "expert") {
    view = <ExpertDecisionCompact caseId={WORKFLOW_CASE_ID} />;
  } else if (role === "designer") {
    view = <DesignerPortal />;
  } else if (mode === "review") {
    view = <ReviewWorkspace />;
  } else if (mode === "decision") {
    view = <DecisionLoop />;
  } else {
    view = <Dashboard />;
  }

  return (
    <RoleContext.Provider value={{ role, selectRole }}>{view}</RoleContext.Provider>
  );
}
