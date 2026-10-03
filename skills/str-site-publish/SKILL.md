---
name: str-site-publish
description: Build, validate and publish the STR friends site through its noreply fast-forward release process, or rehearse it with an isolated dry run. Use for friends-site publication requests, not game or Nexus collection changes.
---

# STR friends site publication

Read the current project rules before work:

- `%USERPROFILE%/.traycer/epics/2e965f62-2d96-4a52-a5df-faad6c8f4ac6/artifacts/brain/00-read-first/index.md`, in full.
- The same epic's `artifacts/friends-website/index.md`, especially section 7.

Only the Website Orchestrator edits that golden file. Send the release result to the assigning orchestrator; do not create website artifacts. Keep scratch notes outside the public repo.

The repository is `kyledempster7/str-friends-site`, normally `%USERPROFILE%/str-friends-site`. The installed skill is copied from the repo's `skills/str-site-publish/SKILL.md`; update that source and reinstall the copy when changing this workflow.

## Run the requested mode

Use Node 22+, npm, Git and authenticated `gh`. Work from the repo or a linked worktree. Source work must be committed on a `feature/*` branch. Both author and committer of every unpublished commit must be `kyledempster7` with its GitHub noreply address (the script checks both fields). Do not rewrite another agent's commits automatically.

Rehearse without publication:

```powershell
node scripts/publish.mjs --branch feature/site-change --dry-run
```

Publish when the active request authorizes publication:

```powershell
node scripts/publish.mjs --branch feature/site-change
```

Alternatively target a worktree with `--worktree "<absolute worktree path>"`. Omit either option to use the script's own worktree. Branch-only publication reuses that branch's existing worktree or creates a new one under the common Git directory. It never checks out or commits on main.

The script stops on the first failed release gate:

1. Require clean committed feature work and the expected origin. Read both live passwords from the server's `STServer.ini` into memory only. The known STR-Kit server location under the local Modding folder is preferred; fallback discovery rejects ambiguity. Use `--server-ini` only for the intended server configuration. Never echo, copy, log or embed either password.
2. Fetch main, require `origin/main` to be an ancestor, and check both identities on every new commit.
3. Run `npm run build`, then `npm run validate`. Shared-facts findings are warnings; all existing site validation gates remain failures.
4. Mirror dist to docs, including removed and hidden files, and compare the complete file lists and SHA-256 hashes.
5. Scan all publish files for passwords, private/local addresses, local file paths, emails and credential tokens. Commit only docs using explicit noreply author and committer. Also scan every new public Git snapshot and commit message; the approved noreply identity is permitted in repository metadata/source, never in published pages.
6. Recheck ancestry and identities; push the feature branch, create a PR record (reuse an existing open PR), then push `HEAD:main` without force. Never use GitHub merge/rebase buttons, a merge API or `gh pr merge`. Stop on divergence; leave rebasing/integration to the assigned owner.
7. Wait up to ten minutes for **every HTML page**, including the custom error page, to match docs byte for byte. A timeout is a failed verification of an already-pushed release, never permission to force-push or silently roll back. `--timeout-seconds` adjusts the bounded wait.

`--dry-run` uses a disposable local clone and exercises the real build, validation, mirror, scan, docs commit, identity checks and ancestry checks. It leaves the original branch, index, docs and main untouched, and removes its clone afterward. It skips all remote writes (including PR creation) and cannot wait for a deployment it did not publish. Instead it compares current live HTML once: `MATCH` is parity evidence; `DIFFERENT_OR_UNAVAILABLE_NOT_PUBLISHED` means the unpublished candidate differs or the live check could not complete. `PASS_LOCAL` never means a new release went live.

The final `RECEIPT` records mode, source/release commits, checked files/commits, remote actions and live parity. Report exactly those results and any failure. Do not report publication from a dry run, or full live parity from a partial check.

## Shared facts

`npm run check:shared-facts` reads all three catalogs, D's grids, the mod guide, the installed mod list, and current STR-Kit Brain prose. `--json` provides the extracted facts and discrepancies. Missing/unreadable sources warn and are skipped. External paths can be overridden by `STR_ARTIFACTS_ROOT` and `STR_BRAIN_ROOT`.

Installed names/revision are compared against the installed list (fallback: Brain, then grids); quarantine membership is compared against D's catalog. The guide's three explicitly excluded foundation mods count toward its list. Catalog mod subsets are reported as coverage gaps, not automatically treated as removed installations. Grouped restrictions expand to individual entries. An untested mention alone is not a quarantine. Session history supplies the published-release record only; old observations and community reports are deliberately not current-state authorities. Unexpected prose/schema changes may require adapter maintenance and are not proof that a restriction was lifted.

Report discrepancies; do not fix source content as part of publication tooling work.
