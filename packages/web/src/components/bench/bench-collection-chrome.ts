import { createContext, useContext } from "react"

/** True under Bench collection chrome, whose header already names the item and carries its file actions. */
export const BenchCollectionChromeContext = createContext(false)

export function useInBenchCollectionChrome(): boolean {
  return useContext(BenchCollectionChromeContext)
}
