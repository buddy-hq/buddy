export const BUDDY_DEV_APP_NAME = "Buddy Dev"
export const BUDDY_DEV_INSTANCE_NAME_ENV = "BUDDY_DEV_INSTANCE_NAME"

export function formatBuddyDevAppName(instanceName: string | undefined): string {
  const normalizedInstanceName = instanceName?.trim()
  return normalizedInstanceName
    ? `${BUDDY_DEV_APP_NAME} — ${normalizedInstanceName}`
    : BUDDY_DEV_APP_NAME
}
