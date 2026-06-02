import { NextRequest, NextResponse } from "next/server";

import { ExtractRequestSchema } from "@/features/extraction/extraction.validation";
import {
  createAiDocumentFromText,
  extractFromText,
} from "@/server/services/extraction.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ExtractRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { text } = parsed.data;
    const result = await extractFromText(text);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EXTRACTION_FAILED",
            message: result.error,
          },
          retryable: result.retryable,
        },
        { status: 422 }
      );
    }

    const extractedChunks = result.candidates ?? [];
    const saved = await createAiDocumentFromText(text, extractedChunks);

    return NextResponse.json({
      success: true,
      data: {
        documentId: saved.document.id,
        documentName: saved.document.title,
        chunks: saved.chunks,
        count: saved.chunks.length,
      },
      message: `成功提炼 ${saved.chunks.length} 条知识分片`,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "服务器内部错误";
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message },
      },
      { status: 500 }
    );
  }
}
