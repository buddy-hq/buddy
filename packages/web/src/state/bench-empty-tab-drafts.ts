import { create } from "zustand"
import type { NotebookSearchFilter } from "@/state/notebook-search"

/** What a New tab's search page holds while the user is away from it. */
export type BenchEmptyTabDraft = {
  query: string
  filter: NotebookSearchFilter
  selectedIdentity: string | undefined
}

type BenchEmptyTabDraftsState = {
  drafts: Readonly<Record<string, BenchEmptyTabDraft>>
  setDraft: (emptyTabID: string, draft: BenchEmptyTabDraft) => void
  removeDraft: (emptyTabID: string) => void
}

/** Session-only: New tab ids are unique, and a restart may drop what was typed. */
export const useBenchEmptyTabDrafts = create<BenchEmptyTabDraftsState>()((set) => ({
  drafts: {},
  setDraft: (emptyTabID, draft) =>
    set((state) => ({ drafts: { ...state.drafts, [emptyTabID]: draft } })),
  removeDraft: (emptyTabID) =>
    set((state) => {
      if (!(emptyTabID in state.drafts)) return {}
      const { [emptyTabID]: _removed, ...drafts } = state.drafts
      return { drafts }
    }),
}))
