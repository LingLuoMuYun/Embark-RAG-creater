import type { StateCreator } from "zustand";

import type { StoreState } from "../types";

export type KnowledgeBaseSummary = {
  id: string;
  name: string;
  description: string | null;
  entryCount: number;
  updatedAt: string;
};

export type KnowledgeBaseSlice = {
  knowledgeBases: KnowledgeBaseSummary[];
  selectedKnowledgeBaseId: string | null;
  isKnowledgeBaseLoading: boolean;
  knowledgeBaseError: string | null;
  setKnowledgeBases: (knowledgeBases: KnowledgeBaseSummary[]) => void;
  selectKnowledgeBase: (knowledgeBaseId: string | null) => void;
  setKnowledgeBaseLoading: (loading: boolean) => void;
  setKnowledgeBaseError: (error: string | null) => void;
};

export const createKnowledgeBaseSlice: StateCreator<
  StoreState,
  [],
  [],
  KnowledgeBaseSlice
> = (set) => ({
  knowledgeBases: [],
  selectedKnowledgeBaseId: null,
  isKnowledgeBaseLoading: false,
  knowledgeBaseError: null,
  setKnowledgeBases: (knowledgeBases) => set({ knowledgeBases }),
  selectKnowledgeBase: (knowledgeBaseId) =>
    set({ selectedKnowledgeBaseId: knowledgeBaseId }),
  setKnowledgeBaseLoading: (loading) =>
    set({ isKnowledgeBaseLoading: loading }),
  setKnowledgeBaseError: (error) => set({ knowledgeBaseError: error }),
});
