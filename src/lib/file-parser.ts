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

export async function parseFileContent(
  buffer: Buffer,
  fileType: AllowedFileType
): Promise<string> {
  switch (fileType) {
    case "txt":
    case "md":
    case "csv":
      return decodeTextBuffer(buffer);

    case "xlsx": {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const lines = XLSX.utils.sheet_to_csv(sheet, {
          blankrows: false,
          strip: true,
        });

        if (lines.trim()) {
          // For single-sheet workbooks, skip the sheet header
          if (workbook.SheetNames.length > 1) {
            parts.push(`--- ${sheetName} ---`);
          }
          parts.push(lines);
        }
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
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("chi_sim+eng");
      try {
        const { data } = await worker.recognize(buffer);
        return data.text;
      } finally {
        await worker.terminate();
      }
    }

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
