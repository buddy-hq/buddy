# AGENTS.md
A Hono route file should act as an HTTP adapter, not as the main application layer

## Hono route file guidelines

### Put in a route file
- Route definitions and grouping
  - Paths
  - HTTP methods
  - Nested route modules
  - `app.route()` composition

- Route-scoped middleware
  - Auth
  - CORS
  - Logging
  - Rate limiting
  - Body limits
  - Other request/response concerns tied to the route layer

- Validation and request parsing
  - Params
  - Query
  - Headers
  - Body
  - Input validation

- HTTP response shaping
  - Status codes
  - Headers
  - `c.json()`
  - `c.text()`
  - Other response construction

- Small route-local glue code
  - Thin orchestration
  - Adapting HTTP input to domain calls
  - Adapting domain results to HTTP output

### Keep out of a route file
- Substantial business logic
  - Domain rules
  - Decision-heavy logic
  - Policies not tied to HTTP

- Reusable workflows
  - Logic shared across routes
  - Logic that should work from jobs, scripts, or tests
  - Logic that should not depend on Hono context

- Large data-access code
  - Complex queries
  - Transactions
  - Query orchestration mixed with request handling

- Global app wiring
  - Broad app setup
  - Root-level concerns
  - Top-level `notFound`

### Nuance
- Route-level `onError` can be valid when you intentionally want scoped error handling

## Heuristics
- Keep it in the route file if it needs:
  - `c`
  - `c.req`
  - Middleware ordering
  - Headers
  - Cookies
  - Status codes
  - Direct response creation

- Move it out if it can be:
  - A plain function over plain data
  - Reused outside Hono
  - Unit tested without the HTTP layer

- Leave small endpoint-local glue where it is
- Move logic out once the route file starts acting like the app’s main business layer

## Best practices
- Prefer inline route handlers over Rails-style controller functions when possible
  - This keeps path-related typing and inference close to the route definition
  - It avoids separating handler code in a way that weakens route-aware type inference

- If you want controller-like extraction, use Hono’s factory helpers instead of plain detached handler functions
  - Use `createFactory()`
  - Use `factory.createHandlers()`
  - Use `factory.createMiddleware()`

- For larger apps, split by feature or resource and mount with `app.route()`
  - Example structure:
    - `authors.ts`
    - `books.ts`
    - `index.ts`
  - Keep each module responsible for its own sub-routes
  - Mount modules from the root app

- If you plan to use Hono RPC features, define apps in a way that preserves the app type cleanly
  - Prefer chaining on the app instance when useful
  - Export `type AppType = typeof app`
  - Use that type with the client
