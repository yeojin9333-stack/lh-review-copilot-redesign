import type {
  GroundedChat,
  ReviewPackage,
  ReviewTarget,
  SourceReference,
} from "@/lib/review-copilot";
import { createReviewAlternatives } from "@/lib/review-copilot";
import {
  findMatchingScenario,
  getRampScenario,
  getScenarioRule,
  getScenarioSourceCase,
  rankScenarioEvidence,
  rampScenarios,
  scenarioMeta,
  type RampScenario,
  type ScenarioEvidence,
} from "@/lib/scenarios";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function externalBackendUrl() {
  return process.env.REVIEW_COPILOT_API_URL?.trim().replace(/\/$/, "") || null;
}

export async function proxyReviewCopilot(
  request: Request,
  backendPath: string,
): Promise<Response> {
  const backendUrl = externalBackendUrl();
  if (!backendUrl) {
    return Response.json(
      { detail: "외부 LLM/RAG 백엔드 주소가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return Response.json(
      { detail: "파일은 한 번에 최대 25MB까지 업로드할 수 있습니다." },
      { status: 413 },
    );
  }

  try {
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);

    const upstream = await fetch(`${backendUrl}${backendPath}`, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      redirect: "manual",
    });
    const upstreamContentType =
      upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
    if (upstreamContentType.includes("application/json")) {
      const payload = (await upstream.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      if (payload && upstream.ok && backendPath === "/api/v1/health") {
        const configured = Boolean(payload.llm_configured);
        return Response.json(
          {
            ...payload,
            mode: "external-llm-rag",
            sourceMode: configured ? "llm" : "mock",
            fallback_active: false,
            diagnostics: {
              provider_called: false,
              retrieval: "SQLite hybrid vector + FTS",
              secret_values_logged: false,
            },
          },
          { status: upstream.status, headers: { "cache-control": "no-store" } },
        );
      }
      if (payload && upstream.ok && backendPath === "/api/v1/review/package") {
        const citedIds = Array.isArray(payload.cited_source_ids)
          ? payload.cited_source_ids.filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        return Response.json(
          {
            ...payload,
            sourceMode: "llm",
            alternatives:
              Array.isArray(payload.alternatives) &&
              payload.alternatives.length === 4
                ? payload.alternatives
                : createReviewAlternatives(citedIds),
          },
          { status: upstream.status, headers: { "cache-control": "no-store" } },
        );
      }
      return Response.json(payload, {
        status: upstream.status,
        headers: { "cache-control": "no-store" },
      });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "content-type": upstreamContentType,
      },
    });
  } catch (error) {
    return Response.json(
      {
        detail:
          error instanceof Error
            ? `LLM/RAG 백엔드에 연결할 수 없습니다: ${error.message}`
            : "LLM/RAG 백엔드에 연결할 수 없습니다.",
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}

function splitItems(value: string | undefined) {
  return (value ?? "")
    .split(/\s*[|,·]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceFromEvidence(
  record: ScenarioEvidence,
  index: number,
): SourceReference {
  const candidateId = record["후보 ID"];
  const sourceCase = getScenarioSourceCase(candidateId);
  const rule = getScenarioRule(candidateId);
  const excerpt =
    sourceCase?.["Context 요약"] ||
    sourceCase?.["제안행위"] ||
    rule?.["핵심 요구사항"] ||
    record["회수 기대 이유"];
  const filename =
    record["출처 파일·기관"] ||
    sourceCase?.["출처 파일"] ||
    rule?.["공식 출처"] ||
    scenarioMeta.sourceFile;

  return {
    source_id: record["Evidence ID"],
    document_id: candidateId,
    filename,
    source_kind: record["근거 유형"],
    locator:
      record["근거 위치"] ||
      sourceCase?.["원문 위치"] ||
      rule?.["핵심 조문·근거 위치"] ||
      null,
    excerpt,
    score: Math.max(0.55, 0.96 - index * 0.045),
    metadata: {
      scenario_id: record["시나리오 ID"],
      candidate_id: candidateId,
      candidate_name: record["후보명·사례명"],
      expected_grade: record["기대 등급"],
      expected_rank: record["기대 순위"],
      similarity: record["유사성·적용성"],
      validation: record["검증 상태"],
      caution: record["적용 조건·주의"],
      quotation_id: record["원문 인용 ID"] || null,
    },
  };
}

function contextSource(scenario: RampScenario): SourceReference {
  const context = scenario.context;
  return {
    source_id: `${scenario["시나리오 ID"]}-CTX`,
    document_id: scenario["시나리오 ID"],
    filename: scenarioMeta.sourceFile,
    source_kind: "PoC Context",
    locator: "Context 기대값",
    excerpt: context?.["Context 요약"] || scenario["합성 상황 설명"],
    score: 1,
    metadata: {
      scenario_id: scenario["시나리오 ID"],
      confidence: context?.신뢰등급,
      synthetic: true,
      no_inference: context?.["추정 금지"],
    },
  };
}

function selectScenario(input: {
  scenario_id?: string;
  question?: string;
  message?: string;
  target?: ReviewTarget;
}) {
  if (input.scenario_id) return getRampScenario(input.scenario_id);
  const propertyScenarioId = String(input.target?.properties?.scenario_id ?? "");
  if (propertyScenarioId) return getRampScenario(propertyScenarioId);
  return findMatchingScenario(
    [input.question, input.message, input.target?.name]
      .filter(Boolean)
      .join(" "),
  );
}

function retrieve(
  scenario: RampScenario,
  query: string,
  topK = 6,
): SourceReference[] {
  const evidence = rankScenarioEvidence(scenario, query, topK).map(
    ({ record }, index) => sourceFromEvidence(record, index),
  );
  return [contextSource(scenario), ...evidence];
}

function buildNativeReview(input: {
  scenario_id?: string;
  question?: string;
  top_k?: number;
  target?: ReviewTarget;
}): ReviewPackage {
  const target = input.target ?? { name: "지하주차장 램프 검토" };
  const scenario = selectScenario(input);
  const context = scenario.context;
  const query = [input.question, target.name, context?.이슈].filter(Boolean).join(" ");
  const sources = retrieve(scenario, query, input.top_k ?? 6);
  const evidenceSources = sources.slice(1);
  const caseSources = evidenceSources.filter((source) =>
    source.source_kind.includes("사례"),
  );
  const ruleSources = evidenceSources.filter(
    (source) =>
      source.source_kind.includes("법령") ||
      source.source_kind.includes("지침") ||
      source.source_kind.includes("BIM"),
  );
  const missingInformation = splitItems(
    scenario["미확인·추가 질문"] || context?.["필수 확인값"],
  );
  const citedSourceIds = sources.map((source) => source.source_id);
  const firstCase = caseSources[0] ?? evidenceSources[0];
  const firstRule = ruleSources[0];

  return {
    sourceMode: "rule",
    summary:
      `${scenario["시나리오 ID"]}의 표준 Context를 기준으로 ${evidenceSources.length}개 기대 근거를 회수했습니다. ` +
      `${context?.["검토의도·개선행위"] || scenario["검토 의도"]} 관점에서 검토하되, ` +
      `${missingInformation.length}개 입력은 확인 전까지 수치나 적합성으로 단정하지 않습니다.`,
    review_points: [
      {
        topic: "Context 정합성",
        finding:
          context?.["Context 요약"] || scenario["합성 상황 설명"],
        why_it_matters:
          context?.["공간적 영향"] ||
          "램프 주변 객체와 동선을 함께 봐야 연쇄 영향을 놓치지 않습니다.",
        evidence_ids: [sources[0].source_id],
        status: "supported",
      },
      {
        topic: "유사사례 검토",
        finding: firstCase
          ? `${firstCase.document_id} · ${firstCase.excerpt}`
          : "직접 연결된 유사사례가 없습니다.",
        why_it_matters:
          "유사사례는 대안 탐색 근거이며 현 프로젝트의 치수·효과를 그대로 적용하지 않습니다.",
        evidence_ids: firstCase ? [firstCase.source_id] : [],
        status: firstCase ? "supported" : "needs_confirmation",
      },
      {
        topic: "법령·지침 후보",
        finding: firstRule
          ? `${firstRule.document_id} · ${firstRule.excerpt}`
          : "현재 검색 결과에는 직접 연결된 법령·지침 후보가 없습니다.",
        why_it_matters:
          "최신 조문, 대상 시설, 도면 조건을 확인한 뒤 전문가가 적용 여부를 판정해야 합니다.",
        evidence_ids: firstRule ? [firstRule.source_id] : [],
        status: "needs_confirmation",
      },
      {
        topic: "미확인정보 통제",
        finding:
          missingInformation.slice(0, 4).join(" · ") ||
          context?.["추정 금지"] ||
          "추가 입력 확인이 필요합니다.",
        why_it_matters:
          context?.["추정 금지"] ||
          "입력되지 않은 형상·수치·법정 최소값을 자동 추정하지 않습니다.",
        evidence_ids: [sources[0].source_id],
        status: "needs_confirmation",
      },
    ],
    similar_cases: caseSources.slice(0, 4).map((source) => ({
      title: `${source.document_id} · ${source.metadata.candidate_name ?? source.filename}`,
      similarity_reason: source.excerpt,
      different_conditions: [
        String(
          source.metadata.caution ??
            "원문 조건·대안·효과를 현재 시나리오와 별도로 확인",
        ),
      ],
      evidence_ids: [source.source_id],
    })),
    missing_information: missingInformation,
    recommended_questions: missingInformation
      .slice(0, 6)
      .map((item) => `${item}을(를) 도면·BIM·계산서에서 확인할 수 있나요?`),
    limitations: [
      scenarioMeta.usageNotice,
      context?.["추정 금지"] ||
        "입력되지 않은 형상·치수·법적 적용성을 추정하지 않습니다.",
      "공개 배포 환경의 내장 모드는 시나리오 기대 근거를 구조·키워드로 회수하며 생성형 LLM을 사용하지 않습니다.",
    ],
    cited_source_ids: citedSourceIds,
    target: {
      ...target,
      properties: {
        ...target.properties,
        scenario_id: scenario["시나리오 ID"],
        scenario_confidence: context?.신뢰등급,
      },
    },
    sources,
    model: "scenario-rag-grounded-v1",
    alternatives: createReviewAlternatives(citedSourceIds),
  };
}

function buildNativeChat(input: {
  scenario_id?: string;
  message?: string;
  top_k?: number;
}): GroundedChat {
  const message = input.message?.trim() || "현재 시나리오의 핵심 근거는?";
  const scenario = selectScenario(input);
  const sources = retrieve(scenario, message, input.top_k ?? 5);
  const evidenceSources = sources.slice(1);
  const answer = [
    `${scenario["시나리오 ID"]} · ${scenario["사용자 입력"]}`,
    ...evidenceSources.slice(0, 4).map(
      (source, index) =>
        `${index + 1}. [${source.source_id}] ${source.document_id}: ${source.excerpt}`,
    ),
    "",
    `확인 필요: ${scenario["미확인·추가 질문"] || scenario.context?.["필수 확인값"] || "대상 조건"}`,
  ].join("\n");

  return {
    answer,
    cited_source_ids: sources.map((source) => source.source_id),
    insufficient_evidence: evidenceSources.length === 0,
    follow_up_questions: splitItems(
      scenario["미확인·추가 질문"] || scenario.context?.["필수 확인값"],
    )
      .slice(0, 4)
      .map((item) => `${item}은(는) 확인되었나요?`),
    sources,
    model: "scenario-rag-grounded-v1",
  };
}

export async function handleNativeReviewCopilot(
  request: Request,
  routeName: string,
): Promise<Response> {
  if (routeName === "health" && request.method === "GET") {
    return Response.json(
      {
        status: "ok",
        llm_configured: false,
        model: "scenario-rag-grounded-v1",
        embedding_model: "structured-keyword-retrieval",
        documents:
          scenarioMeta.counts.scenarios +
          scenarioMeta.counts.sourceCases +
          scenarioMeta.counts.rules +
          scenarioMeta.counts.evidence,
        mode: "scenario-rag",
        sourceMode: "rule",
        fallback_active: false,
        supports_upload: false,
        diagnostics: {
          provider_called: false,
          retrieval: "scenario structured-keyword retrieval",
          secret_values_logged: false,
        },
        notice:
          "공개 배포에서는 시나리오 내장 RAG가 동작합니다. 외부 Ollama 서버를 연결하면 팀원 버전의 LLM+벡터 RAG로 전환됩니다.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (routeName === "documents") {
    if (request.method === "GET") {
      return Response.json({
        documents: rampScenarios.map((scenario) => ({
          id: scenario["시나리오 ID"],
          filename: scenarioMeta.sourceFile,
          source_kind: "scenario",
          chunk_count: scenario.evidence.length + 1,
        })),
        mode: "scenario-rag",
      });
    }
    return Response.json(
      {
        detail:
          "공개 배포의 내장 RAG는 읽기 전용입니다. 자료 업로드는 REVIEW_COPILOT_API_URL로 외부 LLM/RAG 서버를 연결한 환경에서 사용할 수 있습니다.",
      },
      { status: 501 },
    );
  }

  if (request.method !== "POST") {
    return Response.json({ detail: "지원하지 않는 요청 방식입니다." }, { status: 405 });
  }

  const input = (await request.json().catch(() => ({}))) as {
    scenario_id?: string;
    question?: string;
    message?: string;
    top_k?: number;
    target?: ReviewTarget;
  };

  if (routeName === "review") return Response.json(buildNativeReview(input));
  if (routeName === "chat") return Response.json(buildNativeChat(input));
  if (routeName === "retrieve") {
    const scenario = selectScenario(input);
    return Response.json({
      query: input.message ?? input.question ?? "",
      scenario_id: scenario["시나리오 ID"],
      sources: retrieve(
        scenario,
        input.message ?? input.question ?? "",
        input.top_k ?? 6,
      ),
      mode: "scenario-rag",
    });
  }

  return Response.json({ detail: "지원하지 않는 AI 경로입니다." }, { status: 404 });
}
