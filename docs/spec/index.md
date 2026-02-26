# buddy

## features

- user open buddy into a buddy root folder.
- the buddy root has all the notebooks.

### notebooks

- each notebook is its own learning space.
- each notebook has its own memories.

### memories

- memories can be about global, or notebook specific.
- buddy can tap into memories to steer the learning.
- buddy can create memories.local.md file, memories.global.md file, or memory.x.md file for any other specific memories.

### curriculum

- buddy can create curriculums for users.
- users can configure the curriculum but like a config files, they may never be aware of it's existence.
- buddy can CRUD the curriculum.
- curriculum is stored in curriculum.md file.

## apps

- buddy can create apps to teach
- buddy prefers react apps with bun runtime when building interactive apps

## buddy is adaptive

 <!-- - __  i don't know what this means for now __ -->

---

## spec

buddy is a local agent that helps you learn anything.

### agent

- buddy is local. that means the agent loop runs locally and only uses the web for ai api calls.
- buddy is configurable. buddy has good defaults but is fully configurable with config files.
- buddy respects buddy.md file.
- buddy scopes the projects into notebooks.
- buddy has access to tools.
- buddy can connect with mcp servers.
- buddy works only with an api key.
- buddy can spin up opencode when it needs to code.
  - this may lead to buddy being able to spin up more agents.
  - for now opencode is enough, later it may spin up claude code, codex, or any other cli agent that helps it with its work.

### interface

- buddy has a chat interface.
- buddy displays tool use to the users.
- buddy displays thinking to the user.

#### sidebars

- buddy has sidebars.
- left sidebar displays chats grouped by sessions.
- right sidebar displays any 2nd level content that the agent produces.
  - if buddy produces a thought, you can click it and see th whole though and calls in detail.
  - if buddy produces a doc, you can see the wholes doc on the right sidebar.
  - if buddy codes up a quiz using opencode, it displays the quiz in the right sidebar.

### anti-specs

- buddy does not have sync.
- buddy does not have oauth.

---
