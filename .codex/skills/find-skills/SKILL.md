---
name: find-skills
description: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill for X". Use this to search the open skill ecosystem.
---

# Find Skills

Search the open skill ecosystem for useful agent skills.

## How to Search

```bash
npx skills search "QUERY"
```

## How to Install

```bash
npx skills add REPO_URL --skill SKILL_NAME
```

## Examples

```bash
npx skills search "code review"
npx skills search "testing"
npx skills search "documentation"
npx skills add https://github.com/intellectronica/agent-skills --skill context7
```

## Tips

- Search with broad terms first, then narrow down
- Skills are installed to `.cursor/skills/SKILL_NAME/`
- After installing, the skill is available in the current project
