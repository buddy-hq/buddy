import { BENCH_AUTO_OPEN_POLICY_WHITEBOARD } from "@/lib/bench-navigation"
import {
  clearSuppressedBenchAutoOpen,
  readSuppressedBenchAutoOpenKey,
  suppressBenchAutoOpen,
} from "@/lib/bench-auto-open-state"

function suppressWhiteboardAutoOpen(directory: string, toolKey: string | undefined) {
  suppressBenchAutoOpen(directory, BENCH_AUTO_OPEN_POLICY_WHITEBOARD, toolKey)
}

function readSuppressedWhiteboardAutoOpenKey(directory: string) {
  return readSuppressedBenchAutoOpenKey(directory, BENCH_AUTO_OPEN_POLICY_WHITEBOARD)
}

function clearSuppressedWhiteboardAutoOpen(directory: string) {
  clearSuppressedBenchAutoOpen(directory, BENCH_AUTO_OPEN_POLICY_WHITEBOARD)
}

export {
  clearSuppressedWhiteboardAutoOpen,
  readSuppressedWhiteboardAutoOpenKey,
  suppressWhiteboardAutoOpen,
}
