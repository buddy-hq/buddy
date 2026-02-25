import path from "node:path"

const root = path.resolve(process.cwd(), "../../.buddy-runtime/xdg")

process.env.XDG_DATA_HOME = path.join(root, "data")
process.env.XDG_CACHE_HOME = path.join(root, "cache")
process.env.XDG_CONFIG_HOME = path.join(root, "config")
process.env.XDG_STATE_HOME = path.join(root, "state")
process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS = "1"
process.env.OPENCODE_DISABLE_MODELS_FETCH = "1"
process.env.OPENCODE_CLIENT = "web"
