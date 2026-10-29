/// <reference path="./shell-parser-wasm.d.ts" />
import type { PlatformPath } from "node:path"
import { fileURLToPath } from "node:url"
import { Language, Parser, type Node } from "web-tree-sitter"
import runtimeWasm from "web-tree-sitter/tree-sitter.wasm" with { type: "file" }
import bashWasm from "tree-sitter-bash/tree-sitter-bash.wasm" with { type: "file" }
import powershellWasm from "tree-sitter-powershell/tree-sitter-powershell.wasm" with { type: "file" }

const FILES = new Set([
  "rm",
  "cp",
  "mv",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  "cat",
  "get-content",
  "set-content",
  "add-content",
  "copy-item",
  "move-item",
  "remove-item",
  "new-item",
  "rename-item",
])
const CMD_FILES = new Set([
  "copy",
  "del",
  "dir",
  "erase",
  "md",
  "mkdir",
  "move",
  "rd",
  "ren",
  "rename",
  "rmdir",
  "type",
])
const FLAGS = new Set(["-destination", "-literalpath", "-path"])
const SWITCHES = new Set([
  "-confirm",
  "-debug",
  "-force",
  "-nonewline",
  "-recurse",
  "-verbose",
  "-whatif",
])

type Part = { type: string; text: string }
type Mode = "posix" | "powershell" | "cmd"
type Location = { directory: string; project: { directory: string } }
type ScanInput = { command: string; workdir?: string; location: Location }
type ScanOptions = {
  platform: string
  path: PlatformPath
  home: string
  env: NodeJS.ProcessEnv
  isDirectory: (file: string) => boolean
}

function resolveWasm(asset: string) {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  return fileURLToPath(new URL(asset, import.meta.url))
}

let parsers: Promise<{ bash: Parser; powershell: Parser }> | undefined

function loadParsers() {
  parsers ??= (async () => {
    await Parser.init({ locateFile: () => resolveWasm(runtimeWasm) })
    const [bashLanguage, powershellLanguage] = await Promise.all([
      Language.load(resolveWasm(bashWasm)),
      Language.load(resolveWasm(powershellWasm)),
    ])
    const bash = new Parser().setLanguage(bashLanguage)
    const powershell = new Parser().setLanguage(powershellLanguage)
    return { bash, powershell }
  })()
  return parsers
}

function parts(node: Node) {
  const out: Part[] = []
  let end = -1
  for (const child of node.children) {
    if (!child) continue
    if (child.type === "command_elements") {
      for (const item of child.children) {
        if (!item || item.type === "command_argument_sep" || item.type === "redirection") continue
        out.push({ type: item.type, text: item.text })
      }
      continue
    }
    if (
      child.type !== "command_name" &&
      child.type !== "command_name_expr" &&
      child.type !== "word" &&
      child.type !== "string" &&
      child.type !== "raw_string" &&
      child.type !== "concatenation" &&
      child.type !== "simple_expansion" &&
      child.type !== "expansion" &&
      child.type !== "command_substitution"
    ) {
      continue
    }
    const previous = out.at(-1)
    if (previous && end === child.startIndex) previous.text += child.text
    else out.push({ type: child.type, text: child.text })
    end = child.endIndex
  }
  return out
}

function pathArgs(list: Part[], mode: Mode) {
  if (mode !== "powershell") {
    return list
      .slice(1)
      .filter(
        (item) =>
          !item.text.startsWith("-") &&
          !(mode === "cmd" && item.text.startsWith("/")) &&
          !(list[0]?.text === "chmod" && item.text.startsWith("+")),
      )
      .map((item) => item.text)
  }
  const out: string[] = []
  let want = false
  for (const item of list.slice(1)) {
    if (want) {
      out.push(item.text)
      want = false
      continue
    }
    if (item.type === "command_parameter") {
      const flag = item.text.toLowerCase()
      if (SWITCHES.has(flag)) continue
      want = FLAGS.has(flag)
      continue
    }
    out.push(item.text)
  }
  return out
}

function unquote(text: string) {
  if (text.length < 2) return text
  const first = text[0]
  return (first === '"' || first === "'") && first === text[text.length - 1]
    ? text.slice(1, -1)
    : text
}

function home(text: string, options: ScanOptions) {
  if (text === "~") return options.home
  if (text.startsWith("~/") || text.startsWith("~\\"))
    return options.path.join(options.home, text.slice(2))
  return text
}

