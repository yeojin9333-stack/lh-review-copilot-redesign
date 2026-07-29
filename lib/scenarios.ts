import scenarioData from "@/data/ramp-scenarios.json";

export type ScenarioEvidence = {
  "Evidence ID": string;
  "시나리오 ID": string;
  "근거 유형": string;
  "후보 ID": string;
  "후보명·사례명": string;
  "근거 위치": string;
  "회수 기대 이유": string;
  "기대 등급": string;
  "기대 순위": string;
  "유사성·적용성": string;
  "검증 상태": string;
  "적용 조건·주의": string;
  "출처 파일·기관": string;
  "원문 인용 ID": string;
};

export type ScenarioContext = {
  "시나리오 ID": string;
  공간: string;
  주요객체: string;
  객체유형: string;
  형상조건: string;
  운영조건: string;
  위치조건: string;
  연관객체: string;
  공간관계: string;
  관찰조건: string;
  이슈: string;
  "검토의도·개선행위": string;
  "공간적 영향": string;
  "적용성 조건": string;
  "필수 확인값": string;
  "추정 금지": string;
  신뢰등급: string;
  "Context 요약": string;
  "Context JSON": string;
};

export type RampScenario = {
  "시나리오 ID": string;
  난이도: string;
  "사용자 입력": string;
  "합성 상황 설명": string;
  "검토 의도": string;
  "확인된 정보": string;
  "미확인·추가 질문": string;
  "기대 처리": string;
  "Context 행 수": string;
  "Evidence 행 수": string;
  완전성: string;
  "데이터 성격": string;
  "실행 상태": string;
  context: ScenarioContext | null;
  evidence: ScenarioEvidence[];
};

export type ScenarioRule = Record<string, string>;
export type ScenarioSourceCase = Record<string, string>;

const dataset = scenarioData as unknown as {
  meta: {
    title: string;
    sourceFile: string;
    generatedAt: string;
    synthetic: boolean;
    usageNotice: string;
    counts: Record<string, number>;
  };
  scenarios: RampScenario[];
  sourceCases: ScenarioSourceCase[];
  rules: ScenarioRule[];
};

export const scenarioMeta = dataset.meta;
export const rampScenarios = dataset.scenarios;

export function getRampScenario(scenarioId: string) {
  return (
    dataset.scenarios.find((scenario) => scenario["시나리오 ID"] === scenarioId) ??
    dataset.scenarios[0]
  );
}

export function getScenarioSourceCase(caseId: string) {
  return dataset.sourceCases.find((record) => record["사례 ID"] === caseId) ?? null;
}

export function getScenarioRule(ruleId: string) {
  return dataset.rules.find((record) => record["Rule ID"] === ruleId) ?? null;
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .split(/[\s·,/|()[\]{}:_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function evidenceSearchText(record: ScenarioEvidence) {
  return [
    record["Evidence ID"],
    record["근거 유형"],
    record["후보 ID"],
    record["후보명·사례명"],
    record["회수 기대 이유"],
    record["유사성·적용성"],
    record["적용 조건·주의"],
  ]
    .join(" ")
    .toLowerCase();
}

export function rankScenarioEvidence(
  scenario: RampScenario,
  query: string,
  limit = 6,
) {
  const queryTokens = tokens(query);
  return scenario.evidence
    .map((record) => {
      const text = evidenceSearchText(record);
      const tokenScore = queryTokens.reduce(
        (score, token) => score + (text.includes(token) ? 4 : 0),
        0,
      );
      const gradeScore = record["기대 등급"] === "핵심" ? 18 : 8;
      const similarityScore = record["유사성·적용성"].includes("직접") ? 8 : 3;
      const rankScore = Math.max(0, 12 - Number(record["기대 순위"] || 12));
      return {
        record,
        score: gradeScore + similarityScore + rankScore + tokenScore,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(limit, 12)));
}

export function findMatchingScenario(query: string) {
  const queryTokens = tokens(query);
  if (!queryTokens.length) return getRampScenario("RMP-S28");

  return (
    dataset.scenarios
      .map((scenario) => {
        const text = [
          scenario["사용자 입력"],
          scenario["합성 상황 설명"],
          scenario["확인된 정보"],
          scenario["검토 의도"],
          scenario.context?.["Context 요약"],
          scenario.context?.이슈,
          scenario.context?.공간관계,
        ]
          .join(" ")
          .toLowerCase();
        return {
          scenario,
          score: queryTokens.reduce(
            (score, token) => score + (text.includes(token) ? 1 : 0),
            0,
          ),
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.scenario ??
    getRampScenario("RMP-S28")
  );
}
