"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BimViewer, type BimVariant } from "@/app/bim-viewer";
import {
  createReviewAlternatives,
  type AiHealth,
  type ReviewAlternative,
  type ReviewPackage,
  type ReviewSourceMode,
  type SourceReference,
} from "@/lib/review-copilot";

type ResultTab = "context" | "cases" | "laws" | "alternatives";
type ImpactTone = "positive" | "negative" | "conditional" | "neutral";
type ImpactKey =
  | "geometry"
  | "movement"
  | "drainage"
  | "parking"
  | "time"
  | "cost";

const FULL_EVIDENCE_PDF = "/assets/A-17BL_B1-R02_AI-review-full-evidence.pdf";

const resultSteps: Array<{ id: ResultTab; label: string }> = [
  { id: "context", label: "Context 요약" },
  { id: "cases", label: "관련 사례" },
  { id: "laws", label: "법령·지침" },
  { id: "alternatives", label: "대안 비교·영향" },
];

const fallbackCases: ReviewPackage["similar_cases"] = [
  {
    title: "곡선형 램프 내측 벽체 조정 사례",
    similarity_reason: "곡선부 진입 시야와 차량 회전 간섭을 함께 검토한 사례",
    different_conditions: ["과거 사례는 외기 비노출이며 현재안은 배수조건 확인 필요"],
    evidence_ids: [],
  },
  {
    title: "램프 하부 우수유입 방지 트렌치 설치 사례",
    similarity_reason: "램프 종점부 우수 유입과 트렌치 위치를 함께 검토한 사례",
    different_conditions: ["현재안은 집수정 연결 상세와 동절기 운영조건 확인 필요"],
    evidence_ids: [],
  },
  {
    title: "주차장 램프 진출입 동선 개선 사례",
    similarity_reason: "인접 주차면과 램프 차량 궤적 간섭을 검토한 사례",
    different_conditions: ["과거 사례와 현재 램프의 구배·회전반경이 다름"],
    evidence_ids: [],
  },
];

const fallbackLaws: SourceReference[] = [
  {
    source_id: "fallback-law-1",
    document_id: "주차장법 시행규칙",
    filename: "주차장법 시행규칙",
    source_kind: "법령",
    locator: "제6조",
    excerpt: "곡선형 경사로의 구조와 유효폭 관련 확인 기준",
    score: 0,
    metadata: {
      version: "프로토타입 기준 데이터 2026.07.23",
      caution: "현재 시설 유형과 램프 구조가 적용대상인지 전문가 확인 필요",
      validation: "시연 데이터",
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
      version: "프로토타입 기준 데이터 2026.07.23",
      caution: "발주·납품 단계와 적용 범위 확인 필요",
      validation: "시연 데이터",
    },
  },
];

function textMetadata(
  source: SourceReference | undefined,
  keys: string[],
  fallback: string,
) {
  for (const key of keys) {
    const value = source?.metadata[key];
    if (value !== null && value !== undefined && value !== "") return String(value);
  }
  return fallback;
}

function sourceStatus(mode: ReviewSourceMode, health: AiHealth | null) {
  if (mode === "llm" && health?.llm_configured) return "AI 연결됨";
  if (mode === "rule") return "규칙 기반 RAG";
  if (!health?.fallback_active) return "Mock 모드";
  return "AI 연결 실패·시연 데이터 사용";
}

function caseRelevance(title: string) {
  return [
    /램프/.test(title) ? 4 : 0,
    /벽체|옹벽|트렌치|배수|동선|시야/.test(title) ? 3 : 0,
    /공통|확인 불가/.test(title) ? -3 : 0,
  ].reduce((sum, score) => sum + score, 0);
}

function inferredImprovement(title: string) {
  if (/벽체|옹벽/.test(title)) return "내측 벽체·옹벽의 일부 후퇴 또는 개방";
  if (/트렌치|배수|우수/.test(title)) return "트렌치 설치·위치 조정과 집수정 연결 검토";
  if (/동선|진출입/.test(title)) return "차량 궤적과 인접 주차면 운영범위 조정";
  return "도면 표기 보완과 적용조건 재확인";
}

