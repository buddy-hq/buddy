import { fetchRecoveryPolicy } from "./recovery-policy-source"
import { parseTNonEmptyString } from "../shared/parse-external"
import { getStore } from "./store"
import {
  findRecoveryTarget,
  parseRecoveryPolicy,
  validateRecoveryTarget,
  type RecoveryTarget,
} from "./recovery-policy-core"

const RECOVERY_STORE_NAME = "buddy.recovery"
const BLOCKED_UPDATE_VERSIONS_KEY = "blockedUpdateVersions"

function readBlockedUpdateVersions(): string[] {
  const value = getStore(RECOVERY_STORE_NAME).get(BLOCKED_UPDATE_VERSIONS_KEY)
  if (!Array.isArray(value)) {
    return []
  }

  const versions: string[] = []
  for (const entry of value) {
    const text = parseTNonEmptyString(entry)
    if (text !== undefined) versions.push(text)
  }
  return versions
}

function blockUpdateVersion(version: string): void {
  const versions = new Set(readBlockedUpdateVersions())
  versions.add(version)
  getStore(RECOVERY_STORE_NAME).set(BLOCKED_UPDATE_VERSIONS_KEY, [...versions].toSorted())
}

function isUpdateVersionBlocked(version: string): boolean {
  return readBlockedUpdateVersions().includes(version)
}

export {
  blockUpdateVersion,
  fetchRecoveryPolicy,
  findRecoveryTarget,
  isUpdateVersionBlocked,
  parseRecoveryPolicy,
  validateRecoveryTarget,
  type RecoveryTarget,
}
