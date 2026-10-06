---
name: str-site-publish
description: Build, validate and publish the STR friends site through its noreply fast-forward release process, or rehearse it with an isolated dry run. Includes the blocking owner-complaint checks before the push and the DONE definition after it (a live re-fetch receipt, not file parity). Use for friends-site publication requests, not game or Nexus collection changes.
---

# STR friends site publication

> **Example B (Skyrim Together friends site).** This skill is specific to one site, one repository and one owner. For a new site or blog use `github-pages-web-lessons` and its `references/publishing-kit.md` and `templates/release-gate/`; read this file only as the worked example of the publish contract. The release gate named below is this project's gate (the `STR-Kit\release` folder under the local Modding folder).

Read the current project rules before work:

- `%USERPROFILE%/.traycer/epics/2e965f62-2d96-4a52-a5df-faad6c8f4ac6/artifacts/brain/00-read-first/index.md`, in full.
- The same epic's `artifacts/friends-website/index.md`, especially section 7.

Also load `github-pages-web-lessons` sections 3.5 to 3.9 (owner-complaint register, status notes on one page, installed-only lists, DONE definition, tracked promised times). They are blocking for this flow.

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
4. Mirror dist to docs, including removed and hidden files, and compare the complete file lists and SHA-256 hashes. The repository's `docs/** -text` Git attribute preserves generated line endings. After committing, compare the actual committed docs blobs with dist too; refuse any clean-filter or normalization drift before pushing.
5. Scan all publish files for passwords, private/local addresses, local file paths, emails and credential tokens. Commit only docs using explicit noreply author and committer. Also scan every new public Git snapshot and commit message; the approved noreply identity is permitted in repository metadata/source, never in published pages.
   **Owner-complaint scan (before anything is committed):** the script runs `release_gate.py --scan-dir docs/v4`, which checks every entry of the owner-complaint register (version and status notes only on `patch-notes.html`, nothing that is not in the game, the mods table against the installed-mods list, plus every later wording objection) on the built pages. Any hit stops the release with nothing committed or pushed. A missing or crashing gate is a failure, never a pass. The gate is `release_gate.py` in the `STR-Kit\release` folder under the local Modding folder (the default the script looks in); `STR_RELEASE_GATE` and `STR_PYTHON` override the gate path and the Python program.
6. Recheck ancestry, NUL-delimited identities and both fetch/push destinations; push the feature branch, create a PR record (reuse an existing open PR), then push `HEAD:main` without force. Reject multiple or alternate effective push URLs. Never use GitHub merge/rebase buttons, a merge API or `gh pr merge`. Stop on divergence; leave rebasing/integration to the assigned owner.
7. Wait up to ten minutes for **every public build file**, including every HTML page and the custom error page, to match docs byte for byte. This also checks CSS/JS/images/audio so an asset-only release cannot pass against the old deployment. `.nojekyll` is verified locally and in Git but excluded from HTTP checks because Pages does not serve that control file. A timeout is a failed verification of an already-pushed release, never permission to force-push or silently roll back. `--timeout-seconds` adjusts the bounded wait.
8. **Done-check (the DONE definition):** after the parity wait the script runs `release_gate.py --done-check`, which re-fetches every live page and runs every complaint entry, and puts its `DONE-RECEIPT <12 hex>` id in the final `RECEIPT` as `doneReceipt`. If it fails the result is `PUBLISHED_NOT_DONE` and the exit code is 1: the release is live and byte-identical, but the work is NOT DONE until the listed hits are fixed and published again. Only `PUBLISHED_AND_VERIFIED` with a `doneReceipt` allows the word DONE.

`node scripts/publish.mjs --done-check` runs only step 8 (read-only, publishes nothing; it takes no other option). Use it to re-verify the live site at any time and to get a fresh receipt for a report.

`--dry-run` uses a disposable local clone and exercises the real build, validation, mirror, owner-complaint scan, docs commit, committed-byte parity, identity checks and ancestry checks. It leaves the original branch, index, docs and main untouched, and removes its clone afterward. It skips all remote writes (including PR creation) and cannot wait for a deployment it did not publish. Instead it compares the current live build once: `MATCH` is parity evidence; `DIFFERENT_OR_UNAVAILABLE_NOT_PUBLISHED` means the unpublished candidate differs or the live check could not complete. `PASS_LOCAL` never means a new release went live.

