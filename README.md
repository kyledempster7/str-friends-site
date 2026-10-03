# Skyrim Together field guide

A public, mobile-friendly guide for a small Skyrim Together party: joining and leaving, skills and spells, character ideas, group play, and ownership. Campaign records begin empty until adventures actually happen.

## Develop

Requires Node.js 24. There are no package dependencies.

```sh
node scripts/build.mjs
node scripts/validate.mjs
```

The build emits the static website into `dist/`. Serve that folder with any static HTTP server. Essential content is readable without JavaScript; JavaScript enhances the ability lookup.

## Update and publish

Edit the plain-text JSON under `src/content/`. Keep observed behavior, group restrictions, and untested features distinct. Update the relevant date when facts are reviewed. Never turn an unknown into an approval.

Use a feature branch and pull request. Run the build and validation commands, then copy the generated `dist/` contents into `docs/`, including `.nojekyll`. Verify that `docs/` exactly matches the validated output before committing. GitHub Pages publishes the committed `docs/` folder after the pull request merges into `main`.

This repository uses GitHub Pages' built-in branch publishing. Validation runs locally before publication; there is no custom Actions workflow. Do not edit generated `docs/` files directly.

All source and generated assets are public. Never include connection credentials, network addresses, private chat, machine logs, personal contact details, or local machine paths. Session recaps must describe actual sessions; player details require permission to share publicly.

This is an unofficial fan guide, not an official Skyrim Together or Bethesda product.
