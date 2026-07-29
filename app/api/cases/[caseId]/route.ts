import { getCaseBundle } from "@/lib/corpus";

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const bundle = getCaseBundle(decodeURIComponent(caseId));

  if (!bundle) {
    return Response.json({ error: "case not found" }, { status: 404 });
  }

  return Response.json(bundle);
}
