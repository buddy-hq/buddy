# Web Deployment

## Objective

Make deployment feel like a natural next step after Buddy creates a web widget or small app: the user connects a hosting account once, then Buddy can publish through the provider CLI without asking for GitHub.

## Product Shape

Buddy should support first-class account connection for deployment providers such as Netlify and Vercel.

The deployment engine remains the provider CLI. Buddy should not add Netlify or Vercel MCP tools, and the agent should not need provider API tool definitions in context. Provider-specific deployment knowledge should live in skills.

Netlify and Vercel already have first-class deployment skills. Buddy should reuse those skills rather than reinventing provider deployment workflows. The product work is account connection, skill availability, session hinting, and result display.

The desired user experience is:

1. User connects Netlify or Vercel in Buddy.
2. Buddy shows which deployment providers are connected.
3. Buddy keeps a small deployment router skill available.
4. Buddy enables the matching provider deployment skill when that provider is available.
5. Buddy gives the agent a short non-secret session hint that the provider is connected.
6. The user asks the agent to deploy, either by typing or by pressing a UI affordance that sends a structured deployment request into the agent flow.
7. The agent deploys by following the provider skill and running the provider CLI.
8. Buddy records the deployment result and shows the URL in the conversation and, where useful, on the relevant widget or app.

## Design Decisions

1. First-class login is the default path.
   - Login is app state, not deployment logic.
   - Buddy should know whether a provider is connected before the agent starts.
   - This enables better defaults, skill gating, and smoother agent-initiated deployment.
   - Buddy should reuse the shape of the existing OAuth connection flow where possible: browser authorization, local callback/cancel handling, connected state, and disconnect/reconnect UI.
   - This does not mean deployment credentials must be stored in the same LLM-provider auth namespace.

2. Agent-discovered CLI login is a fallback.
   - If the user explicitly asks the agent to log in, or the provider is not connected in Buddy, the agent may run `npx netlify login` or `npx vercel login`.
   - Deployments that rely on ambient CLI login are valid but unmanaged by Buddy.

3. Buddy-managed provider state is separate from ambient CLI state.
   - `Connected` means Buddy has a managed credential it can use for deploy runs.
   - A globally logged-in CLI does not automatically make Buddy connected.
   - If Buddy later detects ambient CLI auth, it should label it as unmanaged rather than silently treating it as connected.

4. Deployment stays skill-and-CLI based.
   - A small deployment router skill can stay available so the agent knows deployment is possible and can route to Netlify or Vercel when appropriate.
   - Existing Netlify and Vercel deployment skills provide the workflow.
   - Buddy should not reimplement their provider-specific deployment logic.
   - The CLI remains the invariant execution path.
   - Buddy should avoid building a provider-specific deploy abstraction until the CLI path proves insufficient.

5. Deployment should be agent-initiated first.
   - The simplest v1 flow is that the user asks Buddy to deploy, and the agent follows the enabled provider skill.
   - A deploy UI affordance is acceptable if it only sends a structured deployment request into the agent flow.
   - The UI can render that request as a compact action such as `[deploy]` while the agent receives the structured instruction.
   - The structured request should include non-secret context such as the artifact reference, provider preference when known, and preview/production intent.
   - The affordance should not call provider APIs, invoke provider CLIs directly from the UI, or bypass provider skills.
   - Any deployment request should use Buddy-managed auth when available and should not silently depend on whatever global CLI login happens to exist on the machine.

6. Deployment tokens should be stored by Buddy, not by the agent.
   - Store Netlify and Vercel credentials in a Buddy-owned local credential store for deployment providers.
   - Keep deployment credentials separate from the existing LLM provider auth model unless that model is intentionally generalized.
   - Tokens should never be written into prompts, transcripts, skills, widget source, deployment records, or logs.
   - Deploy runs should receive tokens only through child-process environment variables such as `NETLIFY_AUTH_TOKEN` or `VERCEL_TOKEN`.
   - Token injection should be scoped to agent sessions or shell commands where deployment auth is intentionally enabled, not the whole Buddy app process.
   - The agent should learn whether a provider is connected from Buddy's non-secret session hint and enabled skills, not from inspecting token values.
   - Once a token is injected into a shell environment, the agent can technically inspect it. Buddy should not pretend this is preventable.
   - The practical boundary is: do not put token values in model-visible hints, redact known token values from command output, and inject them only when deployment auth is intentionally enabled for the session or command.
   - Stored account metadata can be non-secret: provider, account/team label, user email when available, scopes when useful, and timestamps.

7. Generated widgets are the first product target.
   - Buddy already creates multi-file HTML widgets and small web apps.
   - Users should be able to ask the agent to publish those artifacts without requiring GitHub.
   - Deployment should start from Buddy-managed provider auth and the existing provider skill, not a separate deploy API.

## Scope

In scope:

- Netlify and Vercel account connection.
- Local storage of Buddy-managed deployment credentials.
- Provider availability shown in Buddy.
- A lightweight deployment router skill.
- Conditional enablement of existing Netlify and Vercel deployment skills.
- Session hinting for connected deployment providers.
- CLI-based deployment from generated widgets or small web apps.
- Agent-initiated deployment from chat.
- Optional deploy request UI that sends structured instructions into the agent flow.
- Deployment result display with the published URL.

Out of scope for this design brief:

- MCP deployment tools.
- GitHub-based deployment flows.
- Rewriting Netlify or Vercel deployment skill logic in Buddy.
- A first-class provider deploy API.
- A deploy button that bypasses the agent, provider skills, or provider CLI workflow.
- Team/project/site management beyond the minimum needed to deploy.
- Choosing the final credential storage implementation.
- A detailed implementation plan.

## Open Questions

- Should Buddy offer an explicit "import existing CLI login" action?
- Should unmanaged CLI deployments appear in the same deployment history as Buddy-managed deployments?
- Should v1 support both Netlify and Vercel, or start with Netlify static widget deployment first?
- What is the smallest useful deployment record for a widget: provider, URL, timestamp, and auth mode?
- Should deployment credentials use the existing OpenCode `auth.json` mechanism, a new Buddy-only file with strict permissions, or OS keychain storage?

## Implementation Boundary

This file is a design brief only. Implementation details should live in a separate implementation document if this backlog item moves forward.
