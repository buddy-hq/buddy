# Standards Known Issues

## Verified uninstall behavior

Turning the Standards toggle off removes the installed Standards runtime directory.

In the default packaged flow, that includes the bundled SQLite database that ships inside the Standards install root, so the normal toggle-off path does remove the installed database.

One caveat remains:

- if a developer points Buddy at an external knowledge graph database path outside the packaged Standards install location, Buddy clears its own reference but does not try to delete that external database file

## Install and removal progress is not surfaced well

The backend tracks progress percent and progress messages for Standards download, install, repair, and removal work, but the current desktop UI does not stream that progress clearly while the request is in flight.

What the user sees today:

- the toggle becomes busy or disabled
- the operation can look hung for a while
- the final state shows up only after the request completes

Why this is a problem:

- large downloads feel frozen
- slow Windows machines make the gap much more obvious
- removal and repair have the same visibility issue
