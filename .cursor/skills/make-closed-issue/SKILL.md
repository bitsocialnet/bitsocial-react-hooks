---
name: make-closed-issue
description: Create a GitHub issue from recent changes, commit only relevant diffs on a short-lived task branch, push that branch, and open a PR into master that will close the issue on merge. Use when the user says "make closed issue", "close issue", or wants to create a tracked, already-resolved GitHub issue for completed work.
---

# Make Closed Issue

Creates a GitHub issue, commits relevant changes on a review branch, pushes the branch, and opens a PR into `master` that closes the issue when merged.

## Inputs

- What changed and why (from prior conversation context)
- Uncommitted or staged git changes in the working tree

## Workflow

### 1. Determine label(s)

Ask the user using AskQuestion (multi-select):

| Option | When |
|--------|------|
| `bug` | Bug fix |
| `enhancement` | New feature |
| `bug` + `enhancement` | New feature that also fixes a bug |
| `documentation` | README, AGENTS.md, docs-only changes |

### 2. Ensure branch workflow is reviewable

- If already on a short-lived task branch such as `feature/*`, `fix/*`, `docs/*`, or `chore/*`, stay on it.
- If on `master`, create a task branch before staging or committing.
- Do **not** commit the work directly on `master` when PR review bots or human review are expected.

Suggested naming:

- `feature/short-slug`
- `fix/short-slug`
- `docs/short-slug`
- `chore/short-slug`

Example:

```bash
git switch -c fix/replies-cache-reset
```

### 3. Review diffs for relevance

```bash
git status
git diff
git diff --cached
```

Identify which files relate to the work done in this conversation. Only relevant changes get committed. Unrelated files must be excluded from staging.

**Important**: `git add -p` and `git add -i` are not available (interactive mode unsupported). If a file has mixed relevant/irrelevant changes, include the entire file and note the caveat to the user.

### 4. Generate issue title and description

From the conversation context:

- **Title**: Short, present-tense, describes the **problem** (not the solution). Use backticks for hooks, stores, commands, or literal strings when helpful.
- **Description**: 2-3 sentences about the problem. Use backticks for code references or literal names. Write as if the issue hasn't been fixed yet.

### 5. Create the issue

```bash
gh issue create \
  --repo bitsocialnet/bitsocial-react-hooks \
  --title "ISSUE_TITLE" \
  --body "ISSUE_DESCRIPTION" \
  --label "LABEL1,LABEL2" \
  --assignee tomcasaburi
```

Capture the issue number from the output.

### 6. Commit relevant changes

Stage only the relevant files:

```bash
git add file1.ts file2.ts ...
```

Commit using Conventional Commits with scope:

```bash
git commit -m "$(cat <<'EOF'
type(scope): concise title

Optional 1-sentence description only if the title isn't self-explanatory.
EOF
)"
```

- **Types**: `fix`, `feat`, `perf`, `refactor`, `docs`, `chore`
- **Scope**: area of the codebase (for example `feeds`, `replies`, `accounts`, `agent-workflow`)
- Prefer title-only commits when the title already says enough

### 7. Push branch and open PR

Push the current task branch to origin and open a ready-for-review PR into `master`.

Never open a draft PR. If the user does not want a ready-for-review PR yet, do not open a PR yet.

Use `Closes #ISSUE_NUMBER` in the PR body so the issue closes automatically when the PR is merged.

```bash
COMMIT_HASH=$(git rev-parse HEAD)
BRANCH_NAME=$(git branch --show-current)
git push -u origin "$BRANCH_NAME"

gh pr create \
  --repo bitsocialnet/bitsocial-react-hooks \
  --base master \
  --head "$BRANCH_NAME" \
  --title "PR_TITLE" \
  --body "$(cat <<EOF
SUMMARY

Closes #ISSUE_NUMBER
EOF
)"
```

Do **not** merge the PR locally as part of this skill. Review bots and humans must be allowed to inspect the PR first.

If the user later explicitly asks to merge after reviews pass, a separate merge step can be run, for example:

```bash
gh pr merge --squash --delete-branch
```

### 8. Report summary

Print a summary to the user:

```
Issue #NUMBER created, committed, pushed, and linked to a PR into master.
  Branch: BRANCH_NAME
  Commit: HASH
  Labels: label1, label2
  PR: PR_URL
  URL: https://github.com/bitsocialnet/bitsocial-react-hooks/issues/NUMBER
```

If the PR has not been merged yet, explicitly tell the user that the issue will close on PR merge and that the branch should not be deleted yet.

After the PR is open, use `review-and-merge-pr` to inspect CI, bot, and human feedback before merging.
