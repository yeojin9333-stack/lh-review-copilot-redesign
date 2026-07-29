import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ExcelJS from "exceljs";

const root = process.cwd();
const sourcePath = path.resolve(
  root,
  process.argv[2] ?? "shared-data/scenario-data.xlsx",
);
const outputPath = path.resolve(
  root,
  process.argv[3] ?? "data/ramp-scenarios.json",
);

function plainValue(cell) {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value !== "object") return String(value).trim();
  if ("result" in value && value.result != null) return String(value.result).trim();
  if ("text" in value && value.text != null) return String(value.text).trim();
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? "").join("").trim();
  }
  return String(value).trim();
}

function recordsFromSheet(worksheet, headerRow = 5) {
  const headers = [];
  worksheet.getRow(headerRow).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column] = plainValue(cell);
  });

  const records = [];
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const firstValue = plainValue(row.getCell(1));
    if (!firstValue) continue;
    const record = {};
    for (let column = 1; column < headers.length; column += 1) {
      const header = headers[column];
      if (!header) continue;
      record[header] = plainValue(row.getCell(column));
    }
    records.push(record);
  }
  return records;
}

function requiredSheet(workbook, name) {
  const worksheet = workbook.getWorksheet(name);
  if (!worksheet) throw new Error(`필수 시트가 없습니다: ${name}`);
  return worksheet;
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourcePath);

const scenarios = recordsFromSheet(requiredSheet(workbook, "시나리오 입력"));
const contexts = recordsFromSheet(requiredSheet(workbook, "Context 기대값"));
const evidence = recordsFromSheet(requiredSheet(workbook, "Evidence 기대값"));
const sourceCases = recordsFromSheet(requiredSheet(workbook, "유사사례 원본"));
const rules = recordsFromSheet(requiredSheet(workbook, "근거 카탈로그"));

const contextByScenario = new Map(
  contexts.map((record) => [record["시나리오 ID"], record]),
);
const evidenceByScenario = new Map();
for (const record of evidence) {
  const scenarioId = record["시나리오 ID"];
  const group = evidenceByScenario.get(scenarioId) ?? [];
  group.push(record);
  evidenceByScenario.set(scenarioId, group);
}

const dataset = {
  meta: {
    title: "주차장 램프 PoC 시나리오 데이터",
    sourceFile: path.basename(sourcePath),
    generatedAt: new Date().toISOString(),
    synthetic: true,
    usageNotice:
      "PoC 검증용 합성 시나리오입니다. Evidence는 기대 검색 후보이며 설계 적합성·법령 적용의 최종 판정이 아닙니다.",
    counts: {
      scenarios: scenarios.length,
      contexts: contexts.length,
      evidence: evidence.length,
      sourceCases: sourceCases.length,
      rules: rules.length,
    },
  },
  scenarios: scenarios.map((scenario) => {
    const scenarioId = scenario["시나리오 ID"];
    return {
      ...scenario,
      context: contextByScenario.get(scenarioId) ?? null,
      evidence: (evidenceByScenario.get(scenarioId) ?? []).sort(
        (left, right) =>
          Number(left["기대 순위"] || 999) - Number(right["기대 순위"] || 999),
      ),
    };
  }),
  sourceCases,
  rules,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

console.log(
  `scenario dataset written: ${path.relative(root, outputPath)} ` +
    `(${scenarios.length} scenarios, ${evidence.length} evidence rows)`,
);
