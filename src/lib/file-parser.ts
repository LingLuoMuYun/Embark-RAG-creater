import mammoth from "mammoth";
import jschardet from "jschardet";
import iconv from "iconv-lite";
import * as XLSX from "xlsx";

const ALLOWED_TYPES = [
  "txt", "md", "csv", "xlsx", "doc", "docx", "pdf",
  "ppt", "pptx", "png", "jpg", "jpeg", "webp", "bmp",
] as const;
export type AllowedFileType = (typeof ALLOWED_TYPES)[number];
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const ENCODING_FALLBACKS = ["GBK", "GB2312", "BIG5", "SHIFT_JIS"];

function decodeTextBuffer(buffer: Buffer): string {
  const detected = jschardet.detect(buffer);
  const encoding = detected.encoding?.toUpperCase() ?? "";

  if (encoding && detected.confidence && detected.confidence >= 0.5) {
    try {
      return iconv.decode(buffer, encoding);
    } catch {
      // fall through to UTF-8
    }
  }

  const utf8Result = buffer.toString("utf-8");
  if (!utf8Result.includes("�")) {
    return utf8Result;
  }

  for (const enc of ENCODING_FALLBACKS) {
    try {
      const result = iconv.decode(buffer, enc);
      if (!result.includes("�")) {
        return result;
      }
    } catch {
      // skip
    }
  }

  return utf8Result;
}

export function validateFileType(
  fileType: string
): fileType is AllowedFileType {
  return ALLOWED_TYPES.includes(fileType as AllowedFileType);
}

export function getFileTypeFromName(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? null;
  if (!ext || !validateFileType(ext)) return null;
  return ext;
}

// ── Vision API helper for image content ─────────────────────

