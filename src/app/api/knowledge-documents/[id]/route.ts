import {
  deleteDocumentService,
  getDocumentDetailService,
  updateDocumentService,
} from "@/features/knowledge-bases/server/knowledge-document-service";
import {
  idParamsSchema,
  updateKnowledgeDocumentSchema,
} from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await getDocumentDetailService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const input = updateKnowledgeDocumentSchema.parse(await request.json());
    const data = await updateDocumentService(params.id, input);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await deleteDocumentService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
