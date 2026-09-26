import { useEffect, useRef } from "react"
import { registerCitationNavigationHandler, type CitationNavigationHandler } from "./navigation"

export function useCitationNavigationHandler(handler: CitationNavigationHandler): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => registerCitationNavigationHandler((citation) => handlerRef.current(citation)), [])
}
