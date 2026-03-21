import os from 'node:os'
import path from 'node:path'

export const BUDDY_APP_NAME = 'buddy'
export const BUDDY_HOME_DIRECTORY_NAME = '.buddy'

export function resolveConfiguredPath(value: string | undefined): string | undefined {
  const configured = value?.trim()
  if (!configured || configured === 'undefined') {
    return undefined
  }
  try {
    return path.resolve(decodeURIComponent(configured))
  } catch {
    return path.resolve(configured)
  }
}

export function resolveBuddyHomeDirectory() {
  return resolveConfiguredPath(process.env.BUDDY_TEST_HOME) ?? os.homedir()
}

export function resolveDefaultBuddyGlobalConfigDir() {
  return path.join(resolveBuddyHomeDirectory(), BUDDY_HOME_DIRECTORY_NAME)
}
