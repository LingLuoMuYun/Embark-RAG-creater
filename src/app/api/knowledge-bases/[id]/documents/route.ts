import {
  bindDocumentsToKnowledgeBaseService,
  unbindDocumentsFromKnowledgeBaseService,
} from "@/features/knowledge-bases/server/knowledge-base-service";
import {
  documentIdsBodySchema,
  idParamsSchema,
} from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = documentIdsBodySchema.parse(await request.json());
    const data = await bindDocumentsToKnowledgeBaseService(
      params.id,
      body.documentIds
    );

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const body = documentIdsBodySchema.parse(await request.json());
    const data = await unbindDocumentsFromKnowledgeBaseService(
      params.id,
      body.documentIds
    );

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
