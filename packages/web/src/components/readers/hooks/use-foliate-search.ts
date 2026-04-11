import { useState, useRef } from "react"
import type { ReaderSearchState, ReaderSearchRow } from "../foliate-reader-types"
import {
  SEARCH_SCOPE_BOOK,
  SEARCH_SCOPE_SECTION,
  SEARCH_RESULT_KEY_PREFIX,
  SEARCH_SECTION_KEY_PREFIX,
} from "../foliate-reader-constants"
import type { View as FoliateView } from "foliate-js/view.js"

export interface UseFoliateSearchReturn {
  searchState: ReaderSearchState
  setSearchState: React.Dispatch<React.SetStateAction<ReaderSearchState>>
  searchInputRef: React.RefObject<HTMLInputElement>
  searchRunIdRef: React.MutableRefObject<number>
  searchGeneratorRef: React.MutableRefObject<AsyncGenerator<any> | null>
  runSearch: (nextQuery?: string) => Promise<void>
  resetSearch: (view?: FoliateView | null) => Promise<void>
}

export function useFoliateSearch(
  viewRef: React.MutableRefObject<FoliateView | null>,
  setSidebarTab: React.Dispatch<React.SetStateAction<string>>,
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>,
  locationRef: React.MutableRefObject<any>,
): UseFoliateSearchReturn {
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchRunIdRef = useRef(0)
  const searchGeneratorRef = useRef<AsyncGenerator<any> | null>(null)

  const [searchState, setSearchState] = useState<ReaderSearchState>({
    query: "",
    scope: SEARCH_SCOPE_BOOK,
    matchCase: false,
    matchWholeWords: false,
    matchDiacritics: false,
    running: false,
    progress: null,
    rows: [],
  })

  const resetSearch = async (view: FoliateView | null = viewRef.current) => {
    const generator = searchGeneratorRef.current
    if (generator) {
      await generator.return?.(undefined)
    }
    searchGeneratorRef.current = null
    view?.clearSearch()
    setSearchState((current) => ({
      ...current,
      running: false,
      progress: null,
      rows: current.query.trim().length === 0 ? [] : current.rows,
    }))
  }

  const runSearch = async (nextQuery?: string) => {
    const view = viewRef.current
    if (!view) return

    const query = (nextQuery ?? searchState.query).trim()
    await resetSearch(view)

    if (!query) {
      setSearchState((current) => ({
        ...current,
        query,
        running: false,
        progress: null,
        rows: [],
        activeResultCfi: undefined,
      }))
      return
    }

    const runId = searchRunIdRef.current + 1
    searchRunIdRef.current = runId
    setSidebarTab("search")
    setSidebarOpen(true)
    setSearchState((current) => ({
      ...current,
      query,
      running: true,
      progress: null,
      rows: [],
      activeResultCfi: undefined,
    }))

    const generator = view.search({
      query,
      matchCase: searchState.matchCase,
      matchWholeWords: searchState.matchWholeWords,
      matchDiacritics: searchState.matchDiacritics,
      index: searchState.scope === SEARCH_SCOPE_SECTION ? locationRef.current.index : null,
    })
    searchGeneratorRef.current = generator

    const rows: ReaderSearchRow[] = []
    for await (const result of generator) {
      if (runId !== searchRunIdRef.current) return
      if (result === "done") {
        setSearchState((current) => ({
          ...current,
          running: false,
          progress: null,
          rows,
          activeResultCfi: rows.find((row) => row.kind === "result")?.cfi,
        }))
        return
      }
      if ("progress" in result) {
        setSearchState((current) => ({ ...current, progress: result.progress }))
        continue
      }
      if ("subitems" in result) {
        rows.push({
          key: `${SEARCH_SECTION_KEY_PREFIX}${rows.length}`,
          kind: "section",
          label: result.label ?? "Section",
        })
        for (const item of result.subitems) {
          rows.push({
            key: `${SEARCH_RESULT_KEY_PREFIX}${item.cfi}`,
            kind: "result",
            cfi: item.cfi,
            excerpt: item.excerpt,
          })
        }
      } else {
        rows.push({
          key: `${SEARCH_RESULT_KEY_PREFIX}${result.cfi}`,
          kind: "result",
          cfi: result.cfi,
          excerpt: result.excerpt,
        })
      }
      setSearchState((current) => ({
        ...current,
        rows: [...rows],
        progress: current.running ? current.progress : null,
      }))
    }
  }

  return {
    searchState,
    setSearchState,
    searchInputRef,
    searchRunIdRef,
    searchGeneratorRef,
    runSearch,
    resetSearch,
  }
}
