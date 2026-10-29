# Dynamic tools: retired v1 session-liveness patch

During the OpenCode v1.16.2 integration, dynamic tool loading could update stored permissions while an active model loop continued to use an older in-memory session. A tool could therefore appear loaded but remain unavailable on the next step.

The v1 adapter worked around this with an identity-stable session cache in `session-live.ts`, installed by the old Buddy runtime bootstrap. Both the patch and that bootstrap were removed during the v2 migration.

This note records v1 history. It does not describe the current adapter or provide v2 troubleshooting instructions.
