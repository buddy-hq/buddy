import { Database } from "#sqlite"
import fs from "node:fs/promises"
import { parseLearnerMemoryRegistryMarkdown } from "./memory-registry-markdown"
import { LearnerMemoryPath } from "./paths"
import { listLearnerEventRecords } from "./evidence"
import { LEARNER_MEMORY_STAGE_ONE_TUNING } from "./tuning"

const INDEX_SCHEMA = `
CREATE TABLE IF NOT EXISTS memory_index (
  memory_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  teaching_kind TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  pinned INTEGER NOT NULL,
  project_path TEXT,
  strength REAL NOT NULL,
  confidence REAL NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_index (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  session_id TEXT,
  project_path TEXT,
  path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_index_type_status ON memory_index(type, status);
CREATE INDEX IF NOT EXISTS idx_memory_index_project_path ON memory_index(project_path);
CREATE INDEX IF NOT EXISTS idx_event_index_type_created_at ON event_index(type, created_at);
`

function openLearnerIndexDatabase(directory: string): Database {
  const db = new Database(LearnerMemoryPath.indexFile(directory), { create: true })
  db.exec(`PRAGMA busy_timeout = ${LEARNER_MEMORY_STAGE_ONE_TUNING.jobLedgerBusyTimeoutMs}`)
  db.exec("DROP TABLE IF EXISTS memory_index")
  db.exec("DROP TABLE IF EXISTS event_index")
  db.exec(INDEX_SCHEMA)
  return db
}

async function rebuildLearnerMemoryIndex(directory: string): Promise<{
  indexPath: string
  memoryCount: number
  eventCount: number
}> {
  await fs.mkdir(LearnerMemoryPath.root(directory), { recursive: true })
  const [memories, eventRecords] = await Promise.all([
    listLearnerMemoryRecords(directory),
    listLearnerEventRecords(directory),
  ])
  const db = openLearnerIndexDatabase(directory)

  try {
    db.exec("BEGIN")
    db.exec("DELETE FROM memory_index")
    db.exec("DELETE FROM event_index")

    const insertMemory = db.prepare(
      `INSERT INTO memory_index (
        memory_id,
        title,
        memory_type,
        teaching_kind,
        type,
        status,
        pinned,
        project_path,
        strength,
        confidence,
        updated_at,
        last_used_at,
        path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const memory of memories) {
      insertMemory.run(
        memory.id,
        memory.title,
        memory.memoryType,
        memory.pedagogyKind,
        memory.type,
        memory.status,
        memory.pinned ? 1 : 0,
        memory.projectPath ?? null,
        memory.strength,
        memory.confidence,
        memory.updatedAt,
        memory.lastUsedAt ?? null,
        LearnerMemoryPath.workingMemoryFile(directory),
      )
    }

    const insertEvent = db.prepare(
      `INSERT INTO event_index (
        event_id,
        type,
        created_at,
        session_id,
        project_path,
        path
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const record of eventRecords) {
      insertEvent.run(
        record.event.id,
        record.event.type,
        record.event.createdAt,
        record.event.sessionId ?? null,
        record.event.projectPath ?? null,
        record.path,
      )
    }

    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }

  return {
    indexPath: LearnerMemoryPath.indexFile(directory),
    memoryCount: memories.length,
    eventCount: eventRecords.length,
  }
}

async function listLearnerMemoryRecords(directory: string) {
  const markdown = await fs
    .readFile(LearnerMemoryPath.workingMemoryFile(directory), "utf8")
    .catch(() => "")
  return parseLearnerMemoryRegistryMarkdown(markdown)
}

export { openLearnerIndexDatabase, rebuildLearnerMemoryIndex }
