import { loadOpenCodeApp } from "../../opencode-runtime"
import { registerOpenCodeTools } from "./registration"
import type { FetchOpenCodeInput } from "./types"

async function fetchOpenCode(input: FetchOpenCodeInput): Promise<Response> {
  await registerOpenCodeTools(input.directory, {
    registerPedagogyTools: input.registerPedagogyTools ?? false,
    registerCurriculumTools: input.registerCurriculumTools ?? false,
    registerFigureTools: input.registerFigureTools ?? false,
    registerFreeformFigureTools: input.registerFreeformFigureTools ?? false,
    registerGoalTools: input.registerGoalTools ?? false,
    registerLearnerTools: input.registerLearnerTools ?? false,
    registerTeachingTools: input.registerTeachingTools ?? false,
    registerMathTools: input.registerMathTools ?? false,
  })

  const openCodeApp = await loadOpenCodeApp()
  const url = new URL(`http://opencode.local${input.path}`)
  if (input.query) {
    url.search = input.query
  }

  const headers = new Headers(input.headers)
  headers.delete("authorization")
  if (process.env.OPENCODE_SERVER_PASSWORD) {
    const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode"
    const token = Buffer.from(`${username}:${process.env.OPENCODE_SERVER_PASSWORD}`).toString("base64")
    headers.set("authorization", `Basic ${token}`)
  }
  headers.delete("x-buddy-directory")
  headers.set("x-opencode-directory", input.directory)
  headers.delete("host")
  headers.delete("content-length")

  return openCodeApp.fetch(
    new Request(url.toString(), {
      method: input.method,
      headers,
      body: input.body,
    }),
  )
}

export { fetchOpenCode }
