import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG Creater",
  description: "一个用于 RAG 生成、管理与 Agent 消费的全栈应用。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
