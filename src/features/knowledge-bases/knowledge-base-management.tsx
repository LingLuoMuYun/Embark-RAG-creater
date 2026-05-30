"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Database,
  Plus,
  Search,
  SortAsc,
  SortDesc,
  XCircle,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { fetchRagItems } from "./api";
import { mockRagItems } from "./mock-data";
import {
  DEFAULT_KNOWLEDGE_BASE_FORM_VALUES,
  type KnowledgeBaseFormValues,
  type RagListItem,
  type SortDirection,
  type SortField,
  type StatusFilter,
} from "./types";
import {
  createClientId,
  filterAndSortRagItems,
  getKnowledgeBaseStats,
  normalizeRagItems,
  validateKnowledgeBaseForm,
} from "./utils";

const statusFilterCards: Array<{
  key: Exclude<StatusFilter, null>;
  title: string;
  description: string;
}> = [
  {
    key: "all",
    title: "知识库总量",
    description: "全部知识库",
  },
  {
    key: "active",
    title: "启用知识库",
    description: "当前可用于检索",
  },
  {
    key: "disabled",
    title: "禁用知识库",
    description: "暂不可用于检索",
  },
];

function formatDate(value: string) {
  if (value === "--") return "--";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString();
}

function getStatusText(status: RagListItem["status"]) {
  return status === "active" ? "启用" : "禁用";
}

