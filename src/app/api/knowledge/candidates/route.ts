import { NextResponse } from "next/server";
import { listCandidates } from "@/server/services/extraction.service";

export async function GET() {
  try {
    const candidates = await listCandidates();

    return NextResponse.json({
      success: true,
      data: { candidates, count: candidates.length },
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
