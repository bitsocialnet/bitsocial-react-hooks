---
name: vercel-react-best-practices
description: Apply relevant Vercel React guidance to this hooks library when reviewing a changed React flow or investigating a performance concern.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# Vercel React Guidance for This Library

Select rules for the affected behavior; do not load the entire compiled `AGENTS.md` or run every rule as a checklist. The bundled reference is an upstream React/Next.js guide, while this repository implements public React hooks and Zustand stores for protocol clients.

Useful starting points when relevant:

- Derived state or effect synchronization: [derived state](rules/rerender-derived-state-no-effect.md), [event logic](rules/rerender-move-effect-to-event.md).
- Render/subscription cost: [defer reads](rules/rerender-defer-reads.md), [simple expressions](rules/rerender-simple-expression-in-memo.md), [transient values](rules/rerender-use-ref-transient-values.md).
- Repeated browser work: [event listeners](rules/client-event-listeners.md), [passive listeners](rules/client-passive-event-listeners.md).
- Bundle or async bottlenecks: [barrel imports](rules/bundle-barrel-imports.md), [independent async work](rules/async-parallel.md).

Read other `rules/` files only when their topic applies. Skip Next.js, Server Components, server caching, server actions, and hydration guidance unless the affected library behavior makes them relevant. Do not introduce SWR, Next.js APIs, manual memoization, or a new dependency merely because an upstream example uses it. Adapt examples to the supported React peer versions and existing store/subscription lifecycles. Development React versions do not change the package compatibility contract. Do not remove required subscription effects, deduplication, or memoized selectors without understanding their role. Public barrel exports in `src/index.ts` are the supported package API, not automatically an optimization defect.

Establish a correctness or measured performance reason for a change, preserve error handling and accessibility, and verify the affected behavior under `docs/agent-playbooks/verification.md`. Treat reference priorities as triage guidance rather than mandatory refactor targets. Licensed upstream rule files and their attribution remain intact.
