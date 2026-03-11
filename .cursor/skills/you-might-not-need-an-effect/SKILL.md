---
name: you-might-not-need-an-effect
description: Analyze code for useEffect anti-patterns and refactor to simpler alternatives. Use when the user says "you might not need an effect", "check effects", "useEffect audit", or asks to review useEffect usage.
disable-model-invocation: true
---

# You Might Not Need an Effect

Analyze code for `useEffect` anti-patterns and refactor to simpler, more correct alternatives.

Based on https://react.dev/learn/you-might-not-need-an-effect

## Arguments

- **scope**: what to analyze (default: uncommitted changes). Examples: `diff to main`, `src/hooks/`, `whole codebase`
- **fix**: whether to apply fixes (default: `true`). Set to `false` to only propose changes.

## Workflow

1. **Determine scope** — get the relevant code:
   - Default: `git diff` for uncommitted changes
   - If a directory/file is specified, read those files
   - If "whole codebase": search all `.ts` files for `useEffect`

2. **Scan for anti-patterns** — check each `useEffect` against the patterns below

3. **Fix or propose** — depending on the `fix` argument:
   - `fix=true`: apply the refactors, then verify with `yarn build`
   - `fix=false`: list each anti-pattern found with a before/after code suggestion

4. **Report** — summarize what was found and changed

## Anti-Patterns to Catch

### 1. Deriving state during render (no effect needed)

If you're computing something from existing props or state, calculate it during render.

```typescript
// ❌ Anti-pattern
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(firstName + ' ' + lastName);
}, [firstName, lastName]);

// ✅ Fix — derive during render
const fullName = firstName + ' ' + lastName;
```

### 2. Caching expensive calculations (useMemo, not useEffect)

```typescript
// ❌ Anti-pattern
const [filtered, setFiltered] = useState([]);
useEffect(() => {
  setFiltered(items.filter(item => item.active));
}, [items]);

// ✅ Fix — calculate during render (useMemo only if profiling shows it's needed)
const filtered = items.filter(item => item.active);
```

### 3. Resetting state when props change (use key, not useEffect)

```typescript
// ❌ Anti-pattern
useEffect(() => {
  setComment('');
}, [postCid]);

// ✅ Fix — use key on the component to reset state
<CommentForm key={postCid} />
```

### 4. Syncing with external stores (use Zustand selectors)

```typescript
// ❌ Anti-pattern
const [data, setData] = useState(null);
useEffect(() => {
  const unsub = someStore.subscribe((s) => setData(s.data));
  return unsub;
}, []);

// ✅ Fix — use the Zustand store directly
const data = useSomeStore((s) => s.data);
```

### 5. Initializing global singletons (use module scope or lazy init)

```typescript
// ❌ Anti-pattern
useEffect(() => {
  initializeSomething();
}, []);

// ✅ Fix — module-level init (runs once on import)
if (typeof window !== 'undefined') {
  initializeSomething();
}
```

## Project-Specific Context

This is a hooks library, not an app. Effects in this codebase are more likely to be legitimate (subscribing to plebbit-js events, managing store listeners) than in a typical React app. Be extra careful before removing effects that manage subscriptions or event listeners with cleanup functions.

| Pattern | Likely legitimate |
|---------|------------------|
| Store subscription with cleanup | Yes — keep |
| plebbit-js event listener with cleanup | Yes — keep |
| Deriving state from other state | No — compute during render |
| Setting state from props | No — derive or use key |
| One-time initialization | Maybe — consider module scope |

## When useEffect IS Appropriate

Not every effect is wrong. Keep `useEffect` for:
- Subscribing to plebbit-js events with proper cleanup
- Managing Zustand store subscriptions with cleanup
- Synchronizing with browser APIs (resize, intersection observer, etc.)
- Running code on mount that genuinely has no alternative
