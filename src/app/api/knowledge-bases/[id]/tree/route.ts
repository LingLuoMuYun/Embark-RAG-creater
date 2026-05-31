import { getKnowledgeBaseTreeService } from "@/features/knowledge-bases/server/knowledge-base-service";
import { idParamsSchema } from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await getKnowledgeBaseTreeService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
