# Claude for Teachers MCP research and Buddy prebundle plan

Status: initial research snapshot, ready to drive implementation

Research date: 2026-07-15

Scope: the nine K-12 services named in Anthropic's Claude for Teachers announcement, Anthropic's public K-12 skills/plugin, the Learning Commons Knowledge Graph, and the work needed to prebundle these capabilities with Buddy in the same product sense that Buddy prebundles skills.

This document is deliberately detailed. Remote MCP endpoints, OAuth metadata, vendor terms, and upstream files can change, so revalidate the mutable facts before shipping.

## Executive conclusion

All nine services shown in Anthropic's Claude for Teachers announcement have real, vendor-hosted remote MCP servers:

- ASSISTments
- Brisk Teaching
- Canva
- Coteach
- Diffit
- Eedi
- MagicSchool
- Snorkl
- TeachFX

This is not an inference from marketing copy. Anthropic published the exact nine remote server definitions in the Apache-2.0-licensed [`anthropics/k12-teacher-skills`](https://github.com/anthropics/k12-teacher-skills) repository. The authoritative configuration for the research snapshot is [`plugin/.mcp.json`](https://github.com/anthropics/k12-teacher-skills/blob/7c03c83db8223b050b6569ffbe14cd94e229396e/plugin/.mcp.json).

Anthropic's initial upstream commit used for this research is:

- Commit: [`7c03c83db8223b050b6569ffbe14cd94e229396e`](https://github.com/anthropics/k12-teacher-skills/commit/7c03c83db8223b050b6569ffbe14cd94e229396e)
- Commit date: 2026-07-13T22:29:28Z
- Plugin version: `0.6.0`
- Commit message: `Initial commit`

Buddy should treat these as **prebundled remote connector definitions**, not bundled MCP server binaries. The MCP implementations remain hosted and operated by their vendors. Buddy can make the definitions available, explain their capabilities, and let a user explicitly enable and authenticate each connector.

The engineering is relatively small because Buddy already supports remote MCP, Streamable HTTP, SSE fallback, browser OAuth, dynamic client registration, and explicitly supplied OAuth client credentials. The remaining material work is:

1. Add a curated inbuilt-MCP catalog and feature ownership model.
2. Handle two OAuth client-registration variants Buddy does not currently package as a product-level preset.
3. Obtain vendor-issued OAuth clients for Diffit and MagicSchool unless their discovery metadata changes.
4. Review third-party terms, trademarks, privacy, data retention, and K-12/student-data implications.
5. Adapt and attribute Anthropic's open K-12 skills and evals.
6. Prebundle or strongly recommend the Learning Commons Knowledge Graph MCP, because it supplies the standards and learning progressions that make the open skills substantially better.

The shortest accurate description of Claude for Teachers is:

> Claude/Cowork/Code + open teacher skills and evals + Learning Commons standards data + nine third-party remote MCPs + teacher verification + K-12 privacy/product terms.

The agent-and-connectors thesis is therefore substantially correct. The difficult part is not writing nine integrations. It is the partner-auth, data-rights, trust, and product-governance layer around otherwise standard MCP connections.

## What "prebundle" must mean in Buddy

There are three different operations that are easy to conflate:

1. **Bundle a server implementation.** Ship executable MCP server code inside the Electron application. This is not what Anthropic does for these nine services, and no relevant redistributable implementation for their classroom functionality was found.
2. **Bundle a remote connector definition.** Ship the service name, endpoint, description, scopes, documentation links, privacy links, and auth strategy. The vendor continues to host the MCP server. This is the correct model for these nine services.
3. **Bundle a skill that uses connectors.** Ship agent instructions, references, scripts, and evals that make purposeful use of the MCP tools. Anthropic does this in the same public repository. Buddy can adapt this material under Apache 2.0.

Recommended Buddy semantics:

- Inbuilt MCPs are discoverable but disabled by default.
- Enabling an inbuilt MCP is an explicit user action.
- OAuth or API-key consent is per OS user and per vendor.
- Buddy does not claim to host, operate, endorse, or guarantee a third-party service.
- Removing an inbuilt MCP connection removes local tokens and cached client registration for that endpoint.
- The catalog must be independently updateable because endpoints, scopes, descriptions, and vendor availability can change faster than Buddy releases.
- An unavailable or unapproved connector should be hidden or clearly marked, not presented as a broken connection button.

## Anthropic's public implementation recipe

### Exact upstream MCP configuration

Anthropic's published configuration is:

```json
{
  "mcpServers": {
    "ASSISTments": { "type": "http", "url": "https://mcp.assistments.org/mcp" },
    "Brisk Teaching": { "type": "http", "url": "https://mcp.briskteaching.com/mcp" },
    "Canva": { "type": "http", "url": "https://mcp.canva.com/mcp" },
    "Coteach": { "type": "http", "url": "https://coteach.ai/api/mcp" },
    "Diffit": { "type": "http", "url": "https://api.diffit.me/mcp" },
    "Eedi": { "type": "http", "url": "https://teacher-tools.eedi.ai/mcp" },
    "MagicSchool": { "type": "http", "url": "https://app.magicschool.ai/api/mcp" },
    "Snorkl": { "type": "http", "url": "https://api.snorkl.app/mcp" },
    "TeachFX": { "type": "http", "url": "https://api.teachfx.com/mcp" }
  }
}
```

Do not silently replace these endpoints with community MCP servers that happen to use similar names. These are first-party vendor domains and are the endpoints Anthropic bundled.

### Open skills and evals

The repository includes two skills:

- `k12-lesson-planning`: creates a lesson plan, student-facing materials, and an observation template. It covers math, ELA, science, and social studies. It can optionally align to Illustrative Mathematics or OpenSciEd patterns when the curriculum is confirmed.
- `k12-lesson-differentiation`: adapts an existing lesson into below-, at-, and above-grade-level variants and produces a teacher differentiation plan plus three student documents.

The repository also includes:

- Subject-specific references for math, ELA, science, and social studies.
- Learning Commons tool-use instructions.
- Example material-source JSON documents.
- Python renderers that produce editable Word documents and HTML previews.
- CSS used by the HTML output.
- Eval rubrics for lesson planning and differentiation.
- A Claude plugin manifest and marketplace manifest.

Important behavioral details to retain if Buddy adapts these skills:

- Each skill works without Learning Commons, but must disclose that standards and misconceptions then reflect general best practice.
- If Learning Commons tools are available, the skill treats calling them before drafting as mandatory.
- The skills require loading the matching subject reference before drafting.
- Lesson creation and differentiation of an existing lesson are intentionally separate skills.
- The planning skill produces a full packet by default, with an optional quick-draft review step.
- The differentiation skill produces one teacher plan and three student tier documents.
- Both skills use a single material-source JSON so shared prompts and answers cannot drift across generated documents.
- The rendering command is `bash scripts/render_all.sh <source.json> "$OUTPUT_DIR"`.
- Output includes editable `.docx` files plus HTML and JSON working files for subsequent revisions.
- The renderers are Python. `render_lesson_docx.py` depends on `python-docx`; the rest is predominantly Python standard-library code plus shared local modules.
- The skills include detailed print-safety, reading-level, workload, answer-key, timing, and cross-document consistency rules. Do not reduce the adaptation to a short prompt and lose these invariants.
- The skills include a copyright guardrail: curriculum sources may inform structure and scope, but generated student-facing text, prompts, questions, narratives, and problem contexts must be original.
- A curriculum must not be named when the teacher has not confirmed that curriculum.

Before copying the skills into Buddy, review the full upstream `SKILL.md`, every directly referenced subject file, the example schema, scripts, eval rubrics, and licenses at a pinned commit. Do not copy only the top-level instructions.

### Upstream licensing

The repository root is Apache License 2.0. Its `NOTICE` states:

```text
Agent Skills for K-12 Teachers
Copyright 2026 Anthropic, PBC
Copyright 2026 Learning Commons
Portions of this product were co-developed by Anthropic, PBC
and Learning Commons under a collaboration agreement.
```

Implications for Buddy:

- Buddy may reproduce, modify, and distribute the repository content under Apache 2.0.
- Buddy must include the Apache license and retain applicable copyright, patent, trademark, and attribution notices.
- Modified files need prominent modification notices.
- Buddy must carry forward the relevant `NOTICE` content in its third-party notices.
- Apache 2.0 does not grant permission to use Anthropic's, Learning Commons', or a connector vendor's trademarks except for reasonable descriptive attribution.
- Apache 2.0 covers the repository content. It does **not** grant a right to use any vendor-hosted remote service contrary to that vendor's terms.

## Connector inventory and implementation status

### Summary matrix

| Connector | Purpose | Remote endpoint | Auth discovery | Buddy implementation status |
| --- | --- | --- | --- | --- |
| ASSISTments | Create, fetch, save, and assign standards-aligned auto-scored math problems | `https://mcp.assistments.org/mcp` | No connection-level OAuth observed | Technically ready; prebundle with OAuth disabled |
| Brisk Teaching | Create classroom activities, teaching resources, quizzes, podcasts, and related materials | `https://mcp.briskteaching.com/mcp` | OAuth DCR and CIMD, PKCE S256 | Technically ready through Buddy's existing DCR path |
| Canva | Create/edit/search/export designs and manage assets, folders, comments, and brand resources | `https://mcp.canva.com/mcp` | OAuth DCR and CIMD, PKCE | Best-supported third-party integration; technically ready |
| Coteach | Generate K-12 math diagrams such as tape diagrams, number lines, arrays, and fraction models | `https://coteach.ai/api/mcp` | OAuth DCR, PKCE S256 | Technically ready through Buddy's DCR path; must end-to-end test |
| Diffit | Create and adapt classroom-ready differentiated instructional resources | `https://api.diffit.me/mcp` | OAuth, but no DCR or CIMD advertised | Requires a vendor-issued client ID and likely client secret |
| Eedi | Retrieve/generate diagnostic math questions grounded in misconceptions | `https://teacher-tools.eedi.ai/mcp` | OAuth DCR, PKCE S256 | Technically ready through Buddy's DCR path; teacher-only constraint |
| MagicSchool | Make instructional content classroom-ready using MagicSchool workflows | `https://app.magicschool.ai/api/mcp` | OAuth, but no DCR or CIMD advertised | Requires a vendor-issued/pre-registered OAuth client |
| Snorkl | Read class context and progress/assignment information | `https://api.snorkl.app/mcp` | CIMD, PKCE S256, no DCR | Needs a Buddy HTTPS client metadata document or vendor client |
| TeachFX | Read lesson and transcript data for classroom-talk coaching | `https://api.teachfx.com/mcp` | CIMD, PKCE S256, no DCR | Needs a Buddy HTTPS client metadata document or vendor client; high privacy sensitivity |

`DCR` means OAuth Dynamic Client Registration. `CIMD` means Client ID Metadata Documents, where the OAuth `client_id` is an HTTPS URL containing the client's metadata. Existence of a DCR endpoint is strong technical evidence but not permission to market or redistribute a vendor connection. The research intentionally did not create external OAuth client registrations.

### ASSISTments

Endpoint:

```text
https://mcp.assistments.org/mcp
```

Observed on 2026-07-15:

- The endpoint redirects to a trailing-slash form when accessed with a simple GET.
- An MCP `initialize` POST succeeded with HTTP 200 and returned `text/event-stream` plus an `mcp-session-id`.
- A subsequent authenticated session-level `tools/list` returned these tools:
  - `assistments_check_connection`
  - `assistments_fetch_problem`
  - `assistments_save_problem`
- No server-level OAuth challenge was required to initialize and list tools.

Official ASSISTments documentation states:

- Teachers connect an ASSISTments MCP server to Claude.
- An ASSISTments account is required to create, save, and assign problems.
- Students do not interact with Claude through this integration.
- Student personally identifiable information is not transmitted through the MCP.

Buddy notes:

- Prebundle this remote with `oauth: false` unless later discovery introduces OAuth.
- Tool actions may still lead the teacher through ASSISTments account creation or application-level authorization.
- Preserve the teacher-facing and no-student-PII boundary in Buddy's description.
- This is an excellent first smoke-test connector because its MCP handshake works without browser auth.

Primary sources:

- [ASSISTments user guides and connector instructions](https://www.assistments.org/user-guides)
- [Anthropic's pinned MCP definition](https://github.com/anthropics/k12-teacher-skills/blob/7c03c83db8223b050b6569ffbe14cd94e229396e/plugin/.mcp.json)

### Brisk Teaching

Endpoint:

```text
https://mcp.briskteaching.com/mcp
```

Observed OAuth flow:

- Unauthenticated MCP initialization returns HTTP 401.
- The `WWW-Authenticate` header points to `https://mcp.briskteaching.com/.well-known/oauth-protected-resource/mcp`.
- The protected-resource metadata names `https://connect.briskteaching.com/` as its authorization server.
- Authorization-server metadata advertises:
  - Dynamic registration: `https://connect.briskteaching.com/oauth2/register`
  - `client_id_metadata_document_supported: true`
  - PKCE `S256`
  - Token auth methods `none`, `client_secret_post`, and `client_secret_basic`
  - Scopes `email`, `offline_access`, `openid`, and `profile`

Buddy notes:

- Buddy's current DCR implementation should be sufficient.
- Do a real test with a dedicated Brisk test account before shipping; this research did not register a client or authorize an account.
- Brisk may create Google Docs or Forms when the user's Google account is connected to Brisk. Make that downstream dependency visible.
- Treat returned activity/resource links as vendor-hosted artifacts.

Primary sources:

- [Brisk integration overview](https://www.briskteaching.com/how-brisk-integrates)
- [Brisk OAuth authorization-server metadata](https://connect.briskteaching.com/.well-known/oauth-authorization-server)
- [Anthropic Brisk connector page](https://claude.com/connectors/brisk-teaching)

### Canva

Endpoint:

```text
https://mcp.canva.com/mcp
```

Canva is the clearest officially documented third-party-assistant use case. Its documentation explicitly addresses teams building AI assistants, platforms, and connectors, not only Claude users.

Observed/documented OAuth behavior:

- Per-user authentication is required.
- Client ID Metadata Documents are recommended.
- Dynamic Client Registration remains available for compatibility.
- Authorization metadata advertises DCR at `https://mcp.canva.com/register` and `client_id_metadata_document_supported: true`.
- PKCE supports `plain` and `S256`; Buddy should use `S256`.
- Canva does not support organization-level/service-account authentication for this MCP. Each user must authorize their own Canva account.
- Permissions match the authorizing user's Canva resource permissions.

Observed protected-resource scopes include:

- `profile:read`
- `design:meta:read`
- `design:content:read`
- `design:content:write`
- `folder:read`
- `folder:write`
- `brandtemplate:content:read`
- `brandtemplate:meta:read`
- `brandtemplate:content:write`
- `comment:read`
- `comment:write`
- `asset:read`
- `asset:write`
- `brandkit:read`
- `help:answers:read`
- `help:answers:write`

Canva documents plan-dependent availability. Core design generation, editing, search, export, comments, and asset uploads are broadly available; resizing and enterprise brand/template operations may require paid plans.

Do not confuse two different Canva MCPs:

- `https://mcp.canva.com/mcp` is the remote end-user design-capability server Buddy wants.
- `npx -y @canva/cli@latest mcp` is Canva's local developer-assistance server for documentation, examples, and building Canva integrations. It is not a replacement for the design connector.

Buddy notes:

- This should be the reference implementation for a polished inbuilt remote-MCP onboarding flow.
- Use per-user OAuth; never attempt a shared Buddy service account.
- Review Canva's MCP usage policy and Developer Terms before public release.
- Show plan limitations without making Buddy responsible for Canva subscription state.

Primary sources:

- [Canva remote MCP documentation](https://www.canva.dev/docs/mcp/)
- [Canva MCP usage policy](https://www.canva.dev/docs/mcp/usage-policy/)
- [Canva OAuth troubleshooting and authentication notes](https://www.canva.dev/docs/mcp/troubleshooting/)
- [Canva developer MCP documentation](https://www.canva.dev/docs/connect/mcp-server/)

### Coteach

Endpoint:

```text
https://coteach.ai/api/mcp
```

Purpose and observed behavior:

- Creates classroom-ready K-12 math diagrams.
- Supports representations such as tape diagrams, number lines, arrays, area models, coordinate planes, and fraction models.
- Unauthenticated initialization returns HTTP 401 and standard protected-resource metadata.
- Authorization-server metadata advertises:
  - DCR at `https://coteach.ai/api/oauth/register`
  - PKCE `S256`
  - Public-client token auth method `none`
  - Scopes `openid`, `email`, `profile`, and `offline_access`

Buddy notes:

- Existing DCR should be sufficient, subject to an end-to-end registration/login test.
- The connector is marked interactive in Anthropic's directory; ensure Buddy correctly renders any MCP App/UI response instead of reducing it to text-only output.
- Confirm how generated images/diagrams are returned, persisted, and licensed for classroom reuse.

Primary sources:

- [Anthropic Coteach connector page](https://claude.com/connectors/coteach)
- [Coteach OAuth authorization-server metadata](https://coteach.ai/.well-known/oauth-authorization-server)

### Diffit

Endpoint:

```text
https://api.diffit.me/mcp
```

Purpose and observed behavior:

- Creates classroom-ready resources, scaffolds, translations, packets, activities, and differentiated materials.
- Resources are edited/exported in Diffit after generation.
- Diffit allows a limited guest path in its Claude integration before requiring sign-in.
- The endpoint redirects to the trailing-slash form and then returns an OAuth challenge.
- Authorization-server metadata advertises:
  - PKCE `S256`
  - Scope `diffit`
  - Token auth methods `client_secret_post` and `client_secret_basic`
  - No `registration_endpoint`
  - No `client_id_metadata_document_supported` flag

Buddy notes:

- Buddy cannot self-register against the currently advertised metadata.
- Contact Diffit for a production OAuth client ID, client secret, permitted loopback/deep-link redirect URIs, branding requirements, and distribution terms.
- Store any shipped client secret with the understanding that an Electron-embedded secret is recoverable. Prefer a public-client/PKCE registration or a Buddy-controlled backend exchange if Diffit supports it.
- Do not reuse or extract Claude's client credentials.

Primary sources:

- [Diffit in Claude](https://web.diffit.me/diffit-in-claude-for-k12)
- [Diffit OAuth authorization-server metadata](https://api.diffit.me/.well-known/oauth-authorization-server)

### Eedi

Endpoint:

```text
https://teacher-tools.eedi.ai/mcp
```

Purpose and observed behavior:

- Provides diagnostic mathematics questions grounded in known misconceptions.
- The integration is explicitly teacher-only.
- Unauthenticated initialization returns HTTP 401 and standard protected-resource metadata.
- Authorization-server metadata advertises:
  - DCR at `https://teacher-tools.eedi.ai/oauth/register`
  - PKCE `S256`
  - Scope `mcp`
  - Token auth methods `none` and `client_secret_post`

Buddy notes:

- Existing Buddy DCR should be sufficient, subject to an end-to-end test.
- Preserve the teacher-only constraint in availability, descriptions, prompts, and any future student-facing surfaces.
- Verify whether diagnostic-question content has attribution, display, modification, or export restrictions beyond ordinary account terms.

Primary sources:

- [Eedi Claude for Teachers announcement](https://www.eedi.com/news/eedi-collaborates-with-anthropic-on-claude-for-teachers-launch)
- [Eedi OAuth authorization-server metadata](https://teacher-tools.eedi.ai/.well-known/oauth-authorization-server)
- [Anthropic Eedi connector page](https://claude.com/connectors/eedi)

### MagicSchool

Endpoint:

```text
https://app.magicschool.ai/api/mcp
```

Observed OAuth behavior:

- Unauthenticated initialization returns HTTP 401.
- Protected-resource metadata points to `https://auth.magicschool.ai/auth/v1`.
- The authorization server is backed by Supabase and advertises OpenID Connect/OAuth endpoints.
- Metadata advertises PKCE `S256` and `plain`; Buddy should use `S256`.
- No dynamic registration endpoint is advertised.
- No Client ID Metadata Document support is advertised.
- The discovered issuer is the underlying Supabase issuer rather than the `auth.magicschool.ai` vanity URL. Treat this issuer/host distinction carefully in strict OAuth validation.

Buddy notes:

- Contact MagicSchool for a registered Buddy OAuth client and allowed redirect URI.
- Confirm whether the MCP is meant for general third-party clients or only Anthropic's directory partnership.
- Ask for the exact MCP tool contract, user/account prerequisites, rate limits, plan gating, and whether generated artifacts stay in MagicSchool.
- Do not reuse Anthropic's client registration.

Primary sources:

- [MagicSchool protected-resource metadata](https://app.magicschool.ai/.well-known/oauth-protected-resource)
- [MagicSchool authorization-server metadata](https://auth.magicschool.ai/auth/v1/.well-known/oauth-authorization-server)
- [Anthropic's MagicSchool customer story](https://claude.com/customers/magicschool)

### Snorkl

Endpoint:

```text
https://api.snorkl.app/mcp
```

Observed OAuth behavior:

- Unauthenticated initialization returns HTTP 401.
- Protected-resource metadata advertises resource `https://api.snorkl.app/mcp`.
- Advertised MCP version: `2025-11-25`.
- Scope: `classes:read`.
- Authorization metadata advertises:
  - `client_id_metadata_document_supported: true`
  - No DCR endpoint
  - PKCE `S256`
  - Token auth method `none`

Buddy notes:

- Publish a stable HTTPS OAuth Client ID Metadata Document for Buddy, likely under `https://hibuddy.in/`.
- Configure the inbuilt connector's `clientId` to that metadata-document URL.
- The document must describe Buddy, the exact callback URI, grant/response types, and public-client auth method expected by the server.
- The metadata URL must remain available for the lifetime of deployed Buddy versions.
- `classes:read` can expose student/class context. Complete a privacy and minimum-data review before release, even though the scope is read-only.
- Confirm whether the product returns individual student progress, recordings, submissions, or only aggregate class information.

Primary sources:

- [Snorkl protected-resource metadata](https://api.snorkl.app/.well-known/oauth-protected-resource)
- [Snorkl authorization-server metadata](https://api.snorkl.app/.well-known/oauth-authorization-server)
- [Snorkl roles, permissions, and data sharing](https://help.snorkl.app/en/articles/13336906-roles-permissions-and-data-sharing)

### TeachFX

Endpoint:

```text
https://api.teachfx.com/mcp
```

Observed OAuth behavior:

- Unauthenticated initialization returns HTTP 401.
- Protected-resource metadata advertises:
  - `mcp:lessons:read`
  - `mcp:transcripts:read`
- Authorization metadata advertises:
  - `client_id_metadata_document_supported: true`
  - No DCR endpoint
  - PKCE `S256`
  - Token auth methods `none`, `client_secret_post`, and `client_secret_basic`

Buddy notes:

- Use the same stable Buddy HTTPS client-metadata strategy as Snorkl, subject to TeachFX accepting the metadata document and loopback callback.
- Classroom transcripts may contain student voices, names, sensitive discussion, disability information, or other educational records. This is the highest-sensitivity connector in the initial set.
- Default to the minimum scopes needed and make transcript access explicit in consent UI.
- Do not automatically pass transcript contents into unrelated tools or durable memories.
- Document where model processing occurs and whether transcript content is retained by Buddy, the model provider, TeachFX, or any downstream MCP.

Primary sources:

- [TeachFX protected-resource metadata](https://api.teachfx.com/.well-known/oauth-protected-resource/mcp)
- [TeachFX authorization-server metadata](https://api.teachfx.com/.well-known/oauth-authorization-server)
- [Anthropic's Claude for Teachers workflow demonstration](https://claude.com/resources/tutorials/claude-for-teachers-in-action)

## Learning Commons Knowledge Graph: the recommended tenth MCP

Anthropic's open teacher skills are designed to work with the Learning Commons Knowledge Graph. It is more important to the standards-alignment story than any single generation/export connector.

Endpoint:

```text
https://kg.mcp.learningcommons.org/mcp
```

Authentication:

```text
x-api-key: USER_SUPPLIED_API_KEY
```

or:

```text
Authorization: Bearer USER_SUPPLIED_API_KEY
```

The user generates an API key in the Learning Commons Platform. Do not ship a shared Buddy API key unless a separate commercial arrangement explicitly permits and meters that use.

The documented MCP tools cover:

- Finding an academic standard statement.
- Breaking a standard into granular learning components.
- Finding backward or forward learning progressions from a standard.

The Claude directory describes the connector as covering standards across all 50 US states, granular skills, and learning progressions. The open skills can run without it but deliberately downgrade their claims and add a disclosure.

Learning Commons licensing is unusually integration-friendly:

- Knowledge Graph code: MIT.
- Knowledge Graph data: CC BY 4.0.
- State standards source permission/attribution: 1EdTech under CC BY 4.0.
- Learning components: Achievement Network under CC BY 4.0.
- Learning progressions: Student Achievement Partners under CC0.

Buddy must preserve required attribution and review the current Terms of Use in addition to the open licenses.

Primary sources:

- [Learning Commons MCP server documentation](https://docs.learningcommons.org/knowledge-graph/using-knowledge-graph/mcp-server)
- [Learning Commons license](https://docs.learningcommons.org/knowledge-graph/resources/license)
- [Anthropic Learning Commons connector page](https://claude.com/connectors/learning-commons-knowledge-graph)

## Buddy's existing MCP capabilities

Buddy already has most of the required runtime behavior through the vendored OpenCode MCP client and Buddy's adapter/UI layers.

### Remote transports

`vendor/opencode/packages/opencode/src/mcp/index.ts`:

- Constructs a remote URL from MCP configuration.
- Creates an OAuth provider unless OAuth is explicitly disabled.
- Attempts `StreamableHTTPClientTransport` first.
- Falls back to `SSEClientTransport`.
- Passes configured request headers to both transports.
- Distinguishes ordinary auth-needed state from a server that requires a pre-registered client ID.

### OAuth client behavior

`vendor/opencode/packages/opencode/src/mcp/oauth-provider.ts`:

- Uses `http://127.0.0.1:19876/mcp/oauth/callback` by default.
- Accepts explicit `clientId`, `clientSecret`, scope, callback port, and redirect URI.
- Supplies authorization-code and refresh-token grant metadata.
- Uses the public-client token method `none` when there is no client secret.
- Persists dynamically registered client information per MCP name and server URL.
- Persists access/refresh tokens, expiry, PKCE verifier, and OAuth state.
- Invalidates client or token credentials independently.

`packages/opencode-adapter/src/mcp-oauth-branding.ts` changes upstream OpenCode metadata to:

- Client name: `Buddy`
- Client URI: `https://hibuddy.in`
- Logo URI: `https://hibuddy.in/apple-touch-icon.png`

It also brands the local callback result page as Buddy.

### Configuration UI

`packages/web/src/components/mcp-dialog/mcp-remote-fields.tsx` already exposes:

- Remote MCP URL.
- Browser sign-in toggle.
- Optional headers JSON.
- Advanced client ID/client secret fields.

### Known gap: first-class CIMD publication

Buddy can accept an explicit client ID, so it can technically set the client ID to a CIMD HTTPS URL. However, Buddy does not currently publish and lifecycle-manage a public OAuth Client ID Metadata Document as a first-class product artifact.

For Snorkl and TeachFX, add a stable document such as:

```json
{
  "client_id": "https://hibuddy.in/.well-known/oauth-client.json",
  "client_name": "Buddy",
  "client_uri": "https://hibuddy.in",
  "logo_uri": "https://hibuddy.in/apple-touch-icon.png",
  "redirect_uris": [
    "http://127.0.0.1:19876/mcp/oauth/callback"
  ],
  "grant_types": [
    "authorization_code",
    "refresh_token"
  ],
  "response_types": [
    "code"
  ],
  "token_endpoint_auth_method": "none"
}
```

Treat this as an illustrative draft, not a final deployed document. Validate the current CIMD specification, server requirements, metadata content type, redirect rules, and whether `client_id` must appear in the document before shipping.

The fixed callback port also deserves a reliability review for port collisions and concurrent auth attempts. A product-level metadata document must remain compatible with all supported Buddy versions that use it.

## Proposed Buddy architecture

Model the K-12 package as a Buddy **feature**, because a feature is the authoring/access grouping unit that can own tools, skills, subagents, and surfaces.

Suggested feature contents:

- Inbuilt remote MCP descriptors for the nine vendor connectors.
- Learning Commons Knowledge Graph descriptor.
- Adapted `k12-lesson-planning` skill.
- Adapted `k12-lesson-differentiation` skill.
- The relevant eval rubrics and a Buddy-compatible eval harness.
- Optional teacher-specific UI copy and privacy warnings.
- No connector enabled by default.

Suggested descriptor type, conceptually:

```ts
type InbuiltRemoteMcp = {
  id: string
  displayName: string
  description: string
  url: string
  auth:
    | { type: "none" }
    | { type: "oauth-dynamic"; scopes?: string[] }
    | { type: "oauth-cimd"; clientId: string; scopes?: string[] }
    | { type: "oauth-pre-registered"; clientId: string; scopes?: string[] }
    | { type: "api-key"; header: "Authorization" | "x-api-key" }
  documentationUrl: string
  privacyUrl?: string
  termsUrl?: string
  dataSensitivity: "content" | "account" | "class" | "student-record" | "transcript"
  attribution?: string[]
  availability: "ready" | "partner-required" | "disabled"
}
```

Do not copy this type without reconciling it with Buddy's existing feature/config vocabulary. The important design point is to keep catalog metadata, activation state, runtime configuration, credentials, and feature ownership separate.

Avoid hard-coding catalog behavior independently in the backend and web app. Define one shared typed source from which the configuration adapter and UI are derived.

## Rollout recommendation

### Phase 1: no new auth mechanism

Prebundle these as opt-in presets and run end-to-end tests:

1. ASSISTments
2. Brisk Teaching
3. Canva
4. Coteach
5. Eedi
6. Learning Commons with a user-provided API key

These cover no-auth, DCR, rich design output, math visuals, diagnostic content, and standards grounding.

### Phase 2: publish Buddy CIMD metadata

Add:

1. Snorkl
2. TeachFX

Require privacy review before enabling them in a public build. TeachFX should not be the first connector used to validate the CIMD implementation because transcript data is high sensitivity.

### Phase 3: vendor-issued OAuth clients

Contact and then add:

1. Diffit
2. MagicSchool

Questions for each vendor:

- May Buddy list and preconfigure your MCP endpoint in a commercial desktop application?
- Is the MCP intended to be interoperable with non-Claude clients?
- Can you issue Buddy a public OAuth client that uses PKCE and a loopback redirect?
- If a secret is required, is there a supported desktop/public-client alternative?
- What redirect URIs, client names, logos, and support URLs must be registered?
- Which plans/accounts can use the MCP?
- What are the tool list, rate limits, usage limits, and breaking-change policy?
- What user and student data can each tool read or write?
- What privacy policy, DPA, FERPA/COPPA terms, and subprocessors apply?
- Are there branding, attribution, or marketplace-listing requirements?
- Is there a test/sandbox tenant?

## Privacy, safety, and reliability requirements

These connectors run on third-party infrastructure. Buddy being local-first does not make MCP calls local.

Before public release:

- Show the vendor, endpoint, requested scopes, and data categories before connection.
- Do not imply that Buddy's privacy policy supersedes the connector vendor's policy.
- Use least-privilege scopes.
- Keep every connector disabled until explicitly activated.
- Require confirmation before write/create/publish/assign actions where consequences are externally visible.
- Do not automatically pass data from one MCP to another merely because both are enabled.
- Do not store student records or transcripts in durable memory by default.
- Redact tokens and authorization codes from logs and transcripts.
- Bind cached OAuth tokens and DCR clients to the exact MCP URL.
- Provide disconnect/revoke behavior and explain whether vendor-side revocation also occurs.
- Handle server downtime, expired tokens, revoked consent, changed tool schemas, and partial streaming predictably.
- Fetch `tools/list` dynamically and refresh after schema-related failures; do not freeze vendor tool schemas into prompts.
- Treat MCP App/UI content as untrusted third-party content with a strict sandbox and origin policy.
- Ensure every desktop/auth path works on both macOS and Windows.

Sensitivity notes:

- ASSISTments states that student PII does not pass through its MCP.
- Canva primarily handles the teacher's designs and assets, but designs can themselves contain student information.
- Eedi is explicitly teacher-only.
- Snorkl can expose class context and potentially student work/progress.
- TeachFX transcript access is high sensitivity and may include student voices and educational records.
- MagicSchool and Brisk can create classroom artifacts and may integrate with other school/Google systems.

The initial product should focus on teacher-authored content and standards grounding before ingesting student-level data.

## Legal and product-boundary checklist

Apache 2.0 permits adapting Anthropic's repository, but the following remain separate:

- Each vendor's service terms.
- Each vendor's privacy policy and DPA.
- Trademark/logo usage.
- Connector-specific content licenses.
- Generated-artifact ownership and classroom reuse rights.
- API/MCP rate limits and commercial-use rules.
- Learning Commons data attribution under CC BY 4.0.
- Illustrative Mathematics and OpenSciEd content rights.

Do not market the feature as "Claude for Teachers" or imply Anthropic sponsorship. Use a Buddy-owned name and describe upstream inspiration/attribution accurately.

## Verification performed for this research

The research used only unauthenticated, read-only protocol discovery. It did not authorize a user, register OAuth clients, invoke vendor write tools, or create external artifacts.

Checks performed:

- Read Anthropic's Claude for Teachers announcement and linked partner pages.
- Inspected the public `anthropics/k12-teacher-skills` repository tree, pinned commit, manifests, `.mcp.json`, license, NOTICE, skills, scripts, and eval layout.
- Queried the official MCP Registry for the nine product names. No authoritative first-party entries for these specific servers were found there; Anthropic's plugin and the vendor endpoints are the better sources.
- Sent MCP `initialize` requests without credentials to every published endpoint.
- Followed standard `WWW-Authenticate` protected-resource metadata links.
- Read OAuth authorization-server discovery metadata.
- Successfully initialized ASSISTments and listed its MCP tools.
- Inspected Buddy's current remote MCP transport, OAuth provider, branding adapter, and configuration UI.

Expected unauthenticated endpoint behavior at the research date:

- ASSISTments: initialization succeeds.
- Other eight: initialization returns an OAuth challenge rather than a nonexistent/non-MCP response.

This confirms protocol presence, not end-to-end account compatibility.

## Revalidation procedure before implementation

1. Pull the latest upstream repository metadata and compare it with pinned commit `7c03c83db8223b050b6569ffbe14cd94e229396e`.
2. Diff `plugin/.mcp.json`, `plugin/.claude-plugin/plugin.json`, both `SKILL.md` files, referenced files, `LICENSE`, and `NOTICE`.
3. Recheck each endpoint's protected-resource and authorization-server metadata.
4. Confirm whether DCR/CIMD support changed.
5. Read the current MCP OAuth specification, especially CIMD requirements.
6. Run end-to-end OAuth with dedicated test accounts for every connector Buddy intends to mark ready.
7. Record actual `tools/list` results after authorization and classify read/write/external-effect behavior.
8. Test auth callback and token refresh on macOS and Windows.
9. Review current vendor terms/privacy documentation and save the review date.
10. Run the adapted Anthropic eval rubrics against Buddy's chosen model(s) with and without Learning Commons.

Useful primary links:

- [Claude for Teachers announcement](https://www.anthropic.com/news/claude-for-teachers)
- [Anthropic K-12 skills repository](https://github.com/anthropics/k12-teacher-skills)
- [Pinned upstream MCP configuration](https://github.com/anthropics/k12-teacher-skills/blob/7c03c83db8223b050b6569ffbe14cd94e229396e/plugin/.mcp.json)
- [Pinned upstream license](https://github.com/anthropics/k12-teacher-skills/blob/7c03c83db8223b050b6569ffbe14cd94e229396e/LICENSE)
- [Pinned upstream NOTICE](https://github.com/anthropics/k12-teacher-skills/blob/7c03c83db8223b050b6569ffbe14cd94e229396e/NOTICE)
- [Anthropic connector documentation](https://claude.com/docs/connectors/overview)
- [Learning Commons MCP server](https://docs.learningcommons.org/knowledge-graph/using-knowledge-graph/mcp-server)

## Implementation completion criteria

Do not call the prebundle complete merely because the URLs appear in settings. Completion requires:

- One typed inbuilt-MCP source of truth.
- Explicit feature ownership and opt-in activation.
- Working connection, reconnect, token refresh, disconnect, and failure recovery.
- DCR, CIMD, API-key, and vendor-client paths covered as applicable.
- Current documentation/privacy/terms links in UI.
- Scope and data-sensitivity disclosure.
- No secrets in source, logs, generated SDKs, or frontend state.
- macOS and Windows auth tests.
- Tool discovery and representative safe read/write tests for each enabled connector.
- MCP App sandbox verification for interactive connectors.
- License and NOTICE attribution for adapted Anthropic/Learning Commons material.
- Relevant package tests plus repository-root `bun lint` and `bun typecheck` passing.
- `bun fmt` only after the implementation is complete and accepted, per repository policy.

