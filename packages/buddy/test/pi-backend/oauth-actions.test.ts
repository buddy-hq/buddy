import { afterEach, describe, expect, test } from "bun:test"
import { app } from "../../src/index"
import { completePendingPiOAuthFlow } from "../../src/pi-backend/oauth-actions"
import { piRuntime } from "../../src/pi-backend/runtime"

const BUDDY_OPENAI_PROVIDER_ID = "openai"
const OAUTH_AUTHORIZE_PATH = `/api/provider/${BUDDY_OPENAI_PROVIDER_ID}/oauth/authorize`

async function flushTasks() {
  await Promise.resolve()
  await Promise.resolve()
}

function createDeferred() {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve() {
      resolve?.()
    },
  }
}

const authStorage = piRuntime.getAuthStorage()
const originalLogin = authStorage.login.bind(authStorage)

afterEach(() => {
  authStorage.login = originalLogin
})

describe("PI OAuth flow retries", () => {
  test("keeps a newer pending flow when an older sign-in finishes later", async () => {
    const firstLogin = createDeferred()
    const secondLogin = createDeferred()
    let loginCount = 0

    authStorage.login = async (_providerID, callbacks) => {
      loginCount += 1
      callbacks.onAuth({
        url: `https://chatgpt.example/${loginCount}`,
        instructions: "Complete authorization in the browser.",
      })

      if (loginCount === 1) {
        await firstLogin.promise
        return
      }

      await secondLogin.promise
    }

    const firstAuthorize = await app.request(OAUTH_AUTHORIZE_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: 0 }),
    })
    expect(firstAuthorize.status).toBe(200)

    const secondAuthorize = await app.request(OAUTH_AUTHORIZE_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: 0 }),
    })
    expect(secondAuthorize.status).toBe(200)

    firstLogin.resolve()
    await flushTasks()

    const callbackCompletion = completePendingPiOAuthFlow({
      providerID: BUDDY_OPENAI_PROVIDER_ID,
    })

    await flushTasks()
    secondLogin.resolve()

    await expect(callbackCompletion).resolves.toBeUndefined()
  })
})
