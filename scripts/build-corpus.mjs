import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultInputPath = path.join(projectRoot, "shared-data", "standardized-data.xlsx");
const inputPath = path.resolve(process.argv[2] ?? defaultInputPath);
const outputPath = path.resolve(
  process.env.CORPUS_OUTPUT_PATH ?? path.join(projectRoot, "data", "ve-context.json"),
);
const seedPath = path.resolve(
  process.env.CORPUS_SEED_PATH ??
    path.join(projectRoot, "drizzle", "0001_seed-cases.sql"),
);

function parseCell(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function cellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  if ("result" in value) return cellValue(value.result);
  if ("text" in value) return value.text;
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? "").join("");
  }
  return String(value);
}

function extractRecords(workbook, sheetName, headerKey) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`${sheetName}: sheet not found`);

  const values = [];
  for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = [];
    for (let columnIndex = 1; columnIndex <= sheet.columnCount; columnIndex += 1) {
      row.push(cellValue(sheet.getCell(rowIndex, columnIndex).value));
    }
    values.push(row);
  }

  const headerIndex = values.findIndex((row) => row.includes(headerKey));
  if (headerIndex < 0) {
    throw new Error(`${sheetName}: header ${headerKey} not found`);
  }

  const headers = values[headerIndex].map((value) =>
    typeof value === "string" ? value.trim() : "",
  );

  return values
    .slice(headerIndex + 1)
    .filter((row) => row.some((value) => value !== null && value !== ""))
    .map((row) =>
      Object.fromEntries(
        headers
          .map((header, index) => [header, parseCell(row[index])])
          .filter(([header]) => header),
      ),
    );
}

function pick(record, keys) {
  return Object.fromEntries(
    keys.filter((key) => key in record).map((key) => [key, record[key]]),
  );
}

function groupLimit(records, key, limit) {
  const counts = new Map();
  return records.filter((record) => {
    const value = record[key];
    const count = counts.get(value) ?? 0;
    if (count >= limit) return false;
    counts.set(value, count + 1);
    return true;
  });
}

function sqlValue(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `'${text.replaceAll("'", "''")}'`;
}

