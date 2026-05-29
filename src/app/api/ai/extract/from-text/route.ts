import { NextRequest, NextResponse } from "next/server";
import { ExtractRequestSchema } from "@/features/extraction/extraction.validation";
import { extractFromText } from "@/server/services/extraction.service";
import { prisma } from "@/lib/db";

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

    // 写入候选表
    if (result.candidates && result.candidates.length > 0) {
      const rows = result.candidates.map((c) => ({
        title: c.title,
        content: c.content,
        suggestedCategory: c.suggestedCategory || null,
        suggestedTags: JSON.stringify(c.suggestedTags || []),
        type: c.type,
        status: "pending",
      }));
      await prisma.candidateKnowledge.createMany({ data: rows });
    }

    return NextResponse.json({
      success: true,
      data: {
        candidates: result.candidates,
        count: result.candidates?.length || 0,
      },
      message: `成功提炼 ${result.candidates?.length || 0} 条候选知识`,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "服务器内部错误";
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message },
      },
      { status: 500 }
    );
  }
}
