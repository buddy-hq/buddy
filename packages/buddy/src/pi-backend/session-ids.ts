const BUDDY_PI_SESSION_ID_PREFIX = "ses_"

export function buddySessionIDFromPi(sessionID: string): string {
  return sessionID.startsWith(BUDDY_PI_SESSION_ID_PREFIX)
    ? sessionID
    : `${BUDDY_PI_SESSION_ID_PREFIX}${sessionID}`
}

export function piSessionIDFromBuddy(sessionID: string): string {
  return sessionID.startsWith(BUDDY_PI_SESSION_ID_PREFIX)
    ? sessionID.slice(BUDDY_PI_SESSION_ID_PREFIX.length)
    : sessionID
}
