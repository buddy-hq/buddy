# Security

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/buddy-hq/buddy/security/advisories/new). It opens a private thread that only the maintainer can read, so nothing is public while a fix is being written.

That form is the only reporting channel. There is no security email address, so please don't go looking for one.

Please do not open a public issue for a security bug. Buddy ships as a desktop app with an auto-update channel, so a public report reaches users who have not updated yet before a fix can reach them.

## What to include

A description of the problem and the steps to reproduce it. If you have a proof of concept, include it. Tell us which version you tested, which you can find under Buddy > About, or in the filename of the installer you ran.

## What to expect

Buddy is maintained by one person. You will get a reply within a week, usually sooner. If the report is valid, you will hear about the fix before it ships, and you will be credited in the advisory unless you ask not to be.

There is no bug bounty.

## Scope

Buddy's own code lives outside `vendor/`. That is what this policy covers.

Everything under `vendor/opencode/` is a vendored copy of [OpenCode](https://github.com/sst/opencode), tracked upstream and not modified here. Report bugs in that code to OpenCode directly. If a vendored bug is reachable through Buddy in a way upstream would not hit, tell us too, and we will coordinate.

## Design context that affects severity

Buddy is single-user and single-machine by design. One OS user, one home directory of state, one active set of credentials. There are no accounts, no roles, and no permission boundaries between users, so a finding that assumes multi-tenant isolation does not apply.

The agent loop usually runs locally on the machine that launched it. Buddy is not local-only: it makes network calls for model providers, web search, MCP servers, third-party APIs, auth, remote config, and remote agent connections. Credentials for those live in the user's home directory.

Buddy runs model-authored code and reads untrusted content, which is inherent to what it does rather than a vulnerability in itself. What we do want to hear about is anything that escapes the boundaries we intended: sandbox escapes, a tool reaching state it was not scoped to, prompt injection that reaches a real side effect such as writing outside the workspace or exfiltrating credentials, and anything touching the release signing or update path.
