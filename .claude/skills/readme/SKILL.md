---
name: readme
description: Create or edit requested README content while verifying package API, examples, and commands.
---

<!-- Generated from .agents/skills/readme/SKILL.md; run yarn ai-workflow:sync. -->

# README

Update the requested section in place, preserving unrelated content and tone. A small edit needs only supporting sources; research the full library when a new README or comprehensive rewrite is requested.

Verify public API claims against `src/index.ts`, `src/types.ts`, and relevant hooks/stores/tests. Use `@bitsocial/bitsocial-react-hooks` in import examples and preserve supported React versions, store-driven data flow, and loading/error behavior. Verify installation and test commands against `package.json` and current configuration.

For a new README, explain installation, a minimal working hook example, relevant API usage, testing/contribution commands, and license as appropriate for the audience. Do not expand a focused correction into a full API catalog or invent troubleshooting advice.

Follow `docs/agent-playbooks/verification.md` for document checks and regenerate `llms*.txt` when required. Commit/publish only within the user's authorization and report any unverified claim.
