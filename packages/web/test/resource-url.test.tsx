import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ServerProvider, type ServerConnection } from "../src/context/server"
import { resolveAssetUrl } from "../src/lib/resource-url"

function createServerConnection(overrides: Partial<ServerConnection> = {}): ServerConnection {
  return {
    url: "",
    username: null,
    password: null,
    isEmbeddedBackend: false,
    ...overrides,
  }
}

function CaptureResolvedUrl(props: { endpoint: string; onValue: (value: string) => void }) {
  props.onValue(resolveAssetUrl(props.endpoint))
  return null
}

describe("resolveAssetUrl", () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  test("omits embedded credentials for embedded backend asset URLs", async () => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    let captured = ""

    await act(async () => {
      root.render(
        <ServerProvider
          value={createServerConnection({
            url: "http://127.0.0.1:53295",
            username: "buddy",
            password: "secret-token",
            isEmbeddedBackend: true,
          })}
        >
          <CaptureResolvedUrl
            endpoint="/api/objects/media-presentation/example/raw/item_1?directory=%2Frepo&fileName=image.png"
            onValue={(value) => {
              captured = value
            }}
          />
        </ServerProvider>,
      )
    })

    expect(captured).toBe(
      "http://127.0.0.1:53295/api/objects/media-presentation/example/raw/item_1?directory=%2Frepo&fileName=image.png",
    )
    expect(captured.includes("@127.0.0.1")).toBe(false)
  })
})
