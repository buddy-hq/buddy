const CHAT_LINK_PROTOCOLS: ReadonlySet<string> = new Set(["buddy:", "buddy-beta:"])

/** Recognize persisted chat links from either separately installed Buddy distribution. */
export function readChatMessageLink(
  href: string,
): { sessionID: string; messageID: string } | undefined {
  try {
    const url = new URL(href)
    if (!CHAT_LINK_PROTOCOLS.has(url.protocol) || url.hostname !== "chat") return undefined
    const sessionID = decodeURIComponent(url.pathname.replace(/^\//u, ""))
    const messageID = url.searchParams.get("message")
    return sessionID && messageID ? { sessionID, messageID } : undefined
  } catch {
    return undefined
  }
}

/** Keep generated application links out of note previews without changing saved Markdown. */
export function withoutBuddyMarkdownLinks(markdown: string): string {
  return markdown.replace(/\[[^\]]*\]\(([^)]*)\)/gu, (match, href: string) => {
    const protocol = href.slice(0, href.indexOf(":") + 1)
    return CHAT_LINK_PROTOCOLS.has(protocol.toLowerCase()) && href.startsWith(`${protocol}//`)
      ? ""
      : match
  })
}
