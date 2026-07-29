import { corpusMeta, searchCases } from "@/lib/corpus";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const issue = url.searchParams.get("issue");
  const object = url.searchParams.get("object");
  const limit = Number(url.searchParams.get("limit") ?? 12);
  const cases = searchCases({ query, issue, object, limit });

  return Response.json({
    cases,
    meta: corpusMeta,
    query: { query, issue, object },
  });
}
