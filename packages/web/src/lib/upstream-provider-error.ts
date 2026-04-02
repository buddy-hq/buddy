const ZEN_IP_RATE_LIMIT_TABLE_NAME = "ip_rate_limit"
const ZEN_QUERY_FAILURE_PREFIX = "Failed query:"
const ZEN_NETWORK_RATE_LIMIT_MESSAGE =
  "OpenCode Zen temporarily rate limited this network for the selected free model. Try again later, switch networks, or use another model."

export function normalizeUpstreamProviderErrorMessage(message: string): string {
  if (isZenNetworkRateLimitFailure(message)) {
    return ZEN_NETWORK_RATE_LIMIT_MESSAGE
  }

  return message
}

function isZenNetworkRateLimitFailure(message: string): boolean {
  return (
    message.includes(ZEN_QUERY_FAILURE_PREFIX) && message.includes(ZEN_IP_RATE_LIMIT_TABLE_NAME)
  )
}
