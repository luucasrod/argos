# CLAUDE CODE — BUILDER + REVIEWER CONFIGURATION

**Role**: CLAUDE BUILDER / CLAUDE REVIEWER (depending on session)
**Worktree**: `../argos-claude-builder` (when BUILDER) | none required (when REVIEWER)
**Git Branch Pattern**: `claude/issue-{id}-{description}`

## Before Starting Any Work

1. **Verify Role**: Am I CLAUDE BUILDER or CLAUDE REVIEWER this session?
   - Read: What Issue am I assigned to? Check GitHub Issues / Projects
   - If building: confirm I own the assignment and Issue is IN PROGRESS
   - If reviewing: confirm a PR needs my review

2. **Read Shared Sources of Truth** (in this order):
   - `docs/ai/WORK_PROTOCOL.md` — shared rules for all builders/reviewers
   - `docs/ai/CONTEXT.md` — product, architecture, restrictions
   - `docs/ai/PROJECT_MAP.md` — module status and critical blockers
   - GitHub Issue / PR you're working on — requirements and acceptance criteria

3. **Worktree Setup** (BUILDER only):
   ```bash
   # Enter your worktree
   cd ../argos-claude-builder
   
   # Sync with master
   git fetch origin
   git rebase origin/master
   
   # Confirm you're on the right branch for your Issue
   git status
   ```

4. **Claim the Issue** (BUILDER only):
   - GitHub Projects: move Issue to IN PROGRESS
   - GitHub Issue: assign to yourself
   - Set status to IN PROGRESS in GitHub Project

## As CLAUDE BUILDER: Workflow

1. **Plan** (read Issue deeply):
   - What is the acceptance criterion?
   - What modules touch?
   - Are there dependencies in PROJECT_MAP.md marked BLOCKED?
   - Should I update CONTEXT.md after this?

2. **Implement**:
   - Follow scope strictly (no unrelated refactoring)
   - Consult `docs/ai/CONTEXT.md` for restrictions (e.g., AsyncStorage on native, no direct DB access, etc.)
   - Test locally: `npm run lint && npm run typecheck && npm run build` (or equivalent)
   - Write/update tests if applicable

3. **Commit**:
   ```bash
   git add .
   git commit -m "type(scope): short message — fixes #issue-id"
   ```
   See `WORK_PROTOCOL.md` section "Commit Message Format" for exact style.

4. **Push & Open PR**:
   ```bash
   git push origin claude/issue-123-description
   ```
   - Open PR on GitHub (web UI)
   - Use the PR template from `WORK_PROTOCOL.md`
   - Include: what changed, why, how to test, what was tested
   - Link the Issue: "Fixes #123"

5. **Update Issue Status**: Move to IN REVIEW

6. **Wait for Review**: CODEX REVIEWER or CLAUDE REVIEWER will review the PR

7. **Respond to Comments**:
   - If blocker: fix locally, commit new commit (not amend), push
   - If minor: decide and comment justification
   - When approved: you may merge (or let reviewer merge)

8. **After Merge**:
   - Verify master picked up the commit: `git log origin/master | head -5`
   - Close the Issue (GitHub will auto-close if PR had "Fixes #123")
   - Move Issue to DONE in GitHub Projects

## As CLAUDE REVIEWER: Workflow

1. **Find PR to Review**:
   - GitHub: look for open PRs from CODEX BUILDER assigned to you (or with request)
   - Read the Issue first, then the PR description, then the diff

2. **Review Checklist** (from `WORK_PROTOCOL.md`):
   - ✅ PR title and description are clear
   - ✅ Diff matches Issue scope (no unrelated changes)
   - ✅ Tests exist and pass
   - ✅ No obvious bugs, edge cases covered
   - ✅ Security ok (no secrets, no injection vulnerabilities)
   - ✅ DB/RLS safe (if Supabase touched)
   - ✅ Native considerations (if Android/iOS touched)
   - ✅ CONTEXT.md updated (if architecture changed)
   - ✅ CI checks pass

3. **Decision**:
   - 🔴 **Blocker**: Leave comment explaining blocker. Do NOT approve. Issue goes back to IN PROGRESS.
   - 🟡 **Minor**: Leave comment with suggestion. May approve or await response.
   - 🟢 **Approved**: Comment "Approved" or use GitHub approval. Issue goes to DONE after merge.

4. **If You Need to Fix**:
   - Do NOT silently edit Codex's worktree
   - Create your own branch: `claude-review-fix-issue-123`
   - Commit and push
   - Comment: "Suggested fix here: PR #XYZ"

## Key Restrictions (Non-Negotiable)

❌ **DO NOT**:
  - Commit secrets, API keys, .env files (check .gitignore)
  - Direct push to master (always PR → review → merge)
  - Force push (unless explicitly told)
  - Refactor giant sections outside of approved Issue scope
  - Touch production DB without approval
  - Amend already-pushed commits (make new commits for raiseability)

✅ **DO**:
  - Respect Issue scope
  - Update PROJECT_MAP.md if you added/removed a module
  - Test locally before push
  - Ask in comments if uncertain
  - Commit often (not one giant commit per PR)

## Links

- **Protocol**: `docs/ai/WORK_PROTOCOL.md`
- **Context**: `docs/ai/CONTEXT.md`
- **Map**: `docs/ai/PROJECT_MAP.md`
- **GitHub Projects**: [link to be filled in after setup]
- **CI Status**: Check GitHub Actions on PR

## Session Identification

**CLAUDE - BUILDER**: Checkout `../argos-claude-builder` worktree, work on assigned Issue

**CLAUDE - REVIEWER**: Work from main checkout or GitHub web UI (no worktree needed)

---

Last updated: 2026-08-28
Protocol version: 1.0 (Master Protocol)
