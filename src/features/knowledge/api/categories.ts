import type {
  KnowledgeCategoryDto,
  KnowledgeCategoryFormValues,
} from "@/features/knowledge/types";

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type CategoryListParams = {
  keyword?: string;
};

/** 拉取分类列表。 */
export async function fetchCategories(
  params: CategoryListParams = {}
): Promise<KnowledgeCategoryDto[]> {
  const searchParams = new URLSearchParams();
  if (params.keyword) searchParams.set("keyword", params.keyword);

  const queryString = searchParams.toString();
  return requestJson<KnowledgeCategoryDto[]>(
    `/api/categories${queryString ? `?${queryString}` : ""}`
  );
}

/** 创建分类。 */
export async function createCategory(
  input: KnowledgeCategoryFormValues
): Promise<KnowledgeCategoryDto> {
  return requestJson<KnowledgeCategoryDto>("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** 更新分类。 */
export async function updateCategory(
  id: string,
  input: KnowledgeCategoryFormValues
): Promise<KnowledgeCategoryDto> {
  return requestJson<KnowledgeCategoryDto>(`/api/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** 删除分类。 */
export async function deleteCategory(
  id: string
): Promise<KnowledgeCategoryDto> {
  return requestJson<KnowledgeCategoryDto>(`/api/categories/${id}`, {
    method: "DELETE",
  });
}

/** 统一处理分类 API 的成功和错误响应。 */
async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json()) as ApiResponse<T>;

  if (!json.success) {
    throw new Error(json.error?.message ?? "分类请求失败");
  }

  if (!response.ok) {
    throw new Error("分类请求失败");
  }

  return json.data;
}
