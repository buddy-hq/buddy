---
title: Avoid Barrel File Imports
impact: CRITICAL
impactDescription: 200-800ms import cost, slower builds
tags: bundle, imports, tree-shaking, barrel-files, performance
---

## Avoid Barrel File Imports

Import directly from source files instead of large barrel exports to avoid loading many unused modules.

**Why this matters:** Some UI and icon packages expose thousands of re-exports from a single entrypoint. Even when only a few symbols are used, resolving the barrel can add meaningful dev-start, cold-start, and bundling overhead.

**Incorrect (imports entire library barrel):**

```tsx
import { Check, X, Menu } from 'lucide-react'
import { Button, TextField } from '@mui/material'
```

**Correct (explicit deep imports):**

```tsx
import Check from 'lucide-react/icons/check'
import X from 'lucide-react/icons/x'
import Menu from 'lucide-react/icons/menu'

import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
```

If your bundler supports package-import optimization, use it to preserve ergonomic imports while compiling to direct module paths.

> **Type safety note:** Verify deep-import type definitions are published by the package before switching. Keep strict TypeScript guarantees intact.
