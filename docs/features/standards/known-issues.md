# Standards Known Issues

## Verified Uninstall Behavior & External Database Caveat

Turning the Standards toggle off removes the packaged Standards install directory and its bundled SQLite database.

**Caveat:** If a developer configures Buddy with an external knowledge graph database path outside the default packaged install location, Buddy clears its internal reference upon uninstall but does not delete that external database file.

## Install and Removal Progress Is Not Surfaced Well

The backend tracks progress percent and progress messages for Standards download, install, repair, and removal work, but the current desktop UI does not stream that progress clearly while the request is in flight.

**What the user sees today:**
- The toggle becomes busy or disabled.
- The operation can look hung for a while.
- The final state shows up only after the request completes.

**Why this is a problem:**
- Large downloads feel frozen.
- Slow Windows machines make the gap much more obvious.
- Removal and repair have the same visibility issue.

## Unbounded SQL rawRows Materialization (L08-C06)

`KnowledgeGraphService.runSqlQuery` allows statements beginning with `select`, `with`, `pragma`, or `explain` and calls SQLite `this.connection().prepare(sql).all()` synchronously. Slicing to `rowLimit` occurs in JavaScript only after the complete `rawRows` array is resident in memory.

**Impact:** Queries producing massive result sets, Cartesian joins, or expensive recursive CTEs can block the backend event loop and cause memory spikes before the slice is reached.

**Recommended fix:** Enforce an engine-level SQL `LIMIT` or statement execution/memory budget before materializing rows.

**Affected code:**
- `packages/buddy/src/learning/features/standards/service.ts`
- `packages/buddy/src/learning/features/standards/tools/query-standards-sql.ts`
