/**
 * 知识组织模块共享类型，隔离前端组件和后端接口的稳定数据结构。
 */

/** 分类接口返回给前端使用的数据结构。 */
export type KnowledgeCategoryDto = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** 分类创建和编辑表单提交的数据结构。 */
export type KnowledgeCategoryFormValues = {
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
};

/** 标签接口返回给前端使用的数据结构。 */
export type KnowledgeTagDto = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** 标签创建表单提交的数据结构。 */
export type KnowledgeTagFormValues = {
  name: string;
  color?: string | null;
  sortOrder?: number;
};

/** 知识列表可筛选的状态枚举。 */
export type KnowledgeStatusFilter = "available" | "pending" | "disabled";

/** 知识列表筛选栏统一使用的受控值结构。 */
export type KnowledgeFilterValue = {
  categoryId?: string;
  tagIds: string[];
  status?: KnowledgeStatusFilter;
};
