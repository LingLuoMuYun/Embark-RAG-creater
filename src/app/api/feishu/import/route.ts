import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { FeishuDocType } from "@/lib/feishu";
import { fetchFeishuDocContent } from "@/lib/feishu";
import {
  createDocument,
  saveDocumentFile,
  updateDocumentStatus,
} from "@/server/services/document.service";

const importSchema = z.object({
  url: z.string().min(1, "请输入飞书文档链接"),
});

/** 飞书文档类型 -> 文件扩展名映射 */
const FEISHU_TYPE_TO_FILE_TYPE: Record<string, string> = {
  docx: "md",
  docs: "md",
  wiki: "md",
  sheets: "txt",
  bitable: "txt",
  minutes: "txt",
};

function getFileType(docType: FeishuDocType): string {
  return FEISHU_TYPE_TO_FILE_TYPE[docType] ?? "txt";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { title, content, docType } = await fetchFeishuDocContent(parsed.data.url);

    if (!content.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "EMPTY_CONTENT", message: "文档内容为空" } },
        { status: 422 }
      );
    }

    // 创建文档记录（根据飞书文档类型映射文件类型）
    const doc = await createDocument({
      originalName: title,
      fileType: getFileType(docType),
      fileSize: content.length,
    });

    // 将内容保存到磁盘文件（同文件上传一致）
    const buffer = Buffer.from(content, "utf-8");
    await saveDocumentFile(doc.id, buffer);

    // 保存原始内容并标记为"待解析"，等待用户手动点击解析
    await updateDocumentStatus(doc.id, "uploaded", { rawContent: content });

    return NextResponse.json({
      success: true,
      data: {
        id: doc.id,
        title: doc.originalName,
        contentLength: content.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败";
    return NextResponse.json(
      { success: false, error: { code: "FEISHU_IMPORT_ERROR", message } },
      { status: 500 }
    );
  }
}
