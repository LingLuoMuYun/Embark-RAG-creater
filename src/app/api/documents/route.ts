import {
  createDocumentService,
  getDocumentListService,
} from "@/features/knowledge-bases/server/knowledge-document-service";
import {
  createKnowledgeDocumentSchema,
  documentListQuerySchema,
} from "@/features/knowledge-bases/server/schemas";
import { handleRouteError, successResponse } from "@/lib/api-response";
// 获取文档列表;
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = documentListQuerySchema.parse({
      keyword: url.searchParams.get("keyword") ?? undefined,
      sourceType: url.searchParams.get("sourceType") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      parseStatus: url.searchParams.get("parseStatus") ?? undefined,
    });

    const data = await getDocumentListService(query);
    return successResponse(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
// 创建知识文档。
export async function POST(request: Request) {
  try {
    const input = createKnowledgeDocumentSchema.parse(await request.json());
    const data = await createDocumentService(input);

    return successResponse(data, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
