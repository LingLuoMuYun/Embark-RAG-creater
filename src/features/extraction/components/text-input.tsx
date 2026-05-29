"use client";

import { useState, useRef } from "react";

interface Props {
  onExtract: (text: string) => void;
  loading: boolean;
}

const SAMPLE_TEXT = `# React 18 新特性介绍

## 1. 自动批处理 (Automatic Batching)
React 18 引入了自动批处理机制。在之前的版本中，只有在 React 事件处理函数中的状态更新会被批处理。而在 React 18 中，所有状态更新都会自动批处理，包括 Promise、setTimeout、原生事件等。

## 2. Transitions
Transitions 是 React 18 中引入的新概念，用于区分紧急更新和非紧急更新。使用 startTransition API 可以将某些状态更新标记为 transition，这样 React 会优先处理更紧急的更新。

## 3. Suspense 改进
React 18 对 Suspense 进行了重大改进，现在支持服务端渲染的 Suspense。通过 Streaming SSR，服务端可以逐步发送 HTML，客户端可以更早地开始 hydration。

## 4. Concurrent Features
并发渲染是 React 18 的底层架构改进。它允许 React 在渲染过程中中断和恢复工作，从而提供更好的用户体验。
使用 useDeferredValue 可以延迟更新某个值的渲染，保持界面响应。`;

const ACCEPTED_TYPES = ".txt,.md,.markdown,.docx";

export default function TextInput({ onExtract, loading }: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!text.trim() || loading) return;
    onExtract(text.trim());
  };

  const fillSample = () => {
    setText(SAMPLE_TEXT);
    setFileName("");
  };

  const parseFile = async (file: File) => {
    setFileError("");
    setFileLoading(true);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let content = "";

      if (ext === "txt" || ext === "md" || ext === "markdown") {
        content = await file.text();
      } else if (ext === "docx") {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({
          arrayBuffer: await file.arrayBuffer(),
        });
        content = result.value;
        if (!content.trim()) throw new Error("文档内容为空或无法解析");
      } else {
        throw new Error(`不支持的文件类型: .${ext}`);
      }

      if (!content.trim()) throw new Error("文件内容为空");

      setText(content);
      setFileName(file.name);
    } catch (err: unknown) {
      setFileError(
        err instanceof Error ? err.message : "文件解析失败"
      );
      setText("");
      setFileName("");
    } finally {
      setFileLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-800">
          粘贴文本材料
        </h2>
        <button
          onClick={fillSample}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          填入示例文本
        </button>
      </div>

      {/* 拖拽上传区 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-blue-300 hover:bg-gray-50"
        } ${loading || fileLoading ? "pointer-events-none opacity-50" : ""}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileChange}
          className="hidden"
        />
        {fileLoading ? (
          <div className="text-gray-400">
            <svg
              className="animate-spin h-8 w-8 mx-auto mb-2"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-sm">正在解析文档...</p>
          </div>
        ) : (
          <>
            <svg
              className="mx-auto h-10 w-10 text-gray-400 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm text-gray-600 font-medium">
              点击选择文件，或拖拽文件到此处
            </p>
            <p className="text-xs text-gray-400 mt-1">
              支持 TXT、Markdown、DOCX 格式（PDF 请通过文档导入页面上传）
            </p>
          </>
        )}
      </div>

      {fileError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {fileError}
        </div>
      )}

      {fileName && text && (
        <div className="bg-green-50 border border-green-200 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg
            className="h-4 w-4 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span className="text-green-700 font-medium">{fileName}</span>
          <span className="text-green-500">解析成功</span>
          <button
            onClick={() => {
              setText("");
              setFileName("");
            }}
            className="ml-auto text-green-600 hover:text-green-800 underline text-xs"
          >
            清除
          </button>
        </div>
      )}

      {/* 文本输入区 */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="在此粘贴需要提炼的文本材料，或拖拽文件到上方区域..."
        className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y text-sm leading-relaxed"
        disabled={loading}
      />

      {/* 提交按钮 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || loading}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              AI 提炼中...
            </>
          ) : (
            "AI 提炼知识"
          )}
        </button>
        <span className="text-xs text-gray-400">
          {fileName ? `文档模式：${fileName}` : "文本模式：从粘贴的文本中提炼"}
        </span>
      </div>
    </div>
  );
}