## Blocking wording checks and the DONE definition (added 2026-10-06)

The gate is `release_gate.py` in the `STR-Kit\release` folder under the local Modding folder; the owner's wording complaints are the `site_complaints` register in its `banned-phrases.json`. `scripts/publish.mjs` now runs steps 1 and 4 itself (the owner-complaint scan before the commit and the done-check after the parity wait); run them by hand only outside a publish. Any failure means the work is NOT DONE:

1. **Before the push** (after build and validate; the script does this for you): `python release_gate.py --scan-dir <built v4 pages folder, e.g. docs/v4>`. It runs every complaint entry on the built pages. Exit 0 required. Fix every hit by removing the wording, not converting it (a banner turned from 'being prepared' to 'is live' is still the banned note). Version and status notes appear only on `patch-notes.html`.
2. **When the owner objects to any wording, in the same turn**: `python release_gate.py --add-complaint ID --pattern RX --complaint "<his objection>" --pages "*" --except-pages patch-notes.html --hit "<example it must catch>"`. The pattern covers the concept, not the one sentence he pasted. It sweeps the live site at once; fix every listed hit before anything else is called finished. Run the unit tests after changing the register or the gate: `python test_gate_checks.py` and `python test_banned_phrases.py` in the release folder.
3. **Lists** (can-use, cannot-use, mods): diff every entry against the installed list before publishing; cut what is not installed. The mods table on `mods.html` is already checked row by row against `installed-mods.json` (the collection manifest, 38 entries) by the `installed-mods-only-list` entry, so any name not in that file fails the scan; when the collection changes, update `installed-mods.json` from the manifest first, then the entry's `source_sha256`. Add not-installed names to the `not-in-the-game` entry, or another `closed_list` entry with the installed list as `source_file`.
4. **After the last push and the live byte-parity wait** (the script does this for you, or run `node scripts/publish.mjs --done-check`): `python release_gate.py --done-check`. It re-fetches every live page and runs every complaint entry. Exit 0 and a `DONE-RECEIPT <12 hex>` line are required. File parity (`81/81 files, 50/50 HTML`) proves only that live equals the build, never that the wording is right.
5. **The DONE report** quotes the `DONE-RECEIPT` line and the `RECEIPT` below. Check it with `python release_gate.py --done-check --report <report file>`, which refuses a report that says DONE or parity without a fresh passing receipt for today's register (60 minute limit, voided when a complaint is added). If any check failed, the report starts with NOT DONE and the failing hits.
6. **Promised times** (`09:00` and the like) go into the gate the moment they are made: `python release_gate.py --add-promise ID --due <ISO with offset> --what "..." --items itemA,itemB`. The full gate prints `PROMISE AT RISK` from T-30 and `PROMISE FAILED` after the time.
7. **'Ready' for any outward-facing text** needs a fresh full PASS of `python release_gate.py` (it now includes `owner-complaints-live` and `gate-structure`).

The final `RECEIPT` records mode, source/release commits, checked files/commits, remote actions and live parity. Report exactly those results and any failure. Do not report publication from a dry run, or full live parity from a partial check.

## Shared facts

`npm run check:shared-facts` reads all three catalogs, D's grids, the mod guide, the installed mod list, and current STR-Kit Brain prose. `--json` provides the extracted facts and discrepancies. Missing/unreadable sources warn and are skipped. External paths can be overridden by `STR_ARTIFACTS_ROOT` and `STR_BRAIN_ROOT`.

Installed names/revision are compared against the installed list (fallback: Brain, then grids); quarantine membership is compared against D's catalog. The guide's three explicitly excluded foundation mods count toward its list. Catalog mod subsets are reported as coverage gaps, not automatically treated as removed installations. Grouped restrictions expand to individual entries. Cleared/negated restrictions are excluded; ambiguous mixed clauses warn instead of treating every named item as held. An untested mention alone is not a quarantine. Session history supplies the published-release record only; old observations and community reports are deliberately not current-state authorities. Unexpected prose/schema changes may require adapter maintenance and are not proof that a restriction was lifted.

Report discrepancies; do not fix source content as part of publication tooling work.
