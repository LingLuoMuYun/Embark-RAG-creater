import { NextRequest, NextResponse } from "next/server";

import {
  createDocument,
  listDocuments,
  saveDocumentFile,
  updateDocumentStatus,
  getFileTypeFromName,
} from "@/server/services/document.service";
import { documentListQuerySchema, uploadFileSchema } from "@/features/document/document.validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = documentListQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const result = await listDocuments(parsed.data);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list documents";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}

type UploadResult = { success: boolean; file: string; id?: string; error?: string };

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("file") as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "未提供文件" } },
        { status: 400 }
      );
    }

    const results: UploadResult[] = [];

    for (const file of files) {
      const fileType = getFileTypeFromName(file.name);
      const parsed = uploadFileSchema.safeParse({ fileName: file.name, fileSize: file.size, fileType });

      if (!parsed.success) {
        results.push({ success: false, file: file.name, error: parsed.error.issues[0].message });
        continue;
      }

      try {
        const doc = await createDocument({ originalName: file.name, fileType: parsed.data.fileType, fileSize: file.size });
        const buffer = Buffer.from(await file.arrayBuffer());
        await saveDocumentFile(doc.id, buffer);
        await updateDocumentStatus(doc.id, "uploaded");
        results.push({ success: true, file: file.name, id: doc.id });
      } catch (err) {
        results.push({ success: false, file: file.name, error: err instanceof Error ? err.message : "Upload failed" });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    return NextResponse.json({ success: true, data: { total: files.length, succeeded, results } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_ERROR", message } },
      { status: 500 }
    );
  }
}
