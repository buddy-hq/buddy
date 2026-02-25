import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql.js"

/**
 * Buddy-specific curriculum storage.
 *
 * This table lives in buddy.db (NOT opencode.db). It cross-references
 * OpenCode's project.id to associate curriculum content with projects.
 *
 * See SCHEMA.md in the package root for the dual-database architecture.
 */
export const CurriculumTable = sqliteTable("curriculum", {
  project_id: text().primaryKey(),
  markdown: text().notNull(),
  ...Timestamps,
})
