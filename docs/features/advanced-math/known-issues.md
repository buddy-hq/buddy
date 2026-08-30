# Advanced Math Known Issues

## Windows status

Advanced Math on Windows remains `Coming soon` in Settings instead of exposing an install toggle.

## Decision and build-time evidence

Testing the Windows runtime build locally on a slow machine showed an unacceptable install experience:

- The machine lacked Python, requiring a bootstrap install of Python 3.12.
- Local runtime build took 9 to 10 minutes creating the virtualenv, downloading packages, and running PyInstaller.
- The build failed during archive creation because `Compress-Archive` was brittle on this machine.
- Even if fixed, a 10-minute wait on a slow machine is not a shippable end-user experience.

Until prebuilt assets or a skill package replace the local build path, Windows should:

- show `Coming soon` in Settings;
- avoid prompting users to build or install the runtime locally;
- avoid exposing a toggle leading to long waits or unreliable setup.

## Prerequisites for revisiting Windows

Restoring Windows support requires:

- prebuilt Windows runtime assets published with releases (or a pure skill package);
- no requirement for end users to bootstrap Python locally;
- a fast, reliable install experience on low-resource machines.

## Current macOS runtime UX issue

On macOS, where the Advanced Math runtime can still be installed, the install and remove flow does not surface live progress well in the Settings UI.

What happens today:

- the backend tracks progress percent and progress messages
- the install or remove request stays in flight until the whole task finishes
- the UI can look stuck instead of showing continuous download, build, or removal progress

This is the same product issue class as the Standards runtime flow and should be treated as unfinished UX.
