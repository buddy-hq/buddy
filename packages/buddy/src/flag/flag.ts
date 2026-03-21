function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

export namespace Flag {
  export declare const BUDDY_CONFIG: string | undefined
  export declare const BUDDY_CONFIG_CONTENT: string | undefined

  export declare const BUDDY_DISABLE_PROJECT_CONFIG: boolean

  export declare const BUDDY_PERMISSION: string | undefined
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

Object.defineProperty(Flag, "BUDDY_PERMISSION", {
  get() {
    return process.env.BUDDY_PERMISSION
  },
  enumerable: true,
  configurable: false,
})
