import { mapRouteError } from "../../http/route-errors"

export function mapConfigRouteError<TError>(error: TError): Promise<Response | undefined> {
  return mapRouteError(error, { config: true })
}
