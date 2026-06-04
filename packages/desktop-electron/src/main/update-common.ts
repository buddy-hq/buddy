import { verifySignedMessage } from "./minisign"

const SIGNATURE_SUFFIX = ".sig"

export const RELEASE_REPOSITORY_OWNER = "prashantbhudwal"
export const RELEASE_REPOSITORY_NAME = "buddy"
export const RELEASE_REPOSITORY = `${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}`
export const BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY = "BUDDY_UPDATE_PUBLIC_KEY"
export const BUDDY_MINISIGN_PUBLIC_KEY = "RWTcBSYzKsK7Gf1M2w9kTDB2fvSRlsZejPWt+AaMGvGiNk3mxAW+Wh3f"

export function resolveLatestReleaseAssetUrl(filename: string): string {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/latest/download/${filename}`
}

export function resolveReleaseDownloadBaseUrl(version: string): string {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/download/v${version}/`
}

export function resolveReleaseAssetUrl(version: string, filename: string): string {
  if (isAbsoluteUrl(filename)) {
    return filename
  }

  return new URL(filename, resolveReleaseDownloadBaseUrl(version)).toString()
}

export async function fetchSignedText(input: { publicKey?: string; url: string }): Promise<string> {
  const [contentResponse, signatureResponse] = await Promise.all([
    fetch(input.url, {
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
    fetch(`${input.url}${SIGNATURE_SUFFIX}`, {
      headers: {
        Accept: "text/plain, application/octet-stream;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
  ])

  if (!contentResponse.ok) {
    throw new Error(
      `Failed to fetch signed update content: ${contentResponse.status} ${contentResponse.statusText}`,
    )
  }

  if (!signatureResponse.ok) {
    throw new Error(
      `Failed to fetch update signature: ${signatureResponse.status} ${signatureResponse.statusText}`,
    )
  }

  const [contentText, signatureOuterText] = await Promise.all([
    contentResponse.text(),
    signatureResponse.text(),
  ])

  const verified = await verifySignedMessage({
    message: Buffer.from(contentText, "utf8"),
    publicKey: input.publicKey ?? BUDDY_MINISIGN_PUBLIC_KEY,
    signatureFileText: decodeTauriSignatureOuterText(signatureOuterText),
  })

  if (!verified) {
    throw new Error("Signed update content verification failed")
  }

  return contentText
}

export function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://")
}

function decodeTauriSignatureOuterText(signatureOuterText: string): string {
  return Buffer.from(signatureOuterText.trim(), "base64").toString("utf8")
}
