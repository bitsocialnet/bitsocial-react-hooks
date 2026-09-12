# Bug Investigation Workflow

Use this when a bug is reported in a specific file/line/code block.

## Mandatory First Step

Before editing, check git history for the relevant code. Previous contributors may have introduced behavior for an edge case/workaround.

## Workflow

1. Scan recent commit titles (titles only) for the file/area:

```bash
# Recent commit titles for a specific file
git log --oneline -10 -- src/hooks/comments.ts

# Recent commit titles for a specific line range
git blame -L 120,135 src/hooks/comments.ts
```

2. Inspect only relevant commits with scoped diffs:

```bash
# Show commit message + diff for one file
git show <commit-hash> -- path/to/file.ts
```

3. Continue with reproduction and fix after understanding the history context.

## Troubleshooting Rule

For a dependency or platform issue that current source cannot resolve, consult version-specific official documentation. For missing repository evidence or a user-only reproduction, report the exact gap and continue independent investigation.
