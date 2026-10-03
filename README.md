# Skyrim Together field guide

A public, mobile-friendly guide for a small Skyrim Together party: joining and leaving, skills and spells, character ideas, group play, and ownership. Campaign records begin empty until adventures actually happen.

## Develop

Requires Node.js 22 or newer; Node.js 24 is used for release checks. There are no package dependencies.

```sh
npm run build
npm run validate
```

The build emits the static website into `dist/`, including all three version directories. Serve that folder with any static HTTP server. Essential content is readable without JavaScript; JavaScript enhances the ability lookup.

## Versions and content

| URL path | Source | Maintenance |
| --- | --- | --- |
| `/` and `/v1/` | `src/variants/frozen-v1/` | Frozen original release; do not edit. |
| `/v2a/` | `src/variants/v2a/content/` | Cleaned original layout. |
| `/v2b/` | `src/variants/v2b/content/` | Grid layout. |

The original release is pinned to commit `8871f1fb7fbb0eccc08c1a79dacca33ca8ecd1e6`. Its 18 published files are preserved byte for byte at the root and under `/v1/`, with hashes recorded in `src/variants/frozen-v1.json`. Do not change the snapshot, its manifest, the original `src/content/` or `src/assets/`, or the original `scripts/build.mjs`. The supported build command above uses the variant builder and verifies the frozen output.

Edit the variant-specific plain-text JSON: `home.json`, `play.json`, `rules.json`, and `catalog.json`. Shared variant rendering lives in `scripts/lib/render-variant.mjs`, with styling and original SVG artwork under `src/variants/`. Keep observed behavior, group restrictions, and untested features distinct. Update the relevant date when facts are reviewed. Never turn an unknown into an approval. Both variant catalogs must preserve all 116 adopted records and the restrictions checked by validation.

## Update and publish

1. Work on a feature branch and open a pull request. Run `npm run build` and `npm run validate`, then review both variants at phone and desktop widths, including search and the leave-now link.
2. Copy the validated `dist/` contents into `docs/`, including all version directories and every `.nojekyll` file. Verify exact file inventory and byte parity between `dist/` and `docs/` before committing. The original root files must remain identical to the frozen release.
3. Set both Git author and committer identities explicitly to the intended public name and GitHub-provided noreply email before creating any commits. Check both identity fields on every commit that will become public; do not print private identity values in review logs.
4. After review, create the merge locally on a feature integration branch starting at the current PR base, with the noreply author and committer identities explicitly applied. Push the reviewed merge to the PR base without force-pushing, and verify that GitHub marks the pull request merged. Never use GitHub's merge or rebase API, merge buttons, or `gh pr merge` for this repository.
5. GitHub Pages publishes `main` / `docs`. After deployment, verify the live files against the committed output, check both author and committer metadata of newly public commits, and repeat the key navigation and search checks on the live site.

This repository uses GitHub Pages' built-in branch publishing. Validation runs locally before publication; there is no custom Actions workflow. Do not edit generated `docs/` files directly.

All source and generated assets are public. Never include connection credentials, network addresses, private chat, machine logs, personal contact details, or local machine paths. Session recaps must describe actual sessions; player details require permission to share publicly.

This is an unofficial fan guide, not an official Skyrim Together or Bethesda product.
