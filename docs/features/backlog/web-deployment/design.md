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
   - If the user explicitly asks the agent to log in, or the provider is not connected in Buddy, the agent may run the pinned provider CLI's normal login flow in explicit ambient mode.
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
   - The actual provider CLI child should receive tokens only through its environment, using bindings such as `NETLIFY_AUTH_TOKEN` or `VERCEL_TOKEN`.
   - The general agent shell should receive only a short-lived, single-use credential lease bound to one prepared deployment run, never the token itself.
   - The agent should learn whether a provider is connected from Buddy's non-secret session hint and enabled skills, not from inspecting token values.
   - The launcher should restrict managed auth to the prepared static deployment, reject arbitrary CLI commands and paths, and redact known token values from command output.
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
- CLI-based deployment from Buddy-managed HTML widgets in V1.
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

## Resolved Planning Questions

- V1 supports both Netlify and Vercel.
- Existing global CLI login is not imported in V1. Explicit ambient-CLI
  deployments remain available as an unmanaged fallback.
- Managed and ambient-CLI successes share one deployment history and identify
  their auth mode.
- Deployment records include provider, object and source version, intent, URL,
  provider identifiers when available, auth mode, origin, and timestamp.
- Deployment credentials use a new provider-neutral Buddy store encrypted by a
  master key protected with Electron `safeStorage`; they do not use OpenCode's
  LLM-provider auth namespace.

## Implementation Boundary

This file is the product design brief. The proposed repository architecture,
provider feasibility decisions, delivery phases, tests, and acceptance criteria
live in [implementation-plan.md](./implementation-plan.md). Implementation has
not started.
