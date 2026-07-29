import corpusData from "@/data/ve-context.json";

export type CaseRecord = {
  case_id: string;
  project_name?: string | null;
  document_type?: string | null;
  source_file?: string | null;
  source_locator?: string | null;
  title: string;
  original_text?: string | null;
  space_type?: string | null;
  review_segment?: string | null;
  primary_object?: string | null;
  related_objects?: string[] | null;
  discipline_standard?: string[] | null;
  primary_issue_category?: string | null;
  issue_categories?: string[] | null;
  issue_detail?: string | null;
  observed_conditions?: string[] | null;
  proposed_action?: string | null;
  action_types?: string[] | null;
  expected_effects?: string[] | null;
  idea_type?: string | null;
  final_decision?: string | null;
  decision_reason?: string | null;
  result_verified?: boolean | null;
  context_summary?: string | null;
  search_signatures?: string[] | null;
  overall_confidence?: string | null;
  human_review_status?: string | null;
  ramp_case?: string | null;
  context_text?: string | null;
  primary_object_standard?: string | null;
  primary_object_group?: string | null;
  primary_object_role?: string | null;
  primary_object_subtype?: string | null;
  object_standardization_confidence?: string | null;
  object_standardization_inferred?: boolean | null;
};

export type EvidenceRecord = Record<string, string | number | boolean | null>;

export type CaseBundle = {
  case: CaseRecord;
  relations: EvidenceRecord[];
  actions: EvidenceRecord[];
  legalMappings: EvidenceRecord[];
  guidelineMappings: EvidenceRecord[];
  similarCases: Array<CaseRecord & { similarity: number }>;
};

const corpus = corpusData as unknown as {
  meta: {
    version: string;
    sourceFile: string;
    generatedAt: string;
    counts: Record<string, number>;
  };
  cases: CaseRecord[];
  relations: EvidenceRecord[];
  actions: EvidenceRecord[];
  legalMappings: EvidenceRecord[];
  guidelineMappings: EvidenceRecord[];
  validation: EvidenceRecord[];
  evaluation: EvidenceRecord[];
};

function normalize(value: unknown) {
  if (Array.isArray(value)) return value.join(" ").toLowerCase();
  return String(value ?? "").toLowerCase();
}

function searchableText(record: CaseRecord) {
  return [
    record.case_id,
    record.title,
    record.primary_object,
    record.primary_object_group,
    record.primary_issue_category,
    record.issue_detail,
    record.proposed_action,
    record.context_summary,
    record.context_text,
    record.search_signatures,
    record.action_types,
    record.related_objects,
  ]
    .map(normalize)
    .join(" ");
}

function tokens(query: string) {
  return query
    .toLowerCase()
    .split(/[\s·,/|()[\]{}_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreCase(record: CaseRecord, query: string) {
  const queryTokens = tokens(query);
  if (!queryTokens.length) {
    if (record.case_id === "DET-2022-P098") return 100;
    return record.ramp_case === "Y" ? 50 : 10;
  }

  const title = normalize(record.title);
  const signatures = normalize(record.search_signatures);
  const structured = normalize([
    record.primary_object,
    record.primary_object_group,
    record.primary_issue_category,
    record.issue_detail,
    record.action_types,
  ]);
  const full = searchableText(record);

  return queryTokens.reduce((score, token) => {
    if (record.case_id.toLowerCase().includes(token)) score += 12;
    if (title.includes(token)) score += 8;
    if (signatures.includes(token)) score += 7;
    if (structured.includes(token)) score += 5;
    if (full.includes(token)) score += 2;
    return score;
  }, 0);
}

export function searchCases({
  query = "",
  issue,
  object,
  limit = 12,
}: {
  query?: string;
  issue?: string | null;
  object?: string | null;
  limit?: number;
}) {
  return corpus.cases
    .filter(
      (record) =>
        (!issue || record.primary_issue_category === issue) &&
        (!object ||
          record.primary_object_group === object ||
          record.primary_object === object),
    )
    .map((record) => ({ ...record, score: scoreCase(record, query) }))
    .filter((record) => !query || record.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.case_id.localeCompare(right.case_id),
    )
    .slice(0, Math.max(1, Math.min(limit, 50)));
}

export function getCaseBundle(caseId: string): CaseBundle | null {
  const record = corpus.cases.find((item) => item.case_id === caseId);
  if (!record) return null;

  const query = [
    record.primary_object_group,
    record.primary_issue_category,
    ...(record.action_types ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  const similarCases = searchCases({ query, limit: 8 })
    .filter((item) => item.case_id !== caseId)
    .slice(0, 4)
    .map(({ score, ...item }, index) => ({
      ...item,
      similarity: Math.max(64, 91 - index * 7 + Math.min(score, 4)),
    }));

  return {
    case: record,
    relations: corpus.relations.filter((item) => item.case_id === caseId),
    actions: corpus.actions.filter((item) => item.case_id === caseId),
    legalMappings: corpus.legalMappings.filter((item) => item.case_id === caseId),
    guidelineMappings: corpus.guidelineMappings.filter(
      (item) => item.case_id === caseId,
    ),
    similarCases,
  };
}

export const corpusMeta = corpus.meta;
export const validationResults = corpus.validation;
export const evaluationQueries = corpus.evaluation;
