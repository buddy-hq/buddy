import { BENCH_AUTO_OPEN_POLICY_WHITEBOARD } from "@/components/bench/bench-open-policy"
import {
  clearSuppressedBenchAutoOpen,
  readSuppressedBenchAutoOpenKey,
  suppressBenchAutoOpen,
} from "@/components/bench/bench-auto-open-state"

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
