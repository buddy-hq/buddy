import { describe, expect, test } from "bun:test"
import { verifySignedMessage } from "./minisign"

const PUBLIC_KEY = "RWTcBSYzKsK7Gf1M2w9kTDB2fvSRlsZejPWt+AaMGvGiNk3mxAW+Wh3f"
const MESSAGE = `{
  "files": [
    {
      "sha512": "QeXMz5ni1lE/Q0kJSpxxFP9S8ELaSw0qWcXRTHZ5gxvwq1JyhAwCQ1FgZEd3iCGokqR6aXtb3Zv8rSW1qohuXQ==",
      "size": 282846656,
      "url": "https://github.com/prashantbhudwal/buddy-releases/releases/download/v0.0.65/buddy-v0.0.65-macos-apple-silicon.zip"
    }
  ],
  "version": "0.0.65"
}
`
const MINISIGN_SIGNATURE = `untrusted comment: signature from tauri secret key
RUTcBSYzKsK7GZLdRv/4Aek1Xd6/fHCCNgHuFNRgVqKjoVAOhpoDn/b23AsKVRU94wwfORuuKtyQreJpBppY2t4rRCMKjG+BpQQ=
trusted comment: timestamp:1788036806\tfile:latest-macos-arm64.json
A2Eu33WC9rKsDsRRhiTwfjyY+moKL9os7Cs0I2I1Wv7Z0+r3Pr3MJSSf7QBJ118Hrfa0NEIS8asoT/3rBci5CA==
`
const TAURI_SIGNATURE = Buffer.from(MINISIGN_SIGNATURE).toString("base64")

describe("minisign verification", () => {
  test.each([
    ["minisign document", MINISIGN_SIGNATURE],
    ["Tauri Base64 signature", TAURI_SIGNATURE],
  ])("verifies a valid %s", async (_label, signatureFileText) => {
    expect(
      await verifySignedMessage({
        message: Buffer.from(MESSAGE),
        publicKey: PUBLIC_KEY,
        signatureFileText,
      }),
    ).toBe(true)
  })

  test("rejects malformed single-line signature content", async () => {
    expect(
      verifySignedMessage({
        message: Buffer.from(MESSAGE),
        publicKey: PUBLIC_KEY,
        signatureFileText: "not-a-signature",
      }),
    ).rejects.toThrow("Invalid minisign signature content")
  })
})
