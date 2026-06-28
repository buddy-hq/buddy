# Advanced Math Design Direction

## Status

This document captures the intended redesign direction for Advanced Math.

It does not describe the current implementation as the desired end state.

## Core intent

Advanced Math should stop being a special backend/runtime capability with its own dedicated product path.

The long-term direction is to replace that model with a full skill package, similar in spirit to the PPTX skill.

This means Advanced Math should not be treated as:

- a dedicated binary-backed tool
- a release artifact pipeline
- a download/build/upload/install product subsystem
- a toggle-driven runtime feature in Settings

Instead, it should become a skill-centered capability.

## What the replacement should be

The replacement is not an `install-math` helper skill.

The replacement is a complete Advanced Math skill package that owns the full capability end to end.

That skill package should define:

- when the capability should trigger
- how the agent should approach advanced math tasks
- what dependencies are needed
- how those dependencies should be installed locally
- how the agent should use Python and shell tools directly
- how plots, images, tables, and derived outputs should be produced
- how outputs should be shown through Buddy's existing artifact, bench, and presentation surfaces
- what quality guidance and workflow expectations apply

In other words, the skill should own both:

- bootstrap and dependency guidance
- the actual math workflow and output guidance

## Why move away from the current model

The current model is too deterministic and too infrastructure-heavy for what this capability needs.

Today the flow is effectively:

1. Build a dedicated runtime
2. Upload release assets
3. Download/install that runtime
4. Route math execution through a dedicated binary-backed tool

That design adds too much product and release complexity for a capability that can likely live as a normal skill-driven workflow on a single-user, single-machine Buddy install.

## Intended architecture change

The intended direction is to remove the dedicated advanced math tool path entirely.

That means we should plan to remove:

- the binary-backed math calculator / advanced-math execution path
- the dedicated local runtime install service
- the release-asset dependency for math support
- the idea that this capability needs its own special runtime product surface

The agent should instead use the normal tools it already has, especially shell/bash, and follow the skill's instructions and references to set up and execute the work locally.

## Relationship to existing skills

The PPTX skill is the model for the shape of the capability, not because it only installs dependencies, but because it is a full package:

- trigger rules
- workflow
- design guidance
- QA guidance
- dependency expectations
- concrete command patterns

Advanced Math should be redesigned in the same spirit.

## Short-term product implication

Until that redesign exists, Advanced Math on Windows should remain `Coming soon`.

We should not continue investing in the current Windows runtime/install path if the longer-term plan is to replace the whole dedicated runtime model.

## Non-goal

The goal is not to preserve the current math tool and merely improve installation.

The goal is to replace the current special-cased tool/runtime architecture with a skill-centered capability design.
