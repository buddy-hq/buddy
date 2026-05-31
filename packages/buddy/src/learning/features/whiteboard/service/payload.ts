import { WhiteboardPayloadTooLargeError } from "../errors"

const MAX_WHITEBOARD_PAYLOAD_BYTES = 5 * 1024 * 1024

function assertWhiteboardPayloadWithinLimit(label: string, payload: string): void {
  if (Buffer.byteLength(payload, "utf8") > MAX_WHITEBOARD_PAYLOAD_BYTES) {
    throw new WhiteboardPayloadTooLargeError(label, MAX_WHITEBOARD_PAYLOAD_BYTES)
  }
}

export { assertWhiteboardPayloadWithinLimit, MAX_WHITEBOARD_PAYLOAD_BYTES }
