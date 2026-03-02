import { describeRoute } from "hono-openapi"

type DescribeRouteInput = Parameters<typeof describeRoute>[0]

export function compatibilityRoute(spec: unknown) {
  return describeRoute(spec as DescribeRouteInput)
}
