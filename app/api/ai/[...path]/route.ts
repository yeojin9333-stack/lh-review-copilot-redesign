import {
  externalBackendUrl,
  handleNativeReviewCopilot,
  proxyReviewCopilot,
} from "@/lib/review-copilot-server";

const routes = {
  health: { path: "/api/v1/health", methods: ["GET"] },
  documents: {
    path: "/api/v1/knowledge/documents",
    methods: ["GET", "POST"],
  },
  review: { path: "/api/v1/review/package", methods: ["POST"] },
  chat: { path: "/api/v1/chat", methods: ["POST"] },
  retrieve: { path: "/api/v1/rag/retrieve", methods: ["POST"] },
} as const;

type RouteName = keyof typeof routes;

async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const routeName = path.join("/") as RouteName;
  const route = routes[routeName];
  if (!route) {
    return Response.json({ detail: "지원하지 않는 AI 경로입니다." }, { status: 404 });
  }
  if (!(route.methods as readonly string[]).includes(request.method)) {
    return Response.json({ detail: "지원하지 않는 요청 방식입니다." }, { status: 405 });
  }

  if (externalBackendUrl()) {
    return proxyReviewCopilot(request, route.path);
  }
  return handleNativeReviewCopilot(request, routeName);
}

export const GET = handle;
export const POST = handle;