try {
  await fs.access(inputPath);
} catch {
  throw new Error(
    `표준화 Excel을 찾을 수 없습니다: ${inputPath}\n` +
      "shared-data/standardized-data.xlsx에 파일을 두거나 " +
      "`pnpm data:build -- /absolute/path/file.xlsx`로 경로를 전달하세요.",
  );
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(inputPath);

const cases = extractRecords(workbook, "사례", "case_id");
const relations = extractRecords(workbook, "이슈관계", "relation_id");
const actions = extractRecords(workbook, "개선행위", "action_id");
const legalMappings = extractRecords(workbook, "근거_사례법령매핑", "mapping_id");
const guidelineMappings = extractRecords(workbook, "근거_사례지침매핑", "mapping_id");
const validation = extractRecords(workbook, "검수결과", "check_id");
const evaluation = extractRecords(workbook, "평가정답", "eval_id");

const caseFields = [
  "case_id",
  "project_name",
  "document_type",
  "source_file",
  "source_locator",
  "title",
  "original_text",
  "space_type",
  "zone",
  "review_segment",
  "primary_object",
  "related_objects",
  "discipline_standard",
  "primary_issue_category",
  "issue_categories",
  "issue_detail",
  "observed_conditions",
  "proposed_action",
  "action_types",
  "expected_effects",
  "idea_type",
  "final_decision",
  "decision_reason",
  "result_verified",
  "context_summary",
  "search_signatures",
  "overall_confidence",
  "human_review_status",
  "ramp_case",
  "context_text",
  "primary_object_standard",
  "primary_object_group",
  "primary_object_role",
  "primary_object_subtype",
  "object_standardization_confidence",
  "object_standardization_inferred",
];

const relationFields = [
  "relation_id",
  "case_id",
  "issue_category",
  "issue_detail",
  "subject",
  "relation",
  "object",
  "confidence_level",
  "inferred",
  "evidence_quote",
  "subject_standard",
  "subject_group",
  "object_standard",
  "object_group",
  "object_role",
  "relation_group",
  "relation_standard",
  "standardization_confidence",
  "standardization_inferred",
  "human_review_required",
  "review_reason",
];

const actionFields = [
  "action_id",
  "case_id",
  "action_order",
  "action_type",
  "action",
  "action_text",
  "primary_object",
  "primary_object_group",
  "target_object",
  "target_object_group",
  "issue_category",
  "issue_detail",
  "relation_group",
  "relation_standard",
  "confidence_level",
  "inferred",
  "evidence_quote",
];

const legalFields = [
  "mapping_id",
  "case_id",
  "이슈유형",
  "세부관계",
  "주요객체",
  "개선행위",
  "근거유형",
  "근거ID",
  "법령명",
  "핵심 조문",
  "적용성 판정",
  "적용 조건·검토 포인트",
  "confidence_level",
  "inferred",
  "원문인용 ID",
  "공식 출처",
  "object_group",
  "relation_group",
];

const guidelineFields = [
  "mapping_id",
  "case_id",
  "이슈유형",
  "세부관계",
  "주요객체",
  "개선행위",
  "근거유형",
  "근거ID",
  "지침명",
  "핵심 조문·근거위치",
  "적용성 판정",
  "적용 조건·검토 포인트",
  "confidence_level",
  "inferred",
  "원문인용 ID",
  "공식 출처",
  "매핑근거",
  "object_group",
  "relation_group",
];

const corpus = {
  meta: {
    version: "2026-07-27-standardized-expanded",
    sourceFile: inputPath.split("/").at(-1),
    generatedAt: new Date().toISOString(),
    counts: {
      cases: cases.length,
      relations: relations.length,
      actions: actions.length,
      legalMappings: legalMappings.length,
      guidelineMappings: guidelineMappings.length,
      validationChecks: validation.length,
      evaluationQueries: evaluation.length,
    },
  },
  cases: cases.map((record) => pick(record, caseFields)),
  relations: relations.map((record) => pick(record, relationFields)),
  actions: actions.map((record) => pick(record, actionFields)),
  legalMappings: groupLimit(legalMappings, "case_id", 4).map((record) =>
    pick(record, legalFields),
  ),
  guidelineMappings: groupLimit(guidelineMappings, "case_id", 6).map((record) =>
    pick(record, guidelineFields),
  ),
  validation,
  evaluation,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(seedPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(corpus)}\n`, "utf8");

const sqlColumns = [
  "id",
  "title",
  "document_type",
  "source_file",
  "source_locator",
  "space_type",
  "review_segment",
  "primary_object",
  "primary_object_group",
  "primary_issue_category",
  "issue_detail",
  "proposed_action",
  "final_decision",
  "overall_confidence",
  "human_review_status",
  "context_summary",
  "search_text",
  "dataset_version",
];

const sqlRows = corpus.cases.map((record) => [
  record.case_id,
  record.title,
  record.document_type,
  record.source_file,
  record.source_locator,
  record.space_type,
  record.review_segment,
  record.primary_object,
  record.primary_object_group,
  record.primary_issue_category,
  record.issue_detail,
  record.proposed_action,
  record.final_decision,
  record.overall_confidence,
  record.human_review_status,
  record.context_summary,
  [
    record.title,
    record.context_text,
    record.context_summary,
    ...(Array.isArray(record.search_signatures) ? record.search_signatures : []),
  ]
    .filter(Boolean)
    .join(" "),
  corpus.meta.version,
]);

const sqlChunks = [];
for (let index = 0; index < sqlRows.length; index += 40) {
  const chunk = sqlRows.slice(index, index + 40);
  sqlChunks.push(
    `INSERT OR REPLACE INTO cases (${sqlColumns.join(", ")}) VALUES\n${chunk
      .map((row) => `(${row.map(sqlValue).join(", ")})`)
      .join(",\n")};`,
  );
}

const seedSql = [
  "DELETE FROM cases;",
  ...sqlChunks,
  `INSERT OR REPLACE INTO dataset_versions (id, source_file, case_count, relation_count, action_count, legal_mapping_count, guideline_mapping_count, imported_at)
VALUES (${sqlValue(corpus.meta.version)}, ${sqlValue(corpus.meta.sourceFile)}, ${corpus.meta.counts.cases}, ${corpus.meta.counts.relations}, ${corpus.meta.counts.actions}, ${corpus.meta.counts.legalMappings}, ${corpus.meta.counts.guidelineMappings}, CURRENT_TIMESTAMP);`,
].join("\n\n--> statement-breakpoint\n\n");

await fs.writeFile(seedPath, `${seedSql}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: outputPath,
      seed: seedPath,
      counts: corpus.meta.counts,
      bundledEvidence: {
        legalMappings: corpus.legalMappings.length,
        guidelineMappings: corpus.guidelineMappings.length,
      },
    },
    null,
    2,
  ),
);
