import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const requiredFiles = [
  "README.md",
  "TEAM_START_HERE.txt",
  "TEAM_HANDOFF_TEMPLATE.md",
  "TEAM_PACKAGE_VERSION.txt",
  "README_TEAM_AI.txt",
  "TEAM_GUIDE.md",
  "TEAM_CHANGELOG.md",
  "package.json",
  "pnpm-lock.yaml",
  ".openai/TEAM_DEPLOYMENT_NOTICE.txt",
  "data/ve-context.json",
  "data/ramp-scenarios.json",
  "drizzle/0001_seed-cases.sql",
  "public/fonts/nanum-square-400.otf",
  "services/review-copilot-ai-ollama/app/main.py",
];
const excludedFromArchive = [
  ".git",
  "node_modules",
  "dist",
  ".vinext",
  ".wrangler",
  ".next",
  "coverage",
  "outputs",
  "work",
];
const secretNames = [/^\.env(?:\.|$)/, /\.pem$/i, /\.key$/i, /credentials?/i];

function exists(relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function walk(directory, results = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(projectRoot, absolute);
    if (entry.isDirectory()) {
      if (!excludedFromArchive.includes(entry.name)) walk(absolute, results);
    } else {
      results.push(relative);
    }
  }
  return results;
}

const missing = requiredFiles.filter((file) => !exists(file));
const suspicious = walk(projectRoot).filter(
  (file) =>
    path.basename(file) !== ".env.example" &&
    secretNames.some((pattern) => pattern.test(path.basename(file))),
);
const removable = excludedFromArchive.filter((directory) => exists(directory));
const sourceWorkbook = exists("shared-data/standardized-data.xlsx");
const scenarioWorkbook = exists("shared-data/scenario-data.xlsx");
const hostingConfiguration = exists(".openai/hosting.json");

console.log("LH Review Copilot · 팀 공유 전 점검");
console.log(`- 필수 파일: ${missing.length ? `누락 ${missing.join(", ")}` : "정상"}`);
console.log(`- 표준화 Excel: ${sourceWorkbook ? "포함됨" : "미포함(코드 실행에는 영향 없음)"}`);
console.log(`- 시나리오 Excel: ${scenarioWorkbook ? "포함됨" : "미포함(생성 JSON으로 실행 가능)"}`);
console.log(
  `- 압축 제외 권장: ${removable.length ? removable.join(", ") : "해당 없음"}`,
);
console.log(
  `- 비밀정보 의심 파일: ${suspicious.length ? suspicious.join(", ") : "없음"}`,
);
console.log(
  hostingConfiguration
    ? "- 배포 주의: 현재 원본의 .openai/hosting.json은 공유 ZIP에서 제외하세요."
    : "- 배포 연결정보: 팀 공유본에서 안전하게 제외됨",
);

if (missing.length || suspicious.length) process.exitCode = 1;
