import { deleteChunkService } from "@/features/knowledge-bases/server/knowledge-chunk-service";
import { idParamsSchema } from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await deleteChunkService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
