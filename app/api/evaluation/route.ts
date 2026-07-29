import { evaluationQueries, validationResults } from "@/lib/corpus";

export async function GET() {
  return Response.json({
    evaluationQueries,
    validationResults,
    metrics: ["Recall@5", "MRR@10", "nDCG@10", "관계정확도"],
  });
}
