import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function fetchApi(pathname, init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "application/json" },
      ...init,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the PoC role selection instead of a login", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /프로젝트 대시보드 \| LH Review Copilot/);
  assert.match(html, /역할을 선택해 주세요/);
  assert.match(html, /LH 담당자/);
  assert.match(html, /외부 전문가/);
  assert.match(html, /설계사/);
  assert.match(html, /실제 로그인 기능은 포함하지 않습니다/);
  assert.doesNotMatch(html, /아이디|비밀번호|회원가입/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("starts review with one intent and keeps AI preparation automatic", async () => {
  const prototype = await readFile(new URL("../app/prototype.tsx", import.meta.url), "utf8");
  assert.match(prototype, /무엇을 검토할까요\?/);
  assert.match(prototype, /BIM에서 자동 확인된 대상 공간/);
  assert.match(prototype, /AI 검토 시작/);
  assert.match(prototype, /차량 동선/);
  assert.match(prototype, /배수·결빙/);
});

test("ships the automatic ready package and AI-drafted expert decision flow", async () => {
  const [prototype, reviewResults, bimViewer, projectBim, workflow] = await Promise.all([
    readFile(new URL("../app/prototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/review-results.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/bim-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/project-bim-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workflow/route.ts", import.meta.url), "utf8"),
  ]);
  const reviewUi = `${prototype}\n${reviewResults}`;

  for (const step of [
    "BIM 공간조건 확인",
    "관련 사례 검색",
    "법령·지침 연결",
    "검토 대안 구성",
    "검토 준비 완료",
  ]) {
    assert.match(prototype, new RegExp(step));
  }
  for (const resultSection of [
    "검토 준비가 완료됐습니다.",
    "AI가 확인한 Context",
    "관련 사례",
    "관련 법령·지침",
    "현재안과 대안 1·2·3",
    "이대로 전문가 검토 요청",
    "판단 사유 필수",
  ]) {
    assert.match(reviewUi, new RegExp(resultSection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(bimViewer, /OrbitControls/);
  assert.match(bimViewer, /WebGLRenderer/);
  assert.match(bimViewer, /전체 보기/);
  assert.match(bimViewer, /선택 구간 보기/);
  assert.match(bimViewer, /const rampPath: RampPathPoint/);
  assert.match(bimViewer, /solidRibbonGeometry/);
  assert.match(projectBim, /react-zoom-pan-pinch/);
  assert.match(projectBim, /project-overview-cutaway\.webp/);
  assert.match(projectBim, /zoomToElement/);
  assert.match(projectBim, /resetTransform/);
  assert.match(projectBim, /maxScale=\{4\}/);
  assert.match(projectBim, /project-ramp-hotspot/);
  assert.match(workflow, /payload\.kind === "request"/);
  assert.match(workflow, /reviewPackage/);
  assert.match(workflow, /전문가 검토 요청/);
});

test("keeps every role route, custom font, and removes starter-only files", async () => {
  const [review, decision, designer, packageJson, globalCss] = await Promise.all([
    readFile(new URL("../app/review/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/decision/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/designer/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(review, /mode="review"/);
  assert.match(decision, /mode="decision"/);
  assert.match(designer, /mode="designer"/);
  assert.match(globalCss, /font-family: "NanumSquare"/);
  assert.match(globalCss, /nanum-square-800\.otf/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|site-creator-vinext-starter/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await assert.rejects(access(new URL("../package-lock.json", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../public/fonts/nanum-square-300.otf", import.meta.url));
  await access(new URL("../public/fonts/nanum-square-400.otf", import.meta.url));
  await access(new URL("../public/fonts/nanum-square-700.otf", import.meta.url));
  await access(new URL("../public/fonts/nanum-square-800.otf", import.meta.url));
  await access(new URL("../public/fonts/LICENSE-NANUMSQUARE.txt", import.meta.url));
  await access(new URL("../public/assets/project-overview-cutaway.webp", import.meta.url));
  const pdf = await readFile(
    new URL("../public/assets/A-17BL_B1-R02_AI-review-full-evidence.pdf", import.meta.url),
  );
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  await access(
    new URL(".openai/TEAM_DEPLOYMENT_NOTICE.txt", templateRoot),
  );
});

test("searches the standardized VE corpus and returns traceable evidence", async () => {
  const searchResponse = await fetchApi(
    "/api/cases?q=%EB%9E%A8%ED%94%84%20%ED%8E%B8%EC%A4%91%20%EC%99%B8%EA%B3%BD%20%EC%9E%AC%EB%B0%B0%EC%B9%98&limit=5",
  );
  assert.equal(searchResponse.status, 200);
  const search = await searchResponse.json();
  assert.equal(search.meta.counts.cases, 354);
  assert.ok(search.cases.some((item) => item.case_id === "DET-2022-P098"));

  const detailResponse = await fetchApi("/api/cases/DET-2022-P098");
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.equal(detail.case.primary_issue_category, "동선");
  assert.deepEqual(detail.case.action_types, ["설치", "재배치"]);
  assert.ok(detail.relations.length > 0);
  assert.ok(detail.legalMappings.length > 0);
  assert.ok(detail.guidelineMappings.length > 0);
});

test("ships D1 schema, seed migration, and server workflow route", async () => {
  const [viteConfig, schema, seed, workflow] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_seed-cases.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workflow/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(viteConfig, /d1: "DB"/);
  assert.match(schema, /expertReviews|designerResponses|reflectionChecks|workflowCases/);
  assert.match(seed, /DET-2022-P098/);
  assert.match(workflow, /INSERT INTO timeline_events/);
  assert.match(
    workflow,
    /"request"[\s\S]*"review"[\s\S]*"designer_request"[\s\S]*"designer_pending"/,
  );
  assert.match(workflow, /"designer_confirm"[\s\S]*"final_ready"/);
  assert.match(workflow, /EXPERT_REVIEW_REQUESTED/);
  assert.match(workflow, /FINAL_REFLECTION_PREREQUISITES_NOT_MET/);
  assert.match(workflow, /persistence: "D1"/);
});

test("serves scenario-grounded RAG and keeps the external Ollama adapter", async () => {
  const healthResponse = await fetchApi("/api/ai/health");
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.mode, "scenario-rag");
  assert.equal(health.sourceMode, "rule");
  assert.equal(health.llm_configured, false);
  assert.ok(health.documents >= 300);

  const reviewResponse = await fetchApi("/api/ai/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenario_id: "RMP-S28",
      question: "램프 편중 동선을 검토해 줘",
      target: { name: "램프 추가 설치 시 편중된 주차장 순환동선 개선" },
    }),
  });
  assert.equal(reviewResponse.status, 200);
  const review = await reviewResponse.json();
  assert.equal(review.target.properties.scenario_id, "RMP-S28");
  assert.match(review.model, /scenario-rag/);
  assert.equal(review.sourceMode, "rule");
  assert.equal(review.alternatives.length, 4);
  assert.ok(review.sources.some((source) => source.document_id === "DET-2022-P098"));
  assert.ok(review.cited_source_ids.includes("RMP-S28-CTX"));

  await access(
    new URL("../services/review-copilot-ai-ollama/app/main.py", import.meta.url),
  );
});

test("keeps the cutaway dashboard, fixed action bar, and knowledge-save flow stable", async () => {
  const [css, projectBim, prototype, reviewResults] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/project-bim-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/review-results.tsx", import.meta.url), "utf8"),
  ]);
  const heroRule = css.match(/\.bim-dashboard-hero\s*\{[^}]+\}/)?.[0] ?? "";

  assert.match(heroRule, /height:\s*clamp\(620px,\s*40vw,\s*750px\)/);
  assert.match(heroRule, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(heroRule, /vh/);
  assert.match(css, /\.cutaway-transform-scene\s*\{[^}]*aspect-ratio:\s*1672\s*\/\s*941/s);
  assert.match(css, /\.review-sequence-bar\.review-action-bar\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.prepared-review-screen\s*\{[^}]*padding-bottom:/s);
  assert.match(projectBim, /TransformWrapper/);
  assert.match(projectBim, /wheel=\{\{ step: 0\.12 \}\}/);
  assert.match(projectBim, /pinch=\{\{ step: 5 \}\}/);
  assert.match(prototype, /lh-review-ready-package/);
  assert.match(prototype, /KnowledgeSaveAnimation/);
  assert.match(prototype, /Closed Decision Loop가 완성되었습니다/);
  assert.match(reviewResults, /전체 근거 PDF/);
  assert.match(reviewResults, /review-action-bar/);
});

test("moves expected impacts to AI review and shows reuse KPI exactly in related cases", async () => {
  const [prototype, reviewResults, css] = await Promise.all([
    readFile(new URL("../app/prototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/review-results.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(reviewResults, /대안별 영향 요약/);
  assert.match(reviewResults, /검증지식 재사용률 60%/);
  assert.match(reviewResults, /LH 완료 검토 이력/);
  assert.match(reviewResults, /검토 패키지에 활용됨/);
  assert.equal((reviewResults.match(/검증지식 재사용률 60%/g) ?? []).length, 1);
  assert.doesNotMatch(prototype, /기대효과 요약|한눈에 보는 기대효과|유사 검토 이력 재사용/);
  assert.match(prototype, /진행 요약/);
  assert.match(prototype, /createReviewAlternatives/);
  assert.doesNotMatch(prototype, /근거 신뢰도 82%|안전성.*86\s*\/\s*100|\+1\.8%/);
  assert.match(css, /\.case-reuse-summary/);
  assert.match(css, /\.workflow-step-list/);
});

test("connects role assignment and V1 V2 V3 with one reviewCaseId", async () => {
  const [prototype, workflow] = await Promise.all([
    readFile(new URL("../app/prototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workflow/route.ts", import.meta.url), "utf8"),
  ]);

  for (const status of [
    "EXPERT_REVIEW_REQUESTED",
    "EXPERT_DECISION_SAVED",
    "DESIGNER_RESPONSE_REQUESTED",
    "DESIGNER_RESPONSE_SUBMITTED",
    "FINAL_REFLECTION_READY",
    "FINAL_REFLECTION_SAVED",
  ]) {
    assert.match(`${prototype}\n${workflow}`, new RegExp(status));
  }
  assert.match(prototype, /배정 검토 안건/);
  assert.match(prototype, /프로젝트 콘솔과 단지 전체 BIM에는 접근하지 않습니다/);
  assert.match(prototype, /V1 전문가 판단 저장/);
  assert.match(prototype, /설계사 보완 요청/);
  assert.match(prototype, /V3 최종 상태 저장/);
  assert.match(prototype, /const WORKFLOW_CASE_ID = "REV-24-018"/);
});
