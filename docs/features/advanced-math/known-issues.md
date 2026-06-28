# Advanced Math Known Issues

## Windows status

For now, Advanced Math on Windows should remain `Coming soon` in the app instead of exposing an install toggle.

## Why we are not enabling it right now

We tested the Windows runtime build locally on a real slow Windows machine and the experience was not acceptable for end users.

What we observed:

- The machine did not have Python installed, so setup had to start with installing Python 3.12.
- After Python was available, the local runtime build still spent around 9 to 10 minutes creating the virtualenv, downloading Python packages, and running PyInstaller.
- The build reached the final packaging stage but then failed while creating the ZIP archive because the current Windows archive step relies on `Compress-Archive`, which was brittle on this machine.
- Even if the archive step is fixed, making Windows users wait around 10 minutes on a slow machine is not a shippable install experience.

## Current product decision

Do not enable Advanced Math installation on Windows yet.

Until we have a better approach, Windows should:

- show `Coming soon` in Settings
- avoid prompting users to build or install the runtime locally
- avoid exposing a toggle that leads to long waits or unreliable setup

## Current macOS runtime UX issue

On macOS, where the Advanced Math runtime can still be installed, the install and remove flow does not surface live progress well in the Settings UI.

What happens today:

- the backend tracks progress percent and progress messages
- the install or remove request stays in flight until the whole task finishes
- the UI can look stuck instead of showing continuous download, build, or removal progress

This is the same product issue class as the Standards runtime flow and should be treated as unfinished UX.

## What needs to change before we revisit this

We should only restore Windows support when we have a faster and more reliable path, such as:

- prebuilt Windows runtime assets published with releases
- no requirement for end users to bootstrap Python locally
- a packaging flow that is reliable on Windows
- an install experience that is acceptable on slow machines
