import { NextRequest, NextResponse } from "next/server";
import { deleteCandidateById } from "@/server/services/extraction.service";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await deleteCandidateById(id);

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "候选知识不存在" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "已拒绝该候选知识",
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
