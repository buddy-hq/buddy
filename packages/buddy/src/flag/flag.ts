function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function number(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export namespace Flag {
  export declare const BUDDY_CONFIG: string | undefined
  export declare const BUDDY_CONFIG_CONTENT: string | undefined

  export declare const BUDDY_DISABLE_PROJECT_CONFIG: boolean
  export declare const BUDDY_DISABLE_CLAUDE_CODE_PROMPT: boolean
  export declare const BUDDY_DISABLE_AUTOCOMPACT: boolean
  export declare const BUDDY_DISABLE_PRUNE: boolean

  export declare const BUDDY_PERMISSION: string | undefined

  export const BUDDY_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("BUDDY_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
}

Object.defineProperty(Flag, "BUDDY_CONFIG", {
  get() {
    return process.env.BUDDY_CONFIG
  },
  enumerable: true,
  configurable: false,
})

Object.defineProperty(Flag, "BUDDY_CONFIG_CONTENT", {
  get() {
    return process.env.BUDDY_CONFIG_CONTENT
  },
  enumerable: true,
  configurable: false,
})

Object.defineProperty(Flag, "BUDDY_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("BUDDY_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

Object.defineProperty(Flag, "BUDDY_DISABLE_CLAUDE_CODE_PROMPT", {
  get() {
    return truthy("BUDDY_DISABLE_CLAUDE_CODE_PROMPT")
  },
  enumerable: true,
  configurable: false,
})

Object.defineProperty(Flag, "BUDDY_DISABLE_AUTOCOMPACT", {
  get() {
    return truthy("BUDDY_DISABLE_AUTOCOMPACT")
  },
  enumerable: true,
  configurable: false,
})

Object.defineProperty(Flag, "BUDDY_DISABLE_PRUNE", {
  get() {
    return truthy("BUDDY_DISABLE_PRUNE")
  },
  enumerable: true,
  configurable: false,
})

Object.defineProperty(Flag, "BUDDY_PERMISSION", {
  get() {
    return process.env.BUDDY_PERMISSION
  },
  enumerable: true,
  configurable: false,
})
