import type { AppSlice } from "./slices/app-slice";
import type { DocumentSlice } from "./slices/document-slice";
import type { KnowledgeBaseSlice } from "./slices/knowledge-base-slice";

export type StoreState = AppSlice & DocumentSlice & KnowledgeBaseSlice;