function impactPresentation(
  alternative: ReviewAlternative,
  key: ImpactKey,
) {
  if (alternative.id === "current") {
    return { icon: "•", tone: "neutral" as ImpactTone, source: "변화 없음" };
  }
  if (key === "parking") {
    return { icon: "↓", tone: "negative" as ImpactTone, source: "운영조건 확인" };
  }
  if (key === "movement" && alternative.id === "alt1") {
    return { icon: "↑", tone: "positive" as ImpactTone, source: "PoC 가정" };
  }
  if (key === "movement" && alternative.id === "alt2") {
    return { icon: "△", tone: "conditional" as ImpactTone, source: "데이터 기반" };
  }
  if (key === "movement" && alternative.id === "alt3") {
    return { icon: "•", tone: "neutral" as ImpactTone, source: "변화 없음" };
  }
  if (key === "drainage" && alternative.id === "alt2") {
    return { icon: "↑", tone: "positive" as ImpactTone, source: "데이터 기반" };
  }
  if (key === "drainage") {
    return { icon: "•", tone: "neutral" as ImpactTone, source: "변화 없음" };
  }
  if (key === "cost") {
    return { icon: "△", tone: "conditional" as ImpactTone, source: "산출자료 필요" };
  }
  if (key === "time") {
    return { icon: "△", tone: "conditional" as ImpactTone, source: "산출자료 필요" };
  }
  return { icon: "△", tone: "conditional" as ImpactTone, source: "데이터 기반" };
}