function envValue(key: string, options: ScanOptions) {
  if (options.platform !== "win32") return options.env[key]
  const name = Object.keys(options.env).find((item) => item.toLowerCase() === key.toLowerCase())
  return name ? options.env[name] : undefined
}

function expand(text: string, cwd: string, options: ScanOptions) {
  const expanded = unquote(text)
    .replace(/\$\{env:([^}]+)\}/gi, (_, key: string) => envValue(key, options) || "")
    .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, key: string) => envValue(key, options) || "")
    .replace(/\$(HOME|PWD)(?=$|[\\/])/gi, (_, key: string) =>
      key.toUpperCase() === "HOME" ? options.home : cwd,
    )
  return home(expanded, options)
}

function provider(text: string) {
  const match = text.match(/^([A-Za-z]+)::(.*)$/)
  if (match) return match[1].toLowerCase() === "filesystem" ? match[2] : undefined
  const prefix = text.match(/^([A-Za-z]+):(.*)$/)
  if (!prefix || prefix[1].length === 1) return text
}

function dynamic(text: string, ps: boolean) {
  if (text.startsWith("(") || text.startsWith("@(")) return true
  if (text.includes("$(") || text.includes("${") || text.includes("`")) return true
  return ps ? /\$(?!env:)/i.test(text) : text.includes("$")
}

function prefix(text: string) {
  const match = /[?*[]/.exec(text)
  if (!match) return text
  if (match.index > 0) return text.slice(0, match.index)
}

function resolvePath(text: string, root: string, options: ScanOptions) {
  const normalized =
    options.platform === "win32"
      ? text
          .replace(/^\/([a-z]):(?:[\\/]|$)/i, (_, drive: string) => `${drive.toUpperCase()}:/`)
          .replace(/^\/([a-z])(?:\/|$)/i, (_, drive: string) => `${drive.toUpperCase()}:/`)
          .replace(
            /^\/cygdrive\/([a-z])(?:\/|$)/i,
            (_, drive: string) => `${drive.toUpperCase()}:/`,
          )
          .replace(/^\/mnt\/([a-z])(?:\/|$)/i, (_, drive: string) => `${drive.toUpperCase()}:/`)
      : text
  return options.path.resolve(root, normalized)
}

function argPath(arg: string, cwd: string, mode: Mode, options: ScanOptions) {
  const ps = mode === "powershell"
  const text = ps ? expand(arg, cwd, options) : home(unquote(arg), options)
  const file = text && prefix(text)
  if (!file || dynamic(file, ps)) return
  const next = ps ? provider(file) : file
  if (next) return resolvePath(next, cwd, options)
}

function contains(root: string, file: string, path: PlatformPath) {
  const relative = path.relative(root, file)
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

export async function scanShellExternalDirectories(
  input: ScanInput,
  options: ScanOptions,
): Promise<string[]> {
  const parser = await loadParsers()
  const cwd = input.workdir
    ? resolvePath(home(input.workdir, options), input.location.directory, options)
    : input.location.directory
  const project = options.path.resolve(input.location.project.directory)
  const directories = new Set<string>()
  const modes: Mode[] = [
    "posix",
    "powershell",
    ...(options.platform === "win32" ? ["cmd" as const] : []),
  ]
  for (const mode of modes) {
    const grammar = mode === "powershell" ? parser.powershell : parser.bash
    const tree = grammar.parse(mode === "cmd" ? `${input.command}\n\n` : input.command)
    if (!tree) continue
    try {
      for (const node of tree.rootNode.descendantsOfType("command")) {
        if (!node) continue
        const command = parts(node)
        const name = mode === "posix" ? command[0]?.text : command[0]?.text.toLowerCase()
        if (!name || !(FILES.has(name) || (mode === "cmd" && CMD_FILES.has(name)))) continue
        for (const arg of pathArgs(command, mode)) {
          const resolved = argPath(arg, cwd, mode, options)
          if (
            !resolved ||
            contains(input.location.directory, resolved, options.path) ||
            (project !== options.path.parse(project).root &&
              contains(project, resolved, options.path))
          )
            continue
          directories.add(options.isDirectory(resolved) ? resolved : options.path.dirname(resolved))
        }
      }
    } finally {
      tree.delete()
    }
  }
  return [...directories]
}
