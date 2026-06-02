import {
  deleteDocumentSourceService,
  getDocumentDetailService,
  updateDocumentSourceService,
} from "@/server/services/document.service";
import {
  idParamsSchema,
  updateDocumentSourceSchema,
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
    const input = updateDocumentSourceSchema.parse(await request.json());
    const data = await updateDocumentSourceService(params.id, input);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const params = idParamsSchema.parse(await context.params);
    const data = await deleteDocumentSourceService(params.id);

    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
