import { fetchOpenCodeApp } from "./fetch-with-overlay"

export type InProcessOpenCodeFetchInput = {
  directory?: string
  method?: string
  path: string
  query?: string
  headers?: HeadersInit
  body?: BodyInit
  signal?: AbortSignal
}

function buildOpenCodeAuthHeaders(): Record<string, string> | undefined {
  if (!process.env.OPENCODE_SERVER_PASSWORD) return undefined

  const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode"
  const token = Buffer.from(`${username}:${process.env.OPENCODE_SERVER_PASSWORD}`).toString(
    "base64",
  )
  return {
    authorization: `Basic ${token}`,
  }
}

export async function fetchInProcessOpenCode(
  input: InProcessOpenCodeFetchInput,
): Promise<Response> {
  const url = new URL(`http://opencode.local${input.path}`)
  if (input.query) {
    url.search = input.query
  }

  const headers = new Headers(input.headers)
  headers.delete("authorization")
  const authHeaders = buildOpenCodeAuthHeaders()
  if (authHeaders) {
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value)
    }
  }
  headers.delete("x-buddy-directory")
  if (input.directory) {
    headers.set("x-opencode-directory", input.directory)
  } else {
    headers.delete("x-opencode-directory")
  }
  headers.delete("host")
  headers.delete("content-length")

  return fetchOpenCodeApp(
    new Request(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.body,
      signal: input.signal,
    }),
    input.directory,
  )
}
