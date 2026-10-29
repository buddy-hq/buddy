import { setDefaultTimeout } from "bun:test"

export const CONFORMANCE_TEST_TIMEOUT_MS = 30_000

setDefaultTimeout(CONFORMANCE_TEST_TIMEOUT_MS)