export function PreparedReviewResults({
  aiError,
  aiHealth,
  aiPackage,
  missingDecision,
  onBack,
  onEdit,
  onMissingDecision,
  onRequest,
  requesting,
  requestError,
  scenarioIds,
}: {
  aiError: string;
  aiHealth: AiHealth | null;
  aiPackage: ReviewPackage;
  missingDecision: string;
  onBack: () => void;
  onEdit: () => void;
  onMissingDecision: (decision: string) => void;
  onRequest: () => void;
  requesting: boolean;
  requestError: string;
  scenarioIds: string[];
}) {
  const [tab, setTab] = useState<ResultTab>("context");
  const [variant, setVariant] = useState<BimVariant>("current");
  const [expandedCases, setExpandedCases] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const requestedStep = new URLSearchParams(window.location.search).get("step");
    const savedStep = window.sessionStorage.getItem("lh-review-result-step");
    const nextStep = requestedStep ?? savedStep;
    const savedVariant = window.sessionStorage.getItem("lh-review-bim-variant");
    const frame = window.requestAnimationFrame(() => {
      if (resultSteps.some((step) => step.id === nextStep)) {
        setTab(nextStep as ResultTab);
      }
      if (variantsContain(savedVariant)) setVariant(savedVariant);

      try {
        const savedCases = JSON.parse(
          window.sessionStorage.getItem("lh-expanded-review-cases") ?? "[]",
        ) as string[];
        if (Array.isArray(savedCases)) setExpandedCases(savedCases);
      } catch {
        window.sessionStorage.removeItem("lh-expanded-review-cases");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const cases = [
    ...(aiPackage.similar_cases.length ? aiPackage.similar_cases : fallbackCases),
  ]
    .sort((left, right) => caseRelevance(right.title) - caseRelevance(left.title))
    .slice(0, 3);
  const laws = useMemo(() => {
    const connected = aiPackage.sources
      .filter((source) => /법령|지침|BIM/.test(source.source_kind))
      .slice(0, 3);
    return connected.length ? connected : fallbackLaws;
  }, [aiPackage.sources]);
  const alternatives =
    aiPackage.alternatives.length === 4
      ? aiPackage.alternatives
      : createReviewAlternatives(aiPackage.cited_source_ids);
  const missing = aiPackage.missing_information.slice(0, 3);
  const showDiagnostics = process.env.NODE_ENV !== "production";
  const activeIndex = resultSteps.findIndex((step) => step.id === tab);

  const goToTab = (nextTab: ResultTab) => {
    setTab(nextTab);
    window.sessionStorage.setItem("lh-review-result-step", nextTab);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectVariant = (nextVariant: BimVariant) => {
    setVariant(nextVariant);
    window.sessionStorage.setItem("lh-review-bim-variant", nextVariant);
  };

  const toggleCase = (title: string) => {
    setExpandedCases((current) => {
      const next = current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title];
      window.sessionStorage.setItem("lh-expanded-review-cases", JSON.stringify(next));
      return next;
    });
  };

  return (
    <section className="prepared-review-screen">
      <nav className="review-location-path" aria-label="현재 BIM 위치">
        <Link href="/">A-17BL 공동주택</Link>
        <span>›</span>
        <span>지하주차장 B1</span>
        <span>›</span>
        <strong>곡선형 램프 R-02</strong>
        <Link href="/">전체 프로젝트로 돌아가기</Link>
      </nav>

      <header className="prepared-review-header">
        <div className="ready-check">✓</div>
        <div>
          <span className="eyebrow">AI REVIEW PACKAGE READY</span>
          <h1>검토 준비가 완료됐습니다.</h1>
          <p>AI가 BIM 공간조건을 분석하고 관련 사례·법령·검토 대안을 정리했습니다.</p>
        </div>
        {showDiagnostics && (
          <span className={`source-mode-chip mode-${aiPackage.sourceMode}`}>
            <i /> {sourceStatus(aiPackage.sourceMode, aiHealth)}
          </span>
        )}
      </header>

      <aside className="poc-kpi package-kpi" aria-label="검토자료 준비시간 PoC 목표">
        <div>
          <span>PoC 목표</span>
          <strong>검토자료 준비시간 30% 단축</strong>
        </div>
        <p>
          BIM Context, 관련 사례, 법령·지침과 미확인 정보를 하나의 검토 패키지로
          구성했습니다.
        </p>
      </aside>

      {aiError && <div className="ai-error">{aiError}</div>}

      {showDiagnostics && (
        <details className="ai-diagnostics">
          <summary>개발용 AI 연결 상태</summary>
          <div>
            <span>
              호출 경로{" "}
              <strong>
                {aiPackage.sourceMode === "llm" ? "외부 LLM Provider" : "내장 RAG"}
              </strong>
            </span>
            <span>
              모델 <strong>{aiPackage.model}</strong>
            </span>
            <span>
              검색 시나리오 <strong>{scenarioIds.join(" · ")}</strong>
            </span>
            <span>
              검색 근거 <strong>{aiPackage.sources.length}건</strong>
            </span>
            <span>
              화면 반영 <strong>완료</strong>
            </span>
          </div>
          <p>API 키와 비밀정보는 화면과 로그에 포함하지 않습니다.</p>
        </details>
      )}

      <div className="prepared-review-layout">
        <aside className="prepared-bim-column">
          <BimViewer compact onVariantChange={selectVariant} selectedVariant={variant} />
          <div className="selected-target-summary">
            <span>선택된 검토 대상</span>
            <strong>B1 곡선형 램프 R-02</strong>
            <small>곡선부 · 구배 14% · 내측 벽체 · 인접 주차면</small>
          </div>
        </aside>

        <div className="prepared-result-column" ref={panelRef}>
          <ol className="review-result-progress" aria-label="AI 검토 결과 진행 단계">
            {resultSteps.map((step, index) => (
              <li
                aria-current={tab === step.id ? "step" : undefined}
                className={
                  tab === step.id ? "active" : index < activeIndex ? "complete" : ""
                }
                key={step.id}
              >
                <span>{index < activeIndex ? "✓" : index + 1}</span>
                <strong>{step.label}</strong>
              </li>
            ))}
          </ol>

          <div className="review-result-panel">
            {tab === "context" && (
              <section aria-label="AI가 확인한 Context">
                <div className="result-section-heading">
                  <div>
                    <span className="eyebrow">REVIEW CONTEXT</span>
                    <h2>AI가 확인한 Context</h2>
                  </div>
                  <strong>6개 맥락 확인</strong>
                </div>
                <div className="compact-context-grid">
                  <article>
                    <span>검토 대상</span>
                    <strong>B1 곡선형 램프 R-02</strong>
                  </article>
                  <article>
                    <span>공간조건</span>
                    <p>곡선형 · 구배 14% · 내측 벽체 · 인접 주차면</p>
                  </article>
                  <article>
                    <span>함께 확인한 객체</span>
                    <p>벽체 · 트렌치 · 집수정 · 차량 동선 · 차단기·검지코일</p>
                  </article>
                  <article className="missing">
                    <span>미확인 정보</span>
                    <p>{missing.join(" · ") || "추가 미확인 정보 없음"}</p>
                  </article>
                </div>
                <details className="context-details">
                  <summary>검토 범위 자세히 보기</summary>
                  <p>{aiPackage.summary}</p>
                  <small>자동 연결 근거 · {scenarioIds.join(" + ")}</small>
                </details>
                {missing[0] && !missingDecision && (
                  <div className="single-missing-question compact-question">
                    <div>
                      <span>추가 확인사항</span>
                      <strong>{missing[0]}가 확인되지 않았습니다.</strong>
                      <small>검토를 막지 않고 패키지에 추가 확인사항으로 남길 수 있습니다.</small>
                    </div>
                    <div>
                      <button
                        className="button subtle"
                        onClick={() => onMissingDecision("도면에서 확인 예정")}
                        type="button"
                      >
                        도면에서 확인
                      </button>
                      <button className="button subtle" onClick={onEdit} type="button">
                        자료 첨부
                      </button>
                      <button
                        className="button subtle"
                        onClick={() => onMissingDecision("미확인 상태로 계속")}
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
              </section>
            )}

            {tab === "cases" && (
              <section aria-label="관련 사례">
                <div className="result-section-heading">
                  <div>
                    <span className="eyebrow">CONNECTED REVIEW EVIDENCE</span>
                    <h2>관련 사례</h2>
                  </div>
                  <div className="result-heading-actions">
                    <p>현재 검토조건과 관련도가 높은 근거 3건을 먼저 표시합니다.</p>
                    <a
                      className="evidence-pdf-download"
                      download="A-17BL_B1-R02_AI설계검토_전체근거.pdf"
                      href={FULL_EVIDENCE_PDF}
                    >
                      전체 근거 PDF <span>↓</span>
                    </a>
                  </div>
                </div>
                <div className="case-reuse-summary">
                  <div>
                    <span>이번 검토에 연결된 사례</span>
                    <dl>
                      <div>
                        <dt>외부 VE 사례</dt>
                        <dd>2건</dd>
                      </div>
                      <div>
                        <dt>LH 완료 검토 이력</dt>
                        <dd>1건</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="reuse-actual">
                    <span>현재 검토 패키지</span>
                    <strong>내부 완료 이력 1건 활용</strong>
                  </div>
                  <div className="poc-kpi reuse-kpi">
                    <span>PoC 목표</span>
                    <strong>검증지식 재사용률 60%</strong>
                  </div>
                </div>
                <div className="case-detail-list">
                  {cases.slice(0, 2).map((item, index) => {
                    const source = aiPackage.sources.find((candidate) =>
                      item.evidence_ids.includes(candidate.source_id),
                    );
                    const expanded = expandedCases.includes(item.title);
                    return (
                      <article key={`${item.title}-${index}`}>
                        <div className="case-card-heading">
                          <span>외부 VE 사례</span>
                          <div>
                            <h3>{item.title}</h3>
                            <p>{item.similarity_reason}</p>
                          </div>
                        </div>
                        <div className="case-quick-summary">
                          <span>적용 공간·객체</span>
                          <strong>
                            {textMetadata(
                              source,
                              ["space", "object", "candidate_name"],
                              "곡선형 램프 · 내측 벽체 · 차량 동선",
                            )}
                          </strong>
                        </div>
                        <button
                          aria-expanded={expanded}
                          className="case-expand-button"
                          onClick={() => toggleCase(item.title)}
                          type="button"
                        >
                          {expanded ? "사례 상세 닫기" : "사례 상세 보기"}{" "}
                          <span>{expanded ? "−" : "+"}</span>
                        </button>
                        {expanded && (
                          <div className="case-expanded-detail">
                            <dl>
                              <div>
                                <dt>해결하려던 문제</dt>
                                <dd>
                                  {textMetadata(
                                    source,
                                    ["issue", "problem"],
                                    item.similarity_reason,
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>개선행위</dt>
                                <dd>
                                  {textMetadata(
                                    source,
                                    ["action", "improvement"],
                                    inferredImprovement(item.title),
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>유사한 이유</dt>
                                <dd>{item.similarity_reason}</dd>
                              </div>
                              <div>
                                <dt>다른 조건</dt>
                                <dd>{item.different_conditions.join(" · ")}</dd>
                              </div>
                              <div>
                                <dt>원문 출처</dt>
                                <dd>
                                  {source
                                    ? `${source.filename}${source.locator ? ` · ${source.locator}` : ""}`
                                    : "시나리오 표준화 사례 데이터"}
                                </dd>
                              </div>
                            </dl>
                            <p>
                              {source?.excerpt ??
                                "현재 설계에 그대로 적용하지 않고 대안 탐색 근거로 사용합니다."}
                            </p>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  <article className="completed-review-case">
                    <div className="case-card-heading">
                      <span>LH 완료 검토 이력</span>
                      <div>
                        <h3>A-17BL B1 곡선형 램프 배수·시야 검토</h3>
                        <p>곡선형 램프 · 내측 벽체 · 배수 트렌치 조건이 연결됩니다.</p>
                      </div>
                      <strong className="package-used-badge">검토 패키지에 활용됨</strong>
                    </div>
                    <dl className="completed-case-detail">
                      <div>
                        <dt>유사한 조건</dt>
                        <dd>곡선형 램프 · 내측 벽체 · 배수 트렌치</dd>
                      </div>
                      <div>
                        <dt>다른 조건</dt>
                        <dd>현재 대상은 외기 노출·결빙조건 추가 확인 필요</dd>
                      </div>
                      <div>
                        <dt>전문가 판단</dt>
                        <dd>보완 필요</dd>
                      </div>
                      <div>
                        <dt>설계사 답변</dt>
                        <dd>트렌치 위치 조정 및 집수정 상세 추가</dd>
                      </div>
                      <div>
                        <dt>LH 최종 결과</dt>
                        <dd>일부 반영</dd>
                      </div>
                    </dl>
                  </article>
                </div>
              </section>
            )}

            {tab === "laws" && (
              <section aria-label="관련 법령과 지침">
                <div className="result-section-heading">
                  <div>
                    <span className="eyebrow">LEGAL & GUIDELINE REFERENCES</span>
                    <h2>관련 법령·지침</h2>
                  </div>
                  <div className="result-heading-actions">
                    <p>현재 검토조건과 관련도가 높은 근거 3건을 먼저 표시합니다.</p>
                    <a
                      className="evidence-pdf-download"
                      download="A-17BL_B1-R02_AI설계검토_전체근거.pdf"
                      href={FULL_EVIDENCE_PDF}
                    >
                      전체 근거 PDF <span>↓</span>
                    </a>
                  </div>
                </div>
                <div className="law-detail-list">
                  {laws.map((source) => {
                    const direct =
                      Boolean(source.metadata.quotation_id) ||
                      /확정|검증/.test(String(source.metadata.validation ?? ""));
                    const documentTitle = textMetadata(
                      source,
                      ["document_name", "candidate_name"],
                      source.filename || source.document_id,
                    );
                    return (
                      <article key={source.source_id}>
                        <div className="law-card-heading">
                          <span className={direct ? "direct" : "interpretation"}>
                            {source.source_kind || (direct ? "직접 근거" : "지침")}
                          </span>
                          <h3>
                            {documentTitle}
                            {source.locator ? ` · ${source.locator}` : ""}
                          </h3>
                        </div>
                        <dl>
                          <div>
                            <dt>기준일·버전</dt>
                            <dd>
                              {textMetadata(
                                source,
                                ["version", "effective_date", "date"],
                                "연결 데이터 기준 2026.07.23",
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>원문</dt>
                            <dd>{source.excerpt}</dd>
                          </div>
                          <div>
                            <dt>현재 검토에 적용할 관점</dt>
                            <dd>
                              {textMetadata(
                                source,
                                ["caution", "applicability"],
                                "현재 시설 유형과 램프 구조가 적용대상인지 전문가 확인 필요",
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>출처</dt>
                            <dd>
                              첨부 PDF 원문 · {source.locator ?? "페이지 확인 필요"} ·{" "}
                              {source.document_id}
                            </dd>
                          </div>
                        </dl>
                        <details>
                          <summary>원문 보기</summary>
                          <p>{source.excerpt}</p>
                          <small>
                            {source.filename}
                            {source.locator ? ` · ${source.locator}` : ""}
                          </small>
                        </details>
                      </article>
                    );
                  })}
                </div>
                <p className="legal-boundary-note">
                  AI는 적용 후보와 확인 조건을 연결하며 적법·위법 또는 충족·위반을 확정하지 않습니다.
                </p>
              </section>
            )}

            {tab === "alternatives" && (
              <section aria-label="현재안과 검토 대안 비교">
                <div className="result-section-heading">
                  <div>
                    <span className="eyebrow">REVIEW ALTERNATIVES</span>
                    <h2>현재안과 대안 1·2·3 · 대안별 영향 요약</h2>
                  </div>
                  <button className="direct-edit-link" onClick={onEdit} type="button">
                    직접 수정
                  </button>
                </div>
                <p className="alternative-candidate-note">
                  현재 조건에서 검토할 수 있는 대안 후보입니다. 전문가가 적용조건을 확인합니다.
                </p>
                <div className="alternative-comparison-list">
                  {alternatives.map((item) => {
                    const impacts: Array<[ImpactKey, string, string]> = [
                      ["geometry", "BIM 형상", item.geometry_change],
                      ["movement", "동선 영향", item.movementImpact],
                      ["drainage", "배수 영향", item.drainageImpact],
                      ["time", "시간 영향", item.scheduleImpact],
                      ["cost", "비용 영향", item.costImpact],
                    ];
                    const parkingCheck = item.checks.find((check) =>
                      /주차면|주차 운영/.test(check),
                    );
                    if (parkingCheck) {
                      impacts.splice(2, 0, ["parking", "주차 영향", parkingCheck]);
                    }
                    return (
                      <button
                        aria-pressed={variant === item.id}
                        className={variant === item.id ? "active" : ""}
                        key={item.id}
                        onClick={() => selectVariant(item.id)}
                        type="button"
                      >
                        <div>
                          <span>{item.label}</span>
                          <h3>{item.title}</h3>
                          <p>{item.summary}</p>
                          {variant === item.id && (
                            <div className="alternative-linked-meta">
                              <small>
                                변경 객체 ·{" "}
                                {item.changedObjects.length
                                  ? item.changedObjects.join(" · ")
                                  : "없음"}
                              </small>
                              <small>추가 확인 · {item.requiredChecks.join(" · ")}</small>
                              <small>
                                연결 근거 · {item.relatedEvidenceIds.length}건
                              </small>
                            </div>
                          )}
                        </div>
                        <dl>
                          {impacts.map(([key, label, value]) => {
                            const presentation = impactPresentation(item, key);
                            return (
                              <div
                                className={`impact-row tone-${presentation.tone}`}
                                key={key}
                              >
                                <dt>
                                  <i>{presentation.icon}</i>
                                  {label}
                                </dt>
                                <dd>
                                  <span>{value}</span>
                                  <small>{presentation.source}</small>
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      </button>
                    );
                  })}
                </div>
                <p className="alternative-caveat">
                  실제 계산값은 연결된 산출 근거가 있을 때만 표시합니다. 현재 시간·비용 정보는
                  임의 숫자가 아닌 확인 상태로 제시됩니다.
                </p>
              </section>
            )}
          </div>
        </div>
      </div>

      <div className="review-sequence-bar review-action-bar">
        {tab === "context" ? (
          <button className="button subtle" onClick={onBack} type="button">
            ← 검토 의도 입력
          </button>
        ) : (
          <button
            className="button subtle"
            onClick={() => goToTab(resultSteps[activeIndex - 1].id)}
            type="button"
          >
            ← {resultSteps[activeIndex - 1].label}
          </button>
        )}

        {tab === "alternatives" ? (
          <button
            className="button primary"
            disabled={requesting}
            onClick={onRequest}
            type="button"
          >
            {requesting ? "요청 중…" : "이대로 전문가 검토 요청"} <span>→</span>
          </button>
        ) : (
          <button
            className="button primary"
            onClick={() => goToTab(resultSteps[activeIndex + 1].id)}
            type="button"
          >
            {resultSteps[activeIndex + 1].label} 확인 <span>→</span>
          </button>
        )}
      </div>
      {requestError && <div className="ai-error">{requestError}</div>}
      <p className="ux-principle ready-principle">
        복잡한 검토 준비는 AI가 완료하고, 사용자는 근거와 대안을 확인한 뒤 결정합니다.
      </p>
    </section>
  );
}

function variantsContain(value: string | null): value is BimVariant {
  return variants.some((variant) => variant.id === value);
}

const variants = [
  { id: "current" },
  { id: "alt1" },
  { id: "alt2" },
  { id: "alt3" },
] as const;