async function describeImage(buffer: Buffer, mime: string): Promise<string> {
  try {
    const { chatWithVision } = await import("@/lib/ai-extract");
    const { IMAGE_DESCRIPTION_PROMPT } = await import(
      "@/lib/prompts/extraction"
    );
    return await chatWithVision(buffer, mime, IMAGE_DESCRIPTION_PROMPT);
  } catch {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("chi_sim+eng");
    try {
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${mime};base64,${base64}`;
      const { data } = await worker.recognize(dataUrl);
      const text = data.text.trim();
      return text || "[图片无法识别]";
    } finally {
      await worker.terminate();
    }
  }
}

// ── CSV/表格 Markdown 格式化 ──────────────────────────

const MAX_TABLE_COLS_MARKDOWN = 5;

function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const colCount = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const p = [...r];
    while (p.length < colCount) p.push("");
    return p;
  });

  const header = padded[0];
  const body = padded.slice(1);

  if (colCount > MAX_TABLE_COLS_MARKDOWN) {
    const kvRows = body.map((row) =>
      header.map((h, i) => `${h}: ${row[i].trim()}`).join("  |  ")
    );
    return kvRows.map((r) => "| " + r + " |").join("\n");
  }

  const divider = header.map(() => "---");
  const fmtRow = (cells: string[]) =>
    "| " + cells.map((c) => c.trim()).join(" | ") + " |";

  const lines = [fmtRow(header), fmtRow(divider)];
  for (const row of body) {
    lines.push(fmtRow(row));
  }
  return lines.join("\n");
}

function isTableBlock(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const colCounts = rows.map((r) => r.length);
  const allSameCols = colCounts.every((c) => c === colCounts[0]);
  if (!allSameCols || colCounts[0] < 2) return false;

  let totalLen = 0;
  let cellCount = 0;
  for (const row of rows) {
    for (const cell of row) {
      totalLen += cell.length;
      cellCount++;
    }
  }
  const avgLen = totalLen / Math.max(1, cellCount);
  return avgLen <= 40;
}

function parseCSVText(text: string): string {
  const lines = text.split(/\r?\n/);
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  const parts: string[] = [];
  let tableIndex = 0;

  for (const block of blocks) {
    const rows = block.map((line) => {
      const cells: string[] = [];
      let cell = "";
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') {
          inQuote = !inQuote;
        } else if (ch === "," && !inQuote) {
          cells.push(cell);
          cell = "";
        } else {
          cell += ch;
        }
      }
      cells.push(cell);
      return cells;
    });

    if (isTableBlock(rows)) {
      tableIndex++;
      parts.push(`**表 ${tableIndex}**`);
      parts.push(rowsToMarkdownTable(rows));
    } else {
      parts.push(block.join("\n"));
    }
  }

  return parts.join("\n\n");
}

// ── XLSX ─────────────────────────────────────────────────

function fillMergedCells(rows: string[][], merges?: XLSX.Range[]): void {
  if (!merges || merges.length === 0) return;

  for (const merge of merges) {
    const sr = merge.s.r;
    const sc = merge.s.c;
    const er = merge.e.r;
    const ec = merge.e.c;

    if (sr >= rows.length) continue;
    const sourceVal = (rows[sr]?.[sc] ?? "").trim();
    if (!sourceVal) continue;

    for (let r = sr; r <= er && r < rows.length; r++) {
      for (let c = sc; c <= ec; c++) {
        if (r === sr && c === sc) continue;
        while (rows[r].length <= c) rows[r].push("");
        if (rows[r][c].trim() === "") {
          rows[r][c] = sourceVal;
        }
      }
    }
  }
}

function parseXlsxSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  sheetCount: number
): string {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const merges = sheet["!merges"] as XLSX.Range[] | undefined;

  const rows: string[][] = raw.map((row) =>
    row.map((cell) =>
      cell === undefined || cell === null ? "" : String(cell)
    )
  );

  fillMergedCells(rows, merges);

  const blocks: string[][][] = [];
  let current: string[][] = [];

  for (const row of rows) {
    if (row.every((c) => c.trim() === "")) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(row);
    }
  }
  if (current.length > 0) blocks.push(current);

  const parts: string[] = [];
  if (sheetCount > 1) parts.push(`### ${sheetName}`);

  for (let i = 0; i < blocks.length; i++) {
    const blockRows = blocks[i];
    if (blockRows.length >= 2) {
      const colCount = Math.max(...blockRows.map((r) => r.length));
      if (colCount >= 2) {
        if (blocks.length > 1) parts.push(`**表 ${i + 1}**`);
        parts.push(rowsToMarkdownTable(blockRows));
        continue;
      }
    }
    parts.push(blockRows.map((r) => r.join("  ")).join("\n"));
  }

  return parts.join("\n\n");
}

// ── DOCX (with table preservation and image extraction) ─────

async function parseDocx(buffer: Buffer): Promise<string> {
  interface MammothImage {
    contentType: string;
    altText?: string;
    read: () => Promise<Buffer>;
  }

  const m = mammoth as unknown as {
    convertToMarkdown(
      input: { buffer: Buffer },
      opts?: {
        convertImage?: (img: MammothImage) => { src: string } | Promise<{ src: string }>;
      }
    ): Promise<{ value: string; messages: Array<{ type: string; message: string }> }>;
    images: {
      imgElement(
        fn: (img: MammothImage) => { src: string } | Promise<{ src: string }>
      ): (img: MammothImage) => { src: string } | Promise<{ src: string }>;
    };
  };

  // Phase 1: extract image buffers (fast, no AI calls)
  const pendingImages: Array<{
    placeholder: string;
    buffer: Buffer;
    contentType: string;
  }> = [];

  let imageIndex = 0;
  const result = await m.convertToMarkdown({ buffer }, {
    convertImage: m.images.imgElement(async (img) => {
      imageIndex++;
      const contentType = img.contentType || "image/png";
      const placeholder = `[图片${imageIndex}: ${img.altText || "内嵌图片"}]`;
      try {
        const imgBuffer = await img.read();
        pendingImages.push({ placeholder, buffer: imgBuffer, contentType });
      } catch {
        // image read failed, keep placeholder as-is
      }
      return { src: placeholder };
    }),
  });

  let text = result.value;

  // Phase 2: process all images in parallel
  if (pendingImages.length > 0) {
    const results = await Promise.all(
      pendingImages.map(async ({ placeholder, buffer: imgBuf, contentType }) => {
        try {
          const desc = await describeImage(imgBuf, contentType);
          return { placeholder, description: desc };
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r) {
        text = text.replace(r.placeholder, `[图片描述: ${r.description}]`);
      }
    }
  }

  // Collect mammoth warnings
  if (result.messages && result.messages.length > 0) {
    const warnings = result.messages
      .filter((m) => m.type === "warning")
      .map((m) => m.message)
      .join("; ");
    if (warnings) {
      text = `<!-- 警告: ${warnings} -->\n\n${text}`;
    }
  }

  return text;
}

// ── PPTX (ZIP + XML extraction) ──────────────────────────

async function parsePptx(buffer: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter(
      (name) =>
        name.startsWith("ppt/slides/slide") && name.endsWith(".xml")
    )
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0", 10);
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0", 10);
      return numA - numB;
    });

  if (slideFiles.length === 0) {
    throw new Error("PPTX 文件中未找到幻灯片内容");
  }

  const parts: string[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.files[slideFiles[i]].async("text");

    // Extract text from <a:t> elements (DrawingML text)
    const textMatches: IterableIterator<RegExpExecArray> = slideXml.matchAll(
      /<a:t[^>]*>([^<]*)<\/a:t>/g
    );
    const texts: string[] = [];
    for (const m of textMatches) {
      const t = (m[1] ?? "").trim();
      if (t) texts.push(t);
    }

    if (texts.length > 0) {
      parts.push(`## 幻灯片 ${i + 1}\n\n${texts.join("\n\n")}`);
    }
  }

  return parts.join("\n\n") || "[PPTX 文件无可提取的文字内容]";
}

// ── PPT (old format, via LibreOffice conversion) ──────────

async function parsePpt(buffer: Buffer): Promise<string> {
  try {
    const { execSync } = await import("child_process");
    const { writeFileSync, unlinkSync, readFileSync, existsSync, rmdirSync, mkdtempSync } =
      await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const tmpDir = mkdtempSync(join(tmpdir(), "ppt-parse-"));
    const inputPath = join(tmpDir, "input.ppt");
    const outputPath = join(tmpDir, "input.pptx");
    writeFileSync(inputPath, buffer);

    try {
      execSync(
        `libreoffice --headless --convert-to pptx --outdir "${tmpDir}" "${inputPath}"`,
        { timeout: 30000, stdio: "pipe" }
      );
      if (existsSync(outputPath)) {
        return parsePptx(readFileSync(outputPath));
      }
    } finally {
      try { unlinkSync(inputPath); } catch {}
      try { unlinkSync(outputPath); } catch {}
      try { rmdirSync(tmpDir); } catch {}
    }
  } catch {
    // LibreOffice not available
  }
  throw new Error(
    "无法解析 .ppt 旧版 PowerPoint 文件。请将文件另存为 .pptx 格式后再上传，或在服务器上安装 LibreOffice。"
  );
}

// ── DOC (old Word format) ────────────────────────────────

async function parseDoc(buffer: Buffer): Promise<string> {
  // 优先用 LibreOffice 转 docx，以保留表格和图片
  try {
    const { execSync } = await import("child_process");
    const { writeFileSync, unlinkSync, readFileSync, existsSync, rmdirSync, mkdtempSync } =
      await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const tmpDir = mkdtempSync(join(tmpdir(), "doc-parse-"));
    const inputPath = join(tmpDir, "input.doc");
    const outputPath = join(tmpDir, "input.docx");
    writeFileSync(inputPath, buffer);

    try {
      execSync(
        `libreoffice --headless --convert-to docx --outdir "${tmpDir}" "${inputPath}"`,
        { timeout: 30000, stdio: "pipe" }
      );
      if (existsSync(outputPath)) {
        const docxBuffer = readFileSync(outputPath);
        return parseDocx(docxBuffer);
      }
    } finally {
      try { unlinkSync(inputPath); } catch {}
      try { unlinkSync(outputPath); } catch {}
      try { rmdirSync(tmpDir); } catch {}
    }
  } catch {
    // LibreOffice 不可用，退回纯文本提取（无图片/表格）
  }

  const WordExtractor = (await import("word-extractor")).default;
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  return doc.getBody().trim() || "[DOC 文件无可提取的文字内容]";
}

// ── Main parse function ──────────────────────────────────

export async function parseFileContent(
  buffer: Buffer,
  fileType: AllowedFileType
): Promise<string> {
  switch (fileType) {
    case "txt":
    case "md":
      return decodeTextBuffer(buffer);

    case "csv": {
      const text = decodeTextBuffer(buffer);
      return parseCSVText(text);
    }

    case "xlsx": {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        parts.push(
          parseXlsxSheet(sheet, sheetName, workbook.SheetNames.length)
        );
      }

      return parts.join("\n\n");
    }

    case "docx":
      return parseDocx(buffer);

    case "doc":
      return parseDoc(buffer);

    case "pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const textResult = await parser.getText();
        return textResult.text;
      } finally {
        await parser.destroy();
      }
    }

    case "pptx":
      return parsePptx(buffer);

    case "ppt":
      return parsePpt(buffer);

    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "bmp": {
      const mime =
        fileType === "jpg" ? "image/jpeg" : `image/${fileType}`;
      return describeImage(buffer, mime);
    }

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
