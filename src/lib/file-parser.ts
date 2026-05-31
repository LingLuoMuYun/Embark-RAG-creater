import mammoth from "mammoth";
import jschardet from "jschardet";
import iconv from "iconv-lite";
import * as XLSX from "xlsx";

const ALLOWED_TYPES = ["txt", "md", "csv", "xlsx", "docx", "pdf", "png", "jpg", "jpeg", "webp", "bmp"] as const;
export type AllowedFileType = (typeof ALLOWED_TYPES)[number];
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const ENCODING_FALLBACKS = ["GBK", "GB2312", "BIG5", "SHIFT_JIS"];

function decodeTextBuffer(buffer: Buffer): string {
  // Detect encoding
  const detected = jschardet.detect(buffer);
  const encoding = detected.encoding?.toUpperCase() ?? "";

  // Try detected encoding first (if confidence is reasonable)
  if (encoding && detected.confidence && detected.confidence >= 0.5) {
    try {
      return iconv.decode(buffer, encoding);
    } catch {
      // fall through to UTF-8
    }
  }

  // Try UTF-8
  const utf8Result = buffer.toString("utf-8");
  // Check for replacement characters indicating decoding failure
  if (!utf8Result.includes("�")) {
    return utf8Result;
  }

  // Try common encodings for Chinese documents
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

  // Last resort: return UTF-8 result even if it has replacement chars
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

// ── CSV/表格 Markdown 格式化 ──────────────────────────

const MAX_TABLE_COLS_MARKDOWN = 5;

/**
 * Format table rows. Wide tables (>5 cols) use key-value per row;
 * narrow tables use Markdown grid.
 */
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
    // Wide table → key-value rows
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

/**
 * Heuristic: a block of CSV lines likely IS a table if:
 * - ≥2 rows, ≥2 columns, consistent column count
 * - average cell length ≤ 40 (long prose cells aren't table data)
 */
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

/**
 * Fill cells covered by XLSX merge ranges so no cell is left empty.
 */
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

    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case "pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      await parser.destroy();
      return textResult.text;
    }

    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "bmp": {
      const { chatWithVision } = await import("@/lib/ai-extract");
      const { IMAGE_DESCRIPTION_PROMPT } = await import(
        "@/lib/prompts/extraction"
      );
      const mime = fileType === "jpg" ? "image/jpeg" : `image/${fileType}`;
      return chatWithVision(buffer, mime, IMAGE_DESCRIPTION_PROMPT);
    }

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
