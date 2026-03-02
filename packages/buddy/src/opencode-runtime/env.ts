import path from "node:path"

const runtimeRoot = path.resolve(process.cwd(), ".buddy-runtime/xdg")

export const BUDDY_XDG_DATA_HOME = path.join(runtimeRoot, "data")
export const BUDDY_XDG_CACHE_HOME = path.join(runtimeRoot, "cache")
export const BUDDY_XDG_CONFIG_HOME = path.join(runtimeRoot, "config")
export const BUDDY_XDG_STATE_HOME = path.join(runtimeRoot, "state")

export function configureOpenCodeEnvironment() {
  process.env.XDG_DATA_HOME = BUDDY_XDG_DATA_HOME
  process.env.XDG_CACHE_HOME = BUDDY_XDG_CACHE_HOME
  process.env.XDG_CONFIG_HOME = BUDDY_XDG_CONFIG_HOME
  process.env.XDG_STATE_HOME = BUDDY_XDG_STATE_HOME
  process.env.OPENCODE_CLIENT ||= "web"
}

configureOpenCodeEnvironment()
