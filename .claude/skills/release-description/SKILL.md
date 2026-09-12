---
name: release-description
description: Draft a concise library release summary from the requested release range.
---

<!-- Generated from .agents/skills/release-description/SKILL.md; run yarn ai-workflow:sync. -->

# Release Description

Use the release/tag range supplied by the user. Otherwise inspect reachable release tags and recent history to identify the relevant previous release; do not assume the most recently created tag belongs to this release line.

Read commit titles and relevant diffs to establish user-visible changes. Summarize significant hook/API additions, bug fixes, compatibility changes, and performance improvements in plain language. Mention internal maintenance only when it matters to package users; do not infer behavior from a title alone.

Start with “This version…” or “This release…” when preparing the customary summary, and use a few sentences rather than reproducing the full changelog. If there are no relevant changes, report that. A wording request returns text; update changelog/release files only when requested. Committing, tagging, publishing, or pushing requires those actions to be in the user's scope.
