import { ensureRuntimeSchema } from "@/db/runtime";

type WorkflowPayload = {
  kind?:
    | "request"
    | "review"
    | "designer_request"
    | "designer_pending"
    | "designer"
    | "designer_confirm"
    | "final_ready"
    | "designer_revise"
    | "reflection";
  caseId?: string;
  scenarioId?: string;
  intent?: string;
  reviewPackage?: unknown;
  decision?: string;
  reason?: string;
  response?: string;
  attachments?: string[];
  status?: string;
  note?: string;
  verificationChecks?: Record<string, boolean>;
};

const DEFAULT_CASE_ID = "REV-24-018";

export async function GET(request: Request) {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId") ?? DEFAULT_CASE_ID;
    const db = await ensureRuntimeSchema();
    const [workflow, review, designer, reflection, timeline] = await db.batch([
      db.prepare("SELECT * FROM workflow_cases WHERE case_id = ?").bind(caseId),
      db.prepare("SELECT * FROM expert_reviews WHERE case_id = ?").bind(caseId),
      db.prepare("SELECT * FROM designer_responses WHERE case_id = ?").bind(caseId),
      db.prepare("SELECT * FROM reflection_checks WHERE case_id = ?").bind(caseId),
      db
        .prepare(
          "SELECT * FROM timeline_events WHERE case_id = ? ORDER BY created_at DESC, id DESC LIMIT 20",
        )
        .bind(caseId),
    ]);

    const workflowRow = workflow.results[0] as
      | { status?: string; designer_confirmed?: number }
      | undefined;
    return Response.json({
      caseId,
      status: workflowRow?.status ?? null,
      designerConfirmed: Boolean(workflowRow?.designer_confirmed),
      review: review.results[0] ?? null,
      designer: designer.results[0] ?? null,
      reflection: reflection.results[0] ?? null,
      timeline: timeline.results,
      persistence: "D1",
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "workflow unavailable",
        persistence: "unavailable",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as WorkflowPayload;
    const caseId = payload.caseId?.trim() || DEFAULT_CASE_ID;
    const db = await ensureRuntimeSchema();
    let nextStatus = "";

    if (payload.kind === "request") {
      const intent = payload.intent?.trim();
      if (!intent || !payload.reviewPackage) {
        return Response.json(
          { error: "intent and reviewPackage are required" },
          { status: 400 },
        );
      }
      nextStatus = "EXPERT_REVIEW_REQUESTED";
      const reviewPackage = JSON.stringify(payload.reviewPackage);
      await db.batch([
        db
          .prepare(`INSERT INTO workflow_cases
            (case_id, status, review_package, designer_confirmed, updated_at)
            VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
            ON CONFLICT(case_id) DO UPDATE SET
              status = excluded.status,
              review_package = excluded.review_package,
              designer_confirmed = 0,
              updated_at = CURRENT_TIMESTAMP`)
          .bind(caseId, nextStatus, reviewPackage),
        db
          .prepare(
            "INSERT INTO timeline_events (case_id, actor, title, detail) VALUES (?, ?, ?, ?)",
          )
          .bind(
            caseId,
            "LH 담당자",
            "전문가 검토 요청",
            JSON.stringify({
              intent,
              scenarioId: payload.scenarioId?.trim() ?? "",
              reviewPackage: payload.reviewPackage,
              status: nextStatus,
            }),
          ),
      ]);
    } else if (payload.kind === "review") {
      const decision = payload.decision?.trim();
      const reason = payload.reason?.trim();
      if (!decision || !reason) {
        return Response.json({ error: "decision and reason are required" }, { status: 400 });
      }
      const assignment = await db
        .prepare("SELECT status FROM workflow_cases WHERE case_id = ?")
        .bind(caseId)
        .first<{ status: string }>();
      if (!assignment) {
        return Response.json(
          { error: "EXPERT_REVIEW_ASSIGNMENT_NOT_FOUND" },
          { status: 409 },
        );
      }
      nextStatus = "EXPERT_DECISION_SAVED";
      await db.batch([
        db
          .prepare(`INSERT INTO expert_reviews (case_id, decision, reason, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(case_id) DO UPDATE SET
              decision = excluded.decision,
              reason = excluded.reason,
              updated_at = CURRENT_TIMESTAMP`)
          .bind(caseId, decision, reason),
        db
          .prepare(
            "INSERT INTO timeline_events (case_id, actor, title, detail) VALUES (?, ?, ?, ?)",
          )
          .bind(caseId, "교통전문가", `${decision} 판정`, reason),
        db
          .prepare(
            "UPDATE workflow_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?",
          )
          .bind(nextStatus, caseId),
      ]);
    } else if (payload.kind === "designer_request") {
      const review = await db
        .prepare("SELECT case_id FROM expert_reviews WHERE case_id = ?")
        .bind(caseId)
        .first<{ case_id: string }>();
      if (!review) {
        return Response.json(
          { error: "EXPERT_DECISION_REQUIRED" },
          { status: 409 },
        );
      }
      nextStatus = "DESIGNER_RESPONSE_REQUESTED";
      await db.batch([
        db
          .prepare(
            "UPDATE workflow_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?",
          )
          .bind(nextStatus, caseId),
        db
          .prepare(
            "INSERT INTO timeline_events (case_id, actor, title, detail) VALUES (?, ?, ?, ?)",
          )
          .bind(
            caseId,
            "LH 담당자",
            "설계사 보완 요청",
            "회전반경 검토자료 · 집수정 연결 상세 · 수정 BIM 도면",
          ),
      ]);
    } else if (payload.kind === "designer_pending") {
      const workflow = await db
        .prepare("SELECT status FROM workflow_cases WHERE case_id = ?")
        .bind(caseId)
        .first<{ status: string }>();
      if (workflow?.status !== "DESIGNER_RESPONSE_REQUESTED") {
        return Response.json(
          { error: "DESIGNER_RESPONSE_NOT_REQUESTED" },
          { status: 409 },
        );
      }
      nextStatus = "DESIGNER_RESPONSE_PENDING";
      await db.batch([
        db
          .prepare(
            "UPDATE workflow_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?",
          )
          .bind(nextStatus, caseId),
        db
          .prepare(
            "INSERT INTO timeline_events (case_id, actor, title, detail) VALUES (?, ?, ?, ?)",
          )
          .bind(
            caseId,
            "설계사",
            "설계사 답변 대기",
            "동일 Case가 설계사 답변 View에 배정됨",
          ),
      ]);
    } else if (payload.kind === "designer") {
      const response = payload.response?.trim();
      if (!response) {
        return Response.json({ error: "response is required" }, { status: 400 });
      }
      const workflow = await db
        .prepare("SELECT status FROM workflow_cases WHERE case_id = ?")
        .bind(caseId)
        .first<{ status: string }>();
      if (
        !workflow ||
        !["DESIGNER_RESPONSE_REQUESTED", "DESIGNER_RESPONSE_PENDING"].includes(
          workflow.status,
        )
      ) {
        return Response.json(
          { error: "DESIGNER_RESPONSE_NOT_REQUESTED" },
          { status: 409 },
        );
      }
      const reason = payload.reason?.trim() ?? "";
      const attachments = JSON.stringify(payload.attachments ?? []);
      nextStatus = "DESIGNER_RESPONSE_SUBMITTED";
      await db.batch([
        db
          .prepare(`INSERT INTO designer_responses
            (case_id, response, reason, attachments, submitted_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(case_id) DO UPDATE SET
              response = excluded.response,
              reason = excluded.reason,
              attachments = excluded.attachments,
              status = '재제출',
              submitted_at = CURRENT_TIMESTAMP`)
          .bind(caseId, response, reason, attachments),
        db
          .prepare(
            "INSERT INTO timeline_events (case_id, actor, title, detail) VALUES (?, ?, ?, ?)",
          )
          .bind(caseId, "한빛건축 설계팀", "수정안 재제출", response),
        db
          .prepare(
            "UPDATE workflow_cases SET status = ?, designer_confirmed = 0, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?",
          )
          .bind(nextStatus, caseId),
      ]);
    } else if (payload.kind === "designer_confirm") {
      const designer = await db
        .prepare("SELECT case_id FROM designer_responses WHERE case_id = ?")
        .bind(caseId)
        .first<{ case_id: string }>();
      if (!designer) {
        return Response.json(
          { error: "DESIGNER_RESPONSE_REQUIRED" },
          { status: 409 },
        );
      }
      nextStatus = "DESIGNER_RESPONSE_CONFIRMED";
      await db.batch([
        db
          .prepare(
            "UPDATE workflow_cases SET status = ?, designer_confirmed = 1, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?",
          )
          .bind(nextStatus, caseId),
        db
          .prepare(
            "INSERT INTO timeline_events (case_id, actor, title, detail) VALUES (?, ?, ?, ?)",
          )
          .bind(caseId, "LH 담당자", "설계사 답변 확인 완료", "V2 답변 확인 상태 저장"),
      ]);
    } else if (payload.kind === "final_ready") {
      const workflow = await db
        .prepare(
          "SELECT status, designer_confirmed FROM workflow_cases WHERE case_id = ?",
        )
        .bind(caseId)
        .first<{ status: string; designer_confirmed: number }>();
      if (
        workflow?.status !== "DESIGNER_RESPONSE_CONFIRMED" ||
        !workflow.designer_confirmed
      ) {
        return Response.json(
          { error: "DESIGNER_RESPONSE_CONFIRMATION_REQUIRED" },
          { status: 409 },
        );
      }
      nextStatus = "FINAL_REFLECTION_READY";
      await db.batch([
        db
          .prepare(
            "UPDATE workflow_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?",
          )
          .bind(nextStatus, caseId),
        db
          .prepare(
            "INSERT INTO timeline_events (case_id, actor, title, detail) VALUES (?, ?, ?, ?)",
          )
          .bind(
            caseId,
            "LH 담당자",
            "V3 최종 반영 준비",
            "설계사 답변 확인 완료 후 V3 최종 반영 잠금 해제",
          ),
      ]);
    } else if (payload.kind === "designer_revise") {
      nextStatus = "DESIGNER_RESPONSE_REQUESTED";
      await db.batch([
        db
          .prepare(
            "UPDATE workflow_cases SET status = ?, designer_confirmed = 0, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?",
          )
          .bind(nextStatus, caseId),
        db
          .prepare(
            "INSERT INTO timeline_events (case_id, actor, title, detail) VALUES (?, ?, ?, ?)",
          )
          .bind(caseId, "LH 담당자", "설계사 재보완 요청", "미확인 항목 보완 후 재제출 요청"),
      ]);
    } else if (payload.kind === "reflection") {
      const status = payload.status?.trim();
      const note = payload.note?.trim() ?? "";
      if (!status) {
        return Response.json({ error: "status is required" }, { status: 400 });
      }
      const [workflow, review, designer] = await db.batch([
        db.prepare("SELECT * FROM workflow_cases WHERE case_id = ?").bind(caseId),
        db.prepare("SELECT case_id FROM expert_reviews WHERE case_id = ?").bind(caseId),
        db.prepare("SELECT case_id FROM designer_responses WHERE case_id = ?").bind(caseId),
      ]);
      const workflowRow = workflow.results[0] as
        | { status?: string; designer_confirmed?: number }
        | undefined;
      const missing: string[] = [];
      if (!review.results[0]) missing.push("V1 전문가 판단 및 사유");
      if (!designer.results[0]) missing.push("V2 설계사 답변 제출");
      if (!workflowRow?.designer_confirmed) missing.push("LH 답변 확인");
      if (status === "확인대기") missing.push("최종 반영 상태 선택");
      if (!note) missing.push("LH 확인 의견");
      if (
        !payload.verificationChecks ||
        !Object.values(payload.verificationChecks).every(Boolean)
      ) {
        missing.push("필수 확인항목 완료");
      }
      if (workflowRow?.status !== "FINAL_REFLECTION_READY") {
        missing.push("FINAL_REFLECTION_READY 상태");
      }
      if (missing.length) {
        return Response.json(
          {
            error: "FINAL_REFLECTION_PREREQUISITES_NOT_MET",
            missing: [...new Set(missing)],
          },
          { status: 409 },
        );
      }
      nextStatus = "FINAL_REFLECTION_SAVED";
      await db.batch([
        db
          .prepare(`INSERT INTO reflection_checks (case_id, status, note, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(case_id) DO UPDATE SET
              status = excluded.status,
              note = excluded.note,
              updated_at = CURRENT_TIMESTAMP`)
          .bind(caseId, status, note),
        db
          .prepare(
            "INSERT INTO timeline_events (case_id, actor, title, detail) VALUES (?, ?, ?, ?)",
          )
          .bind(caseId, "LH 담당자", `최종 반영 상태 · ${status}`, note),
        db
          .prepare(
            "UPDATE workflow_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?",
          )
          .bind(nextStatus, caseId),
      ]);
    } else {
      return Response.json({ error: "unsupported workflow kind" }, { status: 400 });
    }

    return Response.json(
      { ok: true, caseId, status: nextStatus, persistence: "D1" },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "workflow unavailable" },
      { status: 503 },
    );
  }
}
