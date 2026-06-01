import type { StateCreator } from "zustand";
import type { StoreState } from "../types";

export interface ExtractionSlice {
  candidates: CandidateSummary[];
  isCandidatesLoading: boolean;
  candidatesError: string | null;
  isExtracting: boolean;
  extractionError: string | null;
  lastExtractionResult: ExtractionResult | null;
  isConfirming: boolean;
  setCandidates: (candidates: CandidateSummary[]) => void;
  setCandidatesLoading: (loading: boolean) => void;
  setCandidatesError: (error: string | null) => void;
  setIsExtracting: (extracting: boolean) => void;
  setExtractionError: (error: string | null) => void;
  setLastExtractionResult: (result: ExtractionResult | null) => void;
  setIsConfirming: (confirming: boolean) => void;
  removeCandidate: (id: string) => void;
  updateCandidate: (id: string, updates: Partial<CandidateSummary>) => void;
}

export interface CandidateSummary {
  id: string;
  title: string;
  content: string;
  suggested_category: string | null;
  suggested_tags: string[];
  type: string;
  status: string;
  documentSourceId: string | null;
  created_at: string;
}

export interface ExtractionResult {
  documentId: string;
  documentName: string;
  totalChunks: number;
  dedupedCandidateCount: number;
  rawCandidateCount: number;
  candidates: CandidateSummary[];
}

export const createExtractionSlice: StateCreator<
  StoreState,
  [],
  [],
  ExtractionSlice
> = (set) => ({
  candidates: [],
  isCandidatesLoading: false,
  candidatesError: null,
  isExtracting: false,
  extractionError: null,
  lastExtractionResult: null,
  isConfirming: false,
  setCandidates: (candidates) => set({ candidates }),
  setCandidatesLoading: (loading) => set({ isCandidatesLoading: loading }),
  setCandidatesError: (error) => set({ candidatesError: error }),
  setIsExtracting: (extracting) => set({ isExtracting: extracting }),
  setExtractionError: (error) => set({ extractionError: error }),
  setLastExtractionResult: (result) => set({ lastExtractionResult: result }),
  setIsConfirming: (confirming) => set({ isConfirming: confirming }),
  removeCandidate: (id) =>
    set((state) => ({
      candidates: state.candidates.filter((c) => c.id !== id),
    })),
  updateCandidate: (id, updates) =>
    set((state) => ({
      candidates: state.candidates.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
});
