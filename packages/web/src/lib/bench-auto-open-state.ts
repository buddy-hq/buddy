import type { BenchAutoOpenPolicyID } from "./bench-navigation"

const suppressedBenchAutoOpenKeyByDirectoryAndPolicy = new Map<string, string>()

function stateKey(directory: string, policyID: BenchAutoOpenPolicyID): string {
  return `${directory}:${policyID}`
}

export function suppressBenchAutoOpen(
  directory: string,
  policyID: BenchAutoOpenPolicyID,
  key: string | undefined,
) {
  if (!directory || !key) return
  suppressedBenchAutoOpenKeyByDirectoryAndPolicy.set(stateKey(directory, policyID), key)
}

export function readSuppressedBenchAutoOpenKey(
  directory: string,
  policyID: BenchAutoOpenPolicyID,
): string | undefined {
  return suppressedBenchAutoOpenKeyByDirectoryAndPolicy.get(stateKey(directory, policyID))
}

export function clearSuppressedBenchAutoOpen(directory: string, policyID: BenchAutoOpenPolicyID) {
  if (!directory) return
  suppressedBenchAutoOpenKeyByDirectoryAndPolicy.delete(stateKey(directory, policyID))
}