export function KnowledgeBaseManagement() {
  const didHydrate = useRef(false);
  const items = useAppStore((state) => state.items);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const setItems = useAppStore((state) => state.setItems);
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);
  const addItem = useAppStore((state) => state.addItem);
  const updateItem = useAppStore((state) => state.updateItem);
  const deleteItem = useAppStore((state) => state.deleteItem);

  const [searchInput, setSearchInput] = useState("");
  const [submittedSearchKeyword, setSubmittedSearchKeyword] = useState("");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [formDialogMode, setFormDialogMode] = useState<
    "create" | "edit" | null
  >(null);
  const [editingItem, setEditingItem] = useState<RagListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RagListItem | null>(null);
  const [formValues, setFormValues] = useState<KnowledgeBaseFormValues>(
    DEFAULT_KNOWLEDGE_BASE_FORM_VALUES
  );
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (didHydrate.current) return;

    let ignore = false;
    didHydrate.current = true;

    async function loadRagItems() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchRagItems();

        if (!ignore) {
          setItems(normalizeRagItems(data));
        }
      } catch (loadError) {
        console.warn(
          "Failed to load knowledge bases, fallback to mock data.",
          loadError
        );

        if (!ignore) {
          setItems(mockRagItems);
          setError("知识库数据加载失败，已使用本地模拟数据");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadRagItems();

    return () => {
      ignore = true;
    };
  }, [setError, setItems, setLoading]);

  const stats = useMemo(() => getKnowledgeBaseStats(items), [items]);
  const visibleItems = useMemo(
    () =>
      filterAndSortRagItems({
        items,
        keyword: submittedSearchKeyword,
        statusFilter,
        sortField,
        sortDirection,
      }),
    [items, sortDirection, sortField, statusFilter, submittedSearchKeyword]
  );

  function toggleStatusFilter(nextFilter: Exclude<StatusFilter, null>) {
    setStatusFilter((current) => (current === nextFilter ? null : nextFilter));
  }

  function openCreateDialog() {
    setFormDialogMode("create");
    setEditingItem(null);
    setFormValues(DEFAULT_KNOWLEDGE_BASE_FORM_VALUES);
    setFormError(null);
  }

  function openEditDialog(item: RagListItem) {
    setFormDialogMode("edit");
    setEditingItem(item);
    setFormValues({
      name: item.name,
      description: item.description,
      topK: item.topK,
      chunkSize: item.chunkSize,
      similarityThreshold: item.similarityThreshold,
      status: item.status,
    });
    setFormError(null);
  }

  function closeFormDialog() {
    setFormDialogMode(null);
    setEditingItem(null);
    setFormError(null);
  }

  function updateFormValue<K extends keyof KnowledgeBaseFormValues>(
    key: K,
    value: KnowledgeBaseFormValues[K]
  ) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function saveForm() {
    const validationError = validateKnowledgeBaseForm({
      values: formValues,
      items,
      editingId: editingItem?.id ?? null,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const now = new Date().toISOString();

    if (formDialogMode === "create") {
      addItem({
        id: createClientId(),
        name: formValues.name.trim(),
        description: formValues.description.trim() || "暂无描述",
        documentCount: 0,
        chunkCount: 0,
        topK: formValues.topK,
        chunkSize: formValues.chunkSize,
        similarityThreshold: formValues.similarityThreshold,
        status: formValues.status,
        updatedAt: now,
      });
    }

    if (formDialogMode === "edit" && editingItem) {
      updateItem(editingItem.id, {
        name: formValues.name.trim(),
        description: formValues.description.trim() || "暂无描述",
        topK: formValues.topK,
        chunkSize: formValues.chunkSize,
        similarityThreshold: formValues.similarityThreshold,
        status: formValues.status,
        updatedAt: now,
      });
    }

    closeFormDialog();
  }

  function confirmDelete() {
    if (!deleteTarget) return;

    deleteItem(deleteTarget.id);
    setDeleteTarget(null);
  }

  const isCreateMode = formDialogMode === "create";

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database />
            RAG 知识库
          </CardTitle>
          <CardDescription>
            管理知识库基础信息、检索参数和启用状态。
          </CardDescription>
        </CardHeader>
      </Card>

      {error ? (
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {statusFilterCards.map((card) => {
          const value =
            card.key === "all"
              ? stats.total
              : card.key === "active"
              ? stats.active
              : stats.disabled;
          const Icon =
            card.key === "active"
              ? CheckCircle2
              : card.key === "disabled"
              ? XCircle
              : Database;

          return (
            <Card
              key={card.key}
              className={cn(
                "cursor-pointer transition-colors",
                statusFilter === card.key && "ring-primary"
              )}
              role="button"
              tabIndex={0}
              onClick={() => toggleStatusFilter(card.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleStatusFilter(card.key);
                }
              }}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon />
                  {card.title}
                </CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-0">
          <div className="relative min-w-72 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={searchInput}
              placeholder="搜索知识库名称或描述"
              onChange={(event) => {
                const value = event.target.value;
                setSearchInput(value);

                if (!value) {
                  setSubmittedSearchKeyword("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSubmittedSearchKeyword(searchInput.trim());
                }
              }}
            />
          </div>

          <Select
            value={sortField}
            onValueChange={(value) => setSortField(value as SortField)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="updatedAt">更新时间</SelectItem>
                <SelectItem value="documentCount">包含文档数量</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSortDirection((current) =>
                current === "desc" ? "asc" : "desc"
              )
            }
          >
            {sortDirection === "desc" ? (
              <SortDesc data-icon="inline-start" />
            ) : (
              <SortAsc data-icon="inline-start" />
            )}
            排序倒置
          </Button>

          <Button type="button" onClick={openCreateDialog}>
            <Plus data-icon="inline-start" />
            新建知识库
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            正在加载知识库...
          </CardContent>
        </Card>
      ) : null}

      {!loading && items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Database className="size-8 text-muted-foreground" />
            <div className="font-medium">暂无知识库</div>
            <p className="text-sm text-muted-foreground">
              点击新建按钮创建你的第一个知识库
            </p>
            <Button type="button" onClick={openCreateDialog}>
              <Plus data-icon="inline-start" />
              新建知识库
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && items.length > 0 && visibleItems.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            没有找到符合条件的知识库
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {visibleItems.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Database />
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{item.name}</span>
                  <CardDescription className="mt-1 line-clamp-2">
                    {item.description}
                  </CardDescription>
                </span>
              </CardTitle>
              <CardAction>
                <Badge
                  variant={
                    item.status === "active" ? "secondary" : "destructive"
                  }
                >
                  {getStatusText(item.status)}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 text-sm md:grid-cols-4">
                <div>文档：{item.documentCount}</div>
                <div>Chunks：{item.chunkCount}</div>
                <div>TopK：{item.topK}</div>
                <div>阈值：{item.similarityThreshold}</div>
              </div>
            </CardContent>
            <CardFooter className="justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                更新时间：{formatDate(item.updatedAt)}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(item)}
                >
                  编辑
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteTarget(item)}
                >
                  删除
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog
        open={Boolean(formDialogMode)}
        onOpenChange={(open) => {
          if (!open) closeFormDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isCreateMode ? "新建知识库" : "编辑知识库"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kb-name">知识库名称</Label>
              <Input
                id="kb-name"
                value={formValues.name}
                aria-invalid={Boolean(formError && !formValues.name.trim())}
                onChange={(event) =>
                  updateFormValue("name", event.target.value)
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kb-description">知识库描述</Label>
              <Textarea
                id="kb-description"
                value={formValues.description}
                onChange={(event) =>
                  updateFormValue("description", event.target.value)
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kb-topk">TopK</Label>
                <Input
                  id="kb-topk"
                  type="number"
                  min={1}
                  value={formValues.topK}
                  onChange={(event) =>
                    updateFormValue("topK", Number(event.target.value))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kb-chunk-size">分片大小</Label>
                <Input
                  id="kb-chunk-size"
                  type="number"
                  min={1}
                  value={formValues.chunkSize}
                  onChange={(event) =>
                    updateFormValue("chunkSize", Number(event.target.value))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kb-threshold">相似度阈值</Label>
                <Input
                  id="kb-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={formValues.similarityThreshold}
                  onChange={(event) =>
                    updateFormValue(
                      "similarityThreshold",
                      Number(event.target.value)
                    )
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="kb-status">启用状态</Label>
                <span className="text-xs text-muted-foreground">
                  开启后该知识库可用于后续检索。
                </span>
              </div>
              <Switch
                id="kb-status"
                checked={formValues.status === "active"}
                onCheckedChange={(checked) =>
                  updateFormValue("status", checked ? "active" : "disabled")
                }
              />
            </div>
          </div>

          {formError ? (
            <p className="text-xs text-destructive">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeFormDialog}>
              取消
            </Button>
            <Button type="button" onClick={saveForm}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除知识库</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
