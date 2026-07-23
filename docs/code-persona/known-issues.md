# Code Persona Known Issues

The Code persona is a development-only persona. The issues below are known limitations and are not
release blockers under Buddy's normal desktop channel isolation.

## Persisted development sessions can bypass production availability

Status: Open, low-priority hardening.

Production hides the Code persona from the catalog and rejects new requests that explicitly target
it. A session created in development can still retain `code` in its stored teaching-session state,
however, and the resumed-session targeting path does not re-check whether that persona is hidden.

Under the normal Electron setup, development and production use separate app identities and
storage, so ordinary production users cannot create or encounter this state. It can matter when
session data is deliberately shared across channels through custom data paths, database copying,
restores, migrations, or direct backend deployments.

A future hardening pass should treat channel availability separately from user-configured
visibility and reject or fall back to a production persona when a stored persona is unavailable.

## Persona prompt tests depend on the release-channel environment

Status: Open, test-maintenance cleanup.

The Code persona prompt tests pass in the default development environment but fail when the test
process runs with `BUDDY_CHANNEL=prod`. In that environment, Code is correctly hidden while the
tests still expect it to appear in the catalog and accept explicit targeting.

This does not affect application behavior. It can make release validation environment-dependent if
CI runs those tests with a production channel.

A future cleanup should explicitly pin development availability for development-specific tests and
keep separate coverage proving that production rejects the Code persona.
