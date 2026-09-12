# Agent hooks

The committed hooks only format edited JavaScript/TypeScript files with the installed oxfmt. They never install dependencies, run builds/full tests, switch/delete branches, fetch, or create review loops. Run those task operations explicitly when required by [verification.md](verification.md) and the user's scope.

| App | Entry point | Edit event |
|---|---|---|
| Codex | `.codex/hooks.json` | `PostToolUse` matching `apply_patch` |
| Cursor | `.cursor/hooks.json` | `afterFileEdit` |
| Claude Code | `.claude/settings.json` | `PostToolUse` matching `Edit`, `Write`, or `MultiEdit` |

Each wrapper invokes `scripts/agent-hooks/format.mjs`. The parser handles each app's payload, uses the tool working directory for relative paths, checks final symlinks stay inside the checkout, and ignores failed/deleted/irrelevant edits. It passes paths as arguments with an eight-second timeout and Corepack network access disabled. Missing formatter dependencies are a no-op; formatter errors are reported without blocking an edit. Command launches use the declared `cross-spawn` dependency for platform shims and argument escaping; shell wrappers still require Bash support on Windows.

Validate changes with `yarn ai-workflow:check` and `yarn ai-workflow:test`. A fixture/schema check does not establish that a given app version loads the hooks. Inspect its hook settings after an upgrade; follow the app's project-trust/hook review requirements and reload an existing session when needed. Do not bypass trust settings to make a check pass. Claude uses `settings.json`, not Cursor's hook schema in a `.claude/hooks.json` file.

Native references: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Cursor hooks](https://cursor.com/docs/hooks), [Claude hooks](https://code.claude.com/docs/en/hooks).
