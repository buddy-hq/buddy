# Guidelines for Building and Extending the buddy ebook/document reader

## Components

`packages/web/src/components/readers`

## Route

`packages/web/src/components/directory-chat/directory-chat-reading-reader-pane.tsx`

## Libary

- foliate js

## References

library: `~/code/foliate-js`
frontend: `~/code/foliate`

## Guidelines

- build features by analogy, not by first principles. analogize from the references and implment the code in buddy.
- never invent patterns without looking up how they are implemented in the references.
- never make design decisions without looking up how they are implemented in the references.
- for api reference use `~/code/foliate-js`
- for behavior and architecture reference use `~/code/foliate`
- for UI reference use `~/code/foliate`

## Constraints

- Buddy uses `foliate-js`, not GPL Foliate app code.
- The Foliate app is valid as a behavior and architecture reference, not as copy-paste source.
- Buddy's own workspace does include the `foliate-js` public API surface that we consume, via [foliate-js.d.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/foliate-js.d.ts) and [foliate-reader.tsx](/Users/prashantbhudwal/Code/buddy/packages/web/src/components/readers/foliate-reader.tsx).
- The local upstream Foliate app checkout is still missing its vendored `src/foliate-js` submodule contents, so this inventory can verify Foliate app-shell behavior directly, and can verify the `foliate-js` public surface as consumed by Buddy, but cannot attribute deeper engine internals to the upstream app checkout beyond that.

## Workflow

1. understand the user intent and features they want you to add.
2. check how the feature is implemented in the references.
3. check if we have already done the types and wiring needed for the feature.
4. if not, do the types and wiring needed for the feature.
5. implement the feature by analogy to the references.

use `.agents/skills/buddy-frontend` for guidance on how to do things in buddy.

## Gotchas

1. if you are unsure about any decision, ask the user for clarification.
2. if something is not implemented in the references, or can't be solved with an established pattern, ask the user for clarification.
