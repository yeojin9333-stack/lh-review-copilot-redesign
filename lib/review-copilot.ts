export type ReviewTarget = {
  name: string;
  category?: string;
  location?: string;
  properties?: Record<string, unknown>;
  related_elements?: Array<{
    name: string;
    category?: string;
    properties?: Record<string, unknown>;
  }>;
};

export type SourceReference = {
  source_id: string;
  document_id: string;
  filename: string;
  source_kind: string;
  locator?: string | null;
  excerpt: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type ReviewSourceMode = "llm" | "rule" | "mock";

export type ReviewAlternative = {
  id: "current" | "alt1" | "alt2" | "alt3";
  alternativeId: "current" | "alt1" | "alt2" | "alt3";
  label: string;
  title: string;
  summary: string;
  geometryState: "current" | "sight-improvement" | "drainage-improvement" | "equipment-upgrade";
  cameraPreset: "overview" | "curve" | "lower-drainage" | "equipment";
  changedObjects: string[];
  movementImpact: string;
  drainageImpact: string;
  scheduleImpact: string;
  costImpact: string;
  relatedEvidenceIds: string[];
  requiredChecks: string[];
  description: string;
  geometry_change: string;
  checks: string[];
  impact: {
    movement: string;
    time: string;
    cost: string;
  };
  evidence_ids: string[];
};

export type ReviewPackage = {
  sourceMode: ReviewSourceMode;
  summary: string;
  review_points: Array<{
    topic: string;
    finding: string;
    why_it_matters: string;
    evidence_ids: string[];
    status: "supported" | "needs_confirmation";
  }>;
  similar_cases: Array<{
    title: string;
    similarity_reason: string;
    different_conditions: string[];
    evidence_ids: string[];
  }>;
  missing_information: string[];
  recommended_questions: string[];
  limitations: string[];
  cited_source_ids: string[];
  target: ReviewTarget;
  sources: SourceReference[];
  model: string;
  alternatives: ReviewAlternative[];
};

export type GroundedChat = {
  answer: string;
  cited_source_ids: string[];
  insufficient_evidence: boolean;
  follow_up_questions: string[];
  sources: SourceReference[];
  model: string;
};

export type AiHealth = {
  status: "ok";
  llm_configured: boolean;
  model: string;
  embedding_model: string;
  documents: number;
  mode?: "external-llm-rag" | "scenario-rag";
  sourceMode?: ReviewSourceMode;
  fallback_active?: boolean;
  supports_upload?: boolean;
  notice?: string;
  diagnostics?: {
    provider_called: boolean;
    retrieval: string;
    secret_values_logged: false;
  };
};

export type IngestResult = {
  document: {
    id: string;
    filename: string;
    content_type: string;
    source_kind: string;
    project_id?: string | null;
    chunk_count: number;
    created_at: string;
    metadata: Record<string, unknown>;
  };
  indexed: boolean;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: string; error?: string }
      | null;
    throw new Error(
      body?.detail ?? body?.error ?? `AI 서비스 오류 (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}

export async function getAiHealth(signal?: AbortSignal): Promise<AiHealth> {
  return parseResponse<AiHealth>(
    await fetch("/api/ai/health", { cache: "no-store", signal }),
  );
}

export async function uploadKnowledge(
  files: File[],
  options: { projectId: string; sourceKind?: string },
): Promise<IngestResult[]> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  form.append("source_kind", options.sourceKind ?? "reference");
  form.append("project_id", options.projectId);
  return parseResponse<IngestResult[]>(
    await fetch("/api/ai/documents", { method: "POST", body: form }),
  );
}

export async function createLiveReviewPackage(input: {
  target: ReviewTarget;
  question?: string;
  project_id?: string;
  scenario_id?: string;
  document_ids?: string[];
  top_k?: number;
}): Promise<ReviewPackage> {
  const packageData = await parseResponse<
    Omit<ReviewPackage, "sourceMode" | "alternatives"> &
      Partial<Pick<ReviewPackage, "sourceMode" | "alternatives">>
  >(
    await fetch("/api/ai/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  const sourceMode =
    packageData.sourceMode ??
    (packageData.model.includes("scenario-rag") ? "rule" : "llm");
  return {
    ...packageData,
    sourceMode,
    alternatives:
      packageData.alternatives?.length === 4
        ? packageData.alternatives
        : createReviewAlternatives(packageData.cited_source_ids),
  };
}

export function createReviewAlternatives(
  evidenceIds: string[] = [],
): ReviewAlternative[] {
  const contextEvidence = evidenceIds.slice(0, 2);
  const caseEvidence = evidenceIds.slice(1, 4);
  return [
    {
      id: "current",
      alternativeId: "current",
      label: "현재안",
      title: "기존 곡선형 램프 유지",
      summary: "높은 내측 벽체·기존 트렌치·현재 차량 동선을 유지합니다.",
      geometryState: "current",
      cameraPreset: "overview",
      changedObjects: [],
      movementImpact: "현재 곡선 동선 유지",
      drainageImpact: "기존 트렌치·집수정 조건 유지",
      scheduleImpact: "추가 설계기간 없음",
      costImpact: "기준안",
      relatedEvidenceIds: contextEvidence,
      requiredChecks: ["회전반경 자료", "시거 및 배수계산서"],
      description: "현재 BIM 형상과 설비 위치를 기준안으로 유지합니다.",
      geometry_change: "변경 없음",
      checks: ["회전반경 자료", "시거 및 배수계산서"],
      impact: {
        movement: "현재 곡선 동선 유지",
        time: "추가 설계기간 없음",
        cost: "기준안",
      },
      evidence_ids: contextEvidence,
    },
    {
      id: "alt1",
      alternativeId: "alt1",
      label: "대안 1",
      title: "시야 개선 · 내측 벽체 후퇴",
      summary: "내측 벽체를 후퇴·축소하고 P-01 운영 제외와 차량 궤적 조정을 검토합니다.",
      geometryState: "sight-improvement",
      cameraPreset: "curve",
      changedObjects: ["내측 벽체", "P-01 주차면", "차량 궤적"],
      movementImpact: "내측 회전 공간과 시야 확보 가능",
      drainageImpact: "기존 배수 형상 유지",
      scheduleImpact: "구조·도면 재검토 필요",
      costImpact: "벽체 변경 산출자료 필요",
      relatedEvidenceIds: caseEvidence,
      requiredChecks: ["차량 궤적·시거 검토", "인접 주차면 P-01 운영범위", "벽체 구조 검토"],
      description: "곡선부의 시야와 회전 여유를 확인하기 위한 형상 후보입니다.",
      geometry_change: "내측 벽체 후퇴·일부 높이 축소",
      checks: ["차량 궤적·시거 검토", "인접 주차면 운영범위"],
      impact: {
        movement: "내측 회전 경로 단축 가능",
        time: "구조·도면 재검토로 증가 가능",
        cost: "벽체 변경 비용 증가 가능",
      },
      evidence_ids: caseEvidence,
    },
    {
      id: "alt2",
      alternativeId: "alt2",
      label: "대안 2",
      title: "배수 개선 · 트렌치 저점부 이동",
      summary: "기존 트렌치를 Ghost 처리하고 저점부 트렌치·집수정·연결 배관을 표시합니다.",
      geometryState: "drainage-improvement",
      cameraPreset: "lower-drainage",
      changedObjects: ["트렌치", "집수정", "연결 배관", "우수 흐름"],
      movementImpact: "차량 형상과 주행 경로는 유지",
      drainageImpact: "저점부 집수 경로 검토 가능",
      scheduleImpact: "설비 상세 조정기간 필요",
      costImpact: "배수 설비 산출자료 필요",
      relatedEvidenceIds: caseEvidence,
      requiredChecks: ["배수 경로·구배", "집수정 연결 상세", "방수층 접합부"],
      description: "램프 하부 우수 유입과 결빙 조건을 확인하기 위한 배수 후보입니다.",
      geometry_change: "트렌치 저점부 이동·집수정 연결",
      checks: ["배수 경로·구배", "집수정 연결 상세"],
      impact: {
        movement: "차량 동선 변화는 제한적",
        time: "설비 상세 조정기간 증가 가능",
        cost: "배수 설비 변경 비용 증가 가능",
      },
      evidence_ids: caseEvidence,
    },
    {
      id: "alt3",
      alternativeId: "alt3",
      label: "대안 3",
      title: "설비 보완 · 인지·검지시설 추가",
      summary: "램프 형상은 유지하고 반사경·검지코일·진입 경고등·정지선을 추가합니다.",
      geometryState: "equipment-upgrade",
      cameraPreset: "equipment",
      changedObjects: ["곡선부 반사경", "차량 검지코일", "진입 경고등", "정지선"],
      movementImpact: "현재 차량 동선 유지",
      drainageImpact: "기존 배수 형상 유지",
      scheduleImpact: "설비 상세·전원 검토 필요",
      costImpact: "설비 수량 산출자료 필요",
      relatedEvidenceIds: contextEvidence,
      requiredChecks: ["설비 시인성·전원", "유지관리 접근성", "설치 상세"],
      description: "형상 변경 없이 곡선부 인지와 진입 운영설비를 보완하는 후보입니다.",
      geometry_change: "반사경·검지코일·경고등·정지선 추가",
      checks: ["설비 시인성·전원", "유지관리 접근성"],
      impact: {
        movement: "현재 동선 유지",
        time: "설비 상세·전원 검토 필요",
        cost: "설비 수량 산출자료 필요",
      },
      evidence_ids: contextEvidence,
    },
  ];
}

export async function askGroundedQuestion(input: {
  message: string;
  project_id?: string;
  scenario_id?: string;
  document_ids?: string[];
  top_k?: number;
}): Promise<GroundedChat> {
  return parseResponse<GroundedChat>(
    await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}
