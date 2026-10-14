import type { JsonValue, SessionInfo } from "@opencode/client"
import type { Session, SessionCreate, SessionStatus } from "@buddy/transcript-contract/session"
import { createForkedSessionTitle } from "@buddy/transcript-contract/session-title"
import type { SessionClient } from "./client"
import { Schema } from "effect"
import { parseFiniteNumber } from "@buddy/transcript-contract/parse-external"

const ArchivedAt = "buddy.archivedAt"

function upstreamJson(value: typeof Schema.Json.Type): JsonValue {
  if (value === null || Schema.is(Schema.String)(value) || Schema.is(Schema.Boolean)(value) || Schema.is(Schema.Number)(value)) return value
  if (Array.isArray(value)) return value.map(upstreamJson)
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, upstreamJson(nested)]))
}

export function toBuddySession(session: SessionInfo): Session {
  const archived = session.metadata?.[ArchivedAt]
  return {
    id: session.id,
    projectID: session.projectID,
    directory: session.location.directory,
    title: session.title ?? "New chat",
    parentID: session.parentID,
    metadata: session.metadata ? structuredClone(session.metadata) : undefined,
    time: {
      created: session.time.created,
      updated: session.time.updated,
      archived: session.time.archived ?? parseFiniteNumber(archived),
    },
    revert: session.revert ? { messageID: session.revert.messageID, partID: session.revert.partID, snapshot: session.revert.snapshot } : undefined,
  }
}

export function isSessionArchived(session: SessionInfo): boolean {
  return toBuddySession(session).time.archived !== undefined
}

export async function getSession(client: SessionClient, sessionID: string): Promise<Session> {
  return toBuddySession(await client.session.get({ sessionID }))
}

export async function listSessions(client: SessionClient, input: {
  readonly directory: string
  readonly project?: string
  readonly roots?: boolean
  readonly parentID?: string
  readonly search?: string
  readonly start?: number
  readonly limit?: number
  readonly ownsSession?: (session: Session) => Promise<boolean>
}): Promise<Session[]> {
  const sessions: Session[] = []
  let cursor: string | undefined
  do {
    const page = await client.session.list({
      directory: input.project ? undefined : input.directory,
      project: input.project,
      parentID: input.roots ? null : input.parentID,
      search: input.search,
      limit: input.limit && !input.ownsSession ? Math.min(200, input.limit) : 200,
      cursor,
    })
    for (const native of page.data) {
      if (input.start !== undefined && native.time.updated < input.start) continue
      const session = toBuddySession(native)
      if (input.ownsSession && !await input.ownsSession(session)) continue
      sessions.push(session)
    }
    cursor = page.cursor.next ?? undefined
    if (input.limit && sessions.length >= input.limit) break
  } while (cursor)
  return input.limit ? sessions.slice(0, input.limit) : sessions
}

export async function createSession(client: SessionClient, directory: string, input: SessionCreate = {}): Promise<Session> {
  const model = input.model
  return toBuddySession(await client.session.create({
    id: input.id,
    parentID: input.parentID,
    title: input.title,
    agent: input.agent,
    model: model ? { id: model.modelID, providerID: model.providerID, variant: model.variant } : undefined,
    metadata: input.metadata ? Object.fromEntries(Object.entries(input.metadata).map(([key, value]) => [key, upstreamJson(value)])) : undefined,
    location: { directory },
  }))
}

export async function updateSession(client: SessionClient, sessionID: string, input: { readonly title?: string; readonly time?: { readonly archived?: number } }): Promise<Session> {
  const current = await client.session.get({ sessionID })
  const metadata = { ...current.metadata }
  if (input.title !== undefined) delete metadata["buddy.forkTitle"]
  if (input.time?.archived !== undefined) metadata[ArchivedAt] = input.time.archived
  await client.session.update({ sessionID, title: input.title, metadata })
  return getSession(client, sessionID)
}

export async function deleteSession(client: SessionClient, sessionID: string): Promise<boolean> {
  await client.session.remove({ sessionID })
  return true
}

export async function children(client: SessionClient, sessionID: string): Promise<Session[]> {
  const sessions: Session[] = []
  let cursor: string | undefined
  do {
    const page = await client.session.list({ parentID: sessionID, limit: 200, cursor })
    sessions.push(...page.data.map(toBuddySession))
    cursor = page.cursor.next ?? undefined
  } while (cursor)
  return sessions
}

export async function forkSession(client: SessionClient, sessionID: string, messageID?: string): Promise<Session> {
  const source = await client.session.get({ sessionID })
  const fork = await client.session.fork({ sessionID, before: messageID })
  const title = createForkedSessionTitle({ title: source.title ?? "New chat", metadata: source.metadata })
  await client.session.update({ sessionID: fork.id, title: title.title, metadata: { ...fork.metadata, ...title.metadata } })
  return getSession(client, fork.id)
}

export async function revertSession(client: SessionClient, sessionID: string, messageID: string): Promise<Session> {
  await client.session.revert.stage({ sessionID, messageID })
  return getSession(client, sessionID)
}

export async function unrevertSession(client: SessionClient, sessionID: string): Promise<Session> {
  await client.session.revert.clear({ sessionID })
  return getSession(client, sessionID)
}

export async function interruptSession(client: SessionClient, sessionID: string): Promise<boolean> {
  return (await client.session.interrupt({ sessionID })).interrupted
}

export async function backgroundSession(client: SessionClient, sessionID: string): Promise<void> {
  await client.session.background({ sessionID })
}

export async function sessionStatuses(client: SessionClient): Promise<Record<string, SessionStatus>> {
  const active = await client.session.active()
  return Object.fromEntries(Object.keys(active).map((id) => [id, { type: "busy" } as const]))
}
