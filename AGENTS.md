# CODEX CODE — BUILDER + REVIEWER CONFIGURATION

**Role**: CODEX BUILDER / CODEX REVIEWER (depending on session)
**Worktree**: `../argos-codex-builder` (when BUILDER) | none required (when REVIEWER)
**Git Branch Pattern**: `codex/issue-{id}-{description}`

## Expo Versioning Reminder

**CRITICAL**: Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code affecting Expo APIs.

Current stack:
- Expo SDK 54.0.34
- React Native 0.81.5
- React 19.1.0
- Target SDK 35/36 (Android)

## Before Starting Any Work

1. **Verify Role**: Am I CODEX BUILDER or CODEX REVIEWER this session?
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
   cd ../argos-codex-builder
   
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

## As CODEX BUILDER: Workflow

1. **Plan** (read Issue deeply):
   - What is the acceptance criterion?
   - What modules touch?
   - Are there dependencies in PROJECT_MAP.md marked BLOCKED?
   - Should I update CONTEXT.md after this?
   - **For native/Expo work**: Verify against https://docs.expo.dev/versions/v54.0.0/

2. **Implement**:
   - Follow scope strictly (no unrelated refactoring)
   - Consult `docs/ai/CONTEXT.md` for restrictions and architecture
   - Pay special attention to:
     - Native platform differences (Android vs iOS vs web)
     - AsyncStorage on native (NOT localStorage)
     - Foreground service requirements (if background work)
     - Timezone and async/await patterns
   - Test locally:
     ```bash
     npm run lint
     npm run typecheck
     npm run build
     npm run test  # if applicable
     ```

3. **Commit**:
   ```bash
   git add .
   git commit -m "type(scope): short message — fixes #issue-id"
   ```
   See `WORK_PROTOCOL.md` section "Commit Message Format" for exact style.

4. **Push & Open PR**:
   ```bash
   git push origin codex/issue-123-description
   ```
   - Open PR on GitHub (web UI)
   - Use the PR template from `WORK_PROTOCOL.md`
   - Include: what changed, why, how to test, what was tested
   - Link the Issue: "Fixes #123"

5. **Update Issue Status**: Move to IN REVIEW

6. **Wait for Review**: CLAUDE REVIEWER or CODEX REVIEWER will review the PR

7. **Respond to Comments**:
   - If blocker: fix locally, commit new commit (not amend), push
   - If minor: decide and comment justification
   - When approved: you may merge (or let reviewer merge)

8. **After Merge**:
   - Verify master picked up the commit: `git log origin/master | head -5`
   - Close the Issue (GitHub will auto-close if PR had "Fixes #123")
   - Move Issue to DONE in GitHub Projects

## As CODEX REVIEWER: Workflow

1. **Find PR to Review**:
   - GitHub: look for open PRs from CLAUDE BUILDER assigned to you (or with request)
   - Read the Issue first, then the PR description, then the diff

2. **Review Checklist** (from `WORK_PROTOCOL.md`):
   - ✅ PR title and description are clear
   - ✅ Diff matches Issue scope (no unrelated changes)
   - ✅ Tests exist and pass
   - ✅ No obvious bugs, edge cases covered
   - ✅ Security ok (no secrets, no injection vulnerabilities)
   - ✅ DB/RLS safe (if Supabase touched)
   - ✅ Native considerations (if Android/iOS touched)
   - ✅ Expo version compatibility (check EXPO_VERSION in CONTEXT.md)
   - ✅ CONTEXT.md updated (if architecture changed)
   - ✅ CI checks pass

3. **Decision**:
   - 🔴 **Blocker**: Leave comment explaining blocker. Do NOT approve. Issue goes back to IN PROGRESS.
   - 🟡 **Minor**: Leave comment with suggestion. May approve or await response.
   - 🟢 **Approved**: Comment "Approved" or use GitHub approval. Issue goes to DONE after merge.

4. **If You Need to Fix**:
   - Do NOT silently edit Claude's worktree
   - Create your own branch: `codex-review-fix-issue-123`
   - Commit and push
   - Comment: "Suggested fix here: PR #XYZ"

## Key Restrictions (Non-Negotiable)

❌ **DO NOT**:
  - Commit secrets, API keys, .env files (check .gitignore)
  - Direct push to master (always PR → review → merge)
  - Force push (unless explicitly told)
  - Refactor giant sections outside of approved Issue scope
  - Touch production DB without approval
  - Amend already-pushed commits (make new commits for traceability)
  - Bypass Expo versioning (always consult v54.0.0 docs for new APIs)

✅ **DO**:
  - Respect Issue scope
  - Update PROJECT_MAP.md if you added/removed a module
  - Test locally before push (lint, typecheck, build)
  - Ask in comments if uncertain
  - Commit often (not one giant commit per PR)
  - Remember: RN Android behavior ≠ iOS behavior ≠ web behavior

## Expo / React Native Considerations

- **AsyncStorage**: Always use on native. localStorage is web-only.
- **Platform.OS**: Needed for native-specific code paths.
- **Foreground Services**: Requires manifest changes → new EAS build required.
- **Background Tasks**: Use expo-background-fetch or react-native-background-actions (with FG service).
- **Timers**: On native, timers stop when screen is off (known limitation).
- **Storage**: Web uses localStorage (or MMKV), native uses AsyncStorage.
- **Absolute vs Relative Imports**: Use `@/` prefix (configured in tsconfig.json).

## Links

- **Expo Docs (v54)**: https://docs.expo.dev/versions/v54.0.0/
- **Protocol**: `docs/ai/WORK_PROTOCOL.md`
- **Context**: `docs/ai/CONTEXT.md`
- **Map**: `docs/ai/PROJECT_MAP.md`
- **GitHub Projects**: [link to be filled in after setup]
- **CI Status**: Check GitHub Actions on PR

## Session Identification

**CODEX - BUILDER**: Checkout `../argos-codex-builder` worktree, work on assigned Issue

**CODEX - REVIEWER**: Work from main checkout or GitHub web UI (no worktree needed)

---

Last updated: 2026-08-28
Protocol version: 1.0 (Master Protocol)
Expo Version: 54.0.34
