function bytesToBase64(value: string) {
  const encoded = new TextEncoder().encode(value)
  let binary = ""
  for (const chunk of encoded) {
    binary += String.fromCharCode(chunk)
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

export function encodeDirectory(directory: string) {
  return bytesToBase64(directory)
    .split("+")
    .join("-")
    .split("/")
    .join("_")
    .split("=")
    .join("")
}

export function decodeDirectory(token: string) {
  const padded = token
    .split("-")
    .join("+")
    .split("_")
    .join("/")
    .padEnd(Math.ceil(token.length / 4) * 4, "=")
  return base64ToBytes(padded)
}
