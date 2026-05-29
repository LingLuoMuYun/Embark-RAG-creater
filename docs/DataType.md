# 数据库结构

- ## rag 相关数据表共有三张
- 知识库表：`KnowledgeBase`包含数据库的基本信息，id，描述等信息

  ```
  type KnowledgeBase = {
  id: string;                 //主键UUID
  name: string;             // 知识库名称
  description: string;     // 知识库描述
  icon: string;             // 图标
  chunkSize:number;        //切片尺寸
  status: "active" | "disabled"; // 是否启用
  similarityThreshold:number ;   //相似度阈值
  chunkOverlap:number;              //重叠阈值
  topK:number;                    //召回数量
  createdAt: Date;            //创建时间
  updatedAt: Date;            //更新时间
  };
  ```

- 源数据表: `KnowledgeDocument`,包含知识库的源数据信息、归属等

```
type KnowledgeDocument = {
  id: string;               //UUID 主键
  knowledgeBaseId: string;  // 所属知识库
  title: string;            // 文档标题
  sourceType: "manual" | "file" | "url" | "text";
  fileName: string;        // 文件名
  fileUrl: string;         // 文件路径或 URL
  mimeType: string;        // 当前只支持md
  fileSize: number;        // 文件大小
  rawContent: string;      // 解析后的原始文本
  status: "active" | "disabled";
  error:string;              //错误信息
  createdAt: Date;              //创建时间
  updatedAt: Date;            //修改时间
};
```

- 数据切片表：`KnowledgeChunk`,包含处理后的 chunks 信息

```
type KnowledgeChunk = {
  id: string;               //UUID主键
  knowledgeBaseId: string;  // 所属知识库
  documentId: string;       // 来源文档
  content: string;          // chunk 正文
  chunkIndex: number;       // 在原文中的顺序
  embedding: string;       // 向量
  status: "active" | "disabled"; //状态
  startIndex:number;       //开始位置
  endIndex:number;          //结束位置
  createdAt: Date;          //创建时间
  updatedAt: Date;          //修改时间
};
```

## 其他数据结构待补充
