import { spawn } from "node:child_process"
import treeKill from "tree-kill"

const child = spawn("electron-vite", ["dev"], {
  stdio: "inherit",
  detached: true,
  shell: process.platform === "win32",
})

let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL")
    } catch {}
    treeKill(child.pid, "SIGKILL")
  }
  process.exit(0)
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, shutdown)
}

child.on("exit", (code) => {
  process.exit(code ?? 0)
})
