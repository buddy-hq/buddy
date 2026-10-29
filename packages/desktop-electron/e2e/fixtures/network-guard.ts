import childProcess from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import { syncBuiltinESMExports } from "node:module"
import path from "node:path"
import z from "zod"

const logPath = process.env.BUDDY_E2E_NETWORK_LOG
const browserLogPath = logPath ? path.join(path.dirname(logPath), "browser-urls.txt") : undefined
const hosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])
const networkProtocols = new Set(["http:", "https:", "ws:", "wss:"])
if (logPath) fs.appendFileSync(`${logPath}.loaded`, `${process.pid}\n`)

function block(host: string) {
  if (hosts.has(host.toLowerCase())) return
  const message = `Blocked non-loopback connection: ${host}`
  if (logPath) fs.appendFileSync(logPath, `${message}\n`)
  throw new Error(message)
}

function browserURL(command: string, args: string[], environmentURL: string | undefined) {
  const executable = command.split(/[\\/]/u).at(-1)?.toLowerCase()
  let target: string | undefined
  if (["open", "xdg-open", "explorer", "explorer.exe"].includes(executable ?? "") && args.length === 1) {
    target = args[0]
  } else if (executable === "cmd" || executable === "cmd.exe") {
    if (args[0]?.toLowerCase() !== "/c" || args[1]?.toLowerCase() !== "start") return
    if (args.length === 3) target = args[2]
    else if (args.length === 4 && (args[2] === "" || args[2] === '""')) target = args[3]
  } else if (
    executable === "powershell.exe" &&
    args.length === 4 &&
    args[0] === "-NoProfile" && args[1] === "-NonInteractive" &&
    args[2] === "-Command" && args[3] === "Start-Process $env:BUDDY_MCP_AUTH_URL"
  ) {
    target = environmentURL
  }
  if (!target || !URL.canParse(target)) return
  const url = new URL(target)
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined
}

childProcess.execFile = new Proxy(childProcess.execFile, {
  apply(target, receiver, args) {
    const command = z.string().safeParse(args[0])
    const argv = z.array(z.string()).safeParse(args[1])
    const options = z.object({ env: z.object({ BUDDY_MCP_AUTH_URL: z.string().optional() }).optional() }).safeParse(args[2])
    const url = command.success && argv.success ? browserURL(command.data, argv.data, options.success ? options.data.env?.BUDDY_MCP_AUTH_URL : undefined) : undefined
    if (!browserLogPath || !url) return Function.prototype.apply.call(target, receiver, args)
    fs.appendFileSync(browserLogPath, `${url}\n`)
    const child = new childProcess.ChildProcess()
    const output = z.union([z.string(), z.instanceof(Buffer)])
    const callback = z.function({ input: [z.null(), output, output], output: z.unknown() }).safeParse(args.at(-1))
    const bufferOutput = z.object({ encoding: z.union([z.literal("buffer"), z.null()]) }).safeParse(args[2]).success
    process.nextTick(() => {
      child.emit("spawn")
      Object.defineProperty(child, "exitCode", { value: 0, configurable: true })
      child.emit("exit", 0, null)
      if (callback.success) callback.data(null, bufferOutput ? Buffer.alloc(0) : "", bufferOutput ? Buffer.alloc(0) : "")
      child.emit("close", 0, null)
    })
    return child
  },
})

globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, receiver, args) {
    const input = args[0]
    const url = input instanceof Request ? new URL(input.url) : new URL(input)
    if (networkProtocols.has(url.protocol)) {
      try { block(url.hostname) }
      catch (error) { return Promise.reject(error) }
    }
    return Function.prototype.apply.call(target, receiver, args)
  },
})

const socketOptions = z.object({ port: z.union([z.number(), z.string()]), host: z.string().optional() })
net.Socket.prototype.connect = new Proxy(net.Socket.prototype.connect, {
  apply(target, socket, args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0]
    const options = socketOptions.safeParse(first)
    if (options.success) block(options.data.host ?? "localhost")
    else if (z.number().safeParse(first).success) {
      const host = z.string().safeParse(args[1])
      block(host.success ? host.data : "localhost")
    }
    return Function.prototype.apply.call(target, socket, args)
  },
})
syncBuiltinESMExports()
