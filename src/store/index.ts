"use client";
import { create } from "zustand";
import { createAppSlice } from "./slices/app-slice";
import { createKnowledgeBaseSlice } from "./slices/knowledge-base-slice";
import type { StoreState } from "./types";

export const useAppStore = create<StoreState>()((...args) => ({
  ...createAppSlice(...args),
  ...createKnowledgeBaseSlice(...args),
}));
