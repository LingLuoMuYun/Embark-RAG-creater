export type KnowledgeCategoryDto = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeCategoryFormValues = {
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
};
