import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BASE_URL = "https://open.feishu.cn/open-apis";

interface AuthResult {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
}

const debugBodySchema = z.object({
  documentId: z.string().optional(),
  url: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const results: Record<string, unknown> = {};

  try {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json({ success: false, error: "未配置飞书应用凭证" });
    }

    // 测试鉴权
    const tokenRes = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const tokenData: AuthResult = await tokenRes.json();
    results.authStatus = tokenRes.status;
    results.authCode = tokenData.code;
    results.authMsg = tokenData.msg;
    results.hasToken = !!tokenData.tenant_access_token;

    if (!tokenData.tenant_access_token) {
      return NextResponse.json(
        { success: false, error: "鉴权失败" },
        { status: 401 }
      );
    }

    const token = tokenData.tenant_access_token;
    const body = await request.json().catch(() => ({}));
    const parsed = debugBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const docId = parsed.data.documentId ?? parsed.data.url ?? "";

    if (!docId) {
      return NextResponse.json({
        success: true,
        message: "鉴权成功，传入 documentId 或 url 以测试文档访问",
        results,
      });
    }

    // 提取 ID
    const idMatch = docId.match(/(?:docx|wiki|docs)\/([a-zA-Z0-9]+)/);
    const extractedId = idMatch ? idMatch[1] : docId;

    // 测试 docx 信息接口
    {
      const res = await fetch(`${BASE_URL}/docx/v1/documents/${extractedId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      results.docxInfoStatus = res.status;
    }

    // 测试 raw_content 接口
    {
      const res = await fetch(`${BASE_URL}/docx/v1/documents/${extractedId}/raw_content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      results.rawContentStatus = res.status;
      results.hasContent = res.ok;
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
