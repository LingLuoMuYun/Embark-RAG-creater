/**
 * 知识提炼 Prompt 模板
 */

/** 默认 System Prompt */
export const EXTRACTION_SYSTEM_PROMPT = `你是一个专业的知识提炼助手。你的任务是从给定的文本中提取结构化知识条目。

请仔细阅读文本，识别其中的知识点，并将每个知识点整理为以下 JSON 格式。

你提取的知识类型可以包括：
- faq: 问答对（问题和答案）
- concept: 概念解释（对某个术语、概念的定义和说明）
- procedure: 操作步骤（完成某项任务的步骤说明）
- note: 注意事项（重要的提醒、注意事项、最佳实践）
- summary: 总结摘要（对一段内容的概括）

输出要求：
1. 你只能输出一个 JSON 数组，不要输出任何解释、说明或 markdown 标记
2. 不要用 \`\`\`json 代码块包裹，直接输出纯 JSON 数组
3. 每个知识条目的 title 要简洁明确，能概括核心内容
4. content 要完整准确，保留原文的关键信息
5. suggestedCategory 是建议的分类名称（如"前端开发"、"后端开发"等）
6. suggestedTags 是建议的标签列表（不超过5个）
7. 如果原文没有明确的知识点，直接返回 []

输出格式示例：
[
  {
    "title": "React useState Hook 的使用方法",
    "content": "useState 是 React 中最常用的 Hook，用于在函数组件中添加状态。它返回一个数组，包含当前状态值和一个更新函数。",
    "suggestedCategory": "前端开发",
    "suggestedTags": ["React", "Hooks", "JavaScript"],
    "type": "concept"
  }
]`;

/** 默认 User Prompt 模板，{{text}} 为占位符 */
export const EXTRACTION_USER_PROMPT_TEMPLATE = `请从以下文本中提炼知识条目：

---
{{text}}
---

请严格按照 JSON 数组格式输出，不要包含其他说明文字。`;

/** 渲染 User Prompt：将 {{text}} 替换为实际文本 */
export function renderUserPrompt(text: string): string {
  return EXTRACTION_USER_PROMPT_TEMPLATE.replace(/\{\{text\}\}/g, text);
}

/**
 * 为分块文本构建 User Prompt
 * 在文本前附加文档上下文信息
 */
export function renderChunkUserPrompt(
  chunkContent: string,
  docName: string,
  chunkIndex: number,
  totalChunks: number
): string {
  const contextualizedText = `[文档: ${docName}] [第 ${chunkIndex + 1}/${totalChunks} 段]\n\n${chunkContent}`;
  return renderUserPrompt(contextualizedText);
}

// ── 多模态图片理解 ──────────────────────────────────────

export const IMAGE_DESCRIPTION_PROMPT = `请详细描述这张图片的内容。根据图片类型，从以下角度进行分析：

1. 如果是文档/截图：提取所有可见的文字内容
2. 如果是图表/数据图：描述图表类型、数据趋势、关键数值
3. 如果是示意图/架构图：描述结构关系、组件和连接方式
4. 如果是照片：描述场景、对象、人物、动作和环境
5. 如果是 UI 界面：描述布局、功能区域和交互元素

要求：
- 输出纯文本描述，不要使用 markdown 格式
- 描述要完整详细，便于后续知识提取
- 如果有文字内容，尽可能完整地提取出来`;
