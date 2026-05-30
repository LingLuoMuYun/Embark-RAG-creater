"use client";

import { useCallback, useRef, useState } from "react";

const ALLOWED_EXTENSIONS = ".txt,.md,.csv,.xlsx,.docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp";
const ALLOWED_LIST = ["txt", "md", "csv", "xlsx", "docx", "pdf", "png", "jpg", "jpeg", "webp", "bmp"];
const MAX_SIZE_MB = 100;

export function DocumentUploader({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [dragover, setDragover] = useState(false);
  const [currentFile, setCurrentFile] = useState("");

  const uploading = total > 0 && done + failed.length < total;

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      setTotal(fileArray.length);
      setDone(0);
      setFailed([]);

      // Pre-validate
      const valid: File[] = [];
      for (const file of fileArray) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !ALLOWED_LIST.includes(ext)) {
          setFailed((prev) => [...prev, `${file.name}（类型不支持）`]);
          continue;
        }
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          setFailed((prev) => [...prev, `${file.name}（超过${MAX_SIZE_MB}MB）`]);
          continue;
        }
        valid.push(file);
      }

      if (valid.length === 0) { setDone(fileArray.length); setCurrentFile(""); return; }

      setCurrentFile(`${valid.length} 个文件`);
      try {
        const formData = new FormData();
        valid.forEach((f) => formData.append("file", f));
        const res = await fetch("/api/documents", { method: "POST", body: formData });
        const json = await res.json();
        if (json.success) {
          for (const r of json.data.results) {
            if (!r.success) setFailed((prev) => [...prev, `${r.file}（${r.error || "上传失败"}）`]);
          }
        }
      } catch {
        setFailed((prev) => [...prev, "网络错误"]);
      }
      setDone(fileArray.length);
      setCurrentFile("");
      onUploaded();
      setTimeout(() => { setTotal(0); setDone(0); setFailed([]); }, 3000);
    },
    [onUploaded]
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) uploadFiles(e.target.files);
    e.target.value = "";
  }, [uploadFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  return (
    <div
      className={`rounded-lg border-2 border-dashed bg-zinc-50 p-8 text-center transition-colors ${
        dragover ? "border-blue-500 bg-blue-100" : "border-zinc-300 hover:border-zinc-400"
      }`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragover(false); }}
    >
      <input ref={inputRef} type="file" multiple accept={ALLOWED_EXTENSIONS} onChange={handleFileChange} className="hidden" />

      <div className="flex flex-col items-center gap-3">
        <svg className="h-10 w-10 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className="text-sm text-zinc-600">
                上传中 {done + failed.length}/{total}
              </span>
            </div>
            {currentFile && (
              <span className="max-w-[240px] truncate text-xs text-zinc-500">{currentFile}</span>
            )}
            {failed.length > 0 && (
              <p className="max-w-md text-xs text-red-500">{failed.join("；")}</p>
            )}
          </div>
        ) : total > 0 && done === total ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm text-green-600">完成 {total - failed.length}/{total} 个文件</p>
            {failed.length > 0 && <p className="max-w-md text-xs text-red-500">失败：{failed.join("；")}</p>}
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              <button onClick={() => inputRef.current?.click()} className="font-medium text-blue-600 hover:text-blue-700">
                点击选择文件
              </button>
              &nbsp;或拖拽文件到此区域
            </p>
            <p className="text-xs text-zinc-400">支持文档/表格/图片，最大 {MAX_SIZE_MB}MB，可多选</p>
          </>
        )}
      </div>
    </div>
  );
}
