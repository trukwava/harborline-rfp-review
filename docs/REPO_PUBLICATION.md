# Public GitHub publication — pending remote creation

The user authorized a **public** GitHub repository. This environment could not create one: the linked GitHub integration lacks a repository-creation action, GitHub CLI is unavailable, and outbound DNS is disabled. The project has a complete local `main` branch commit and a distributable source archive; no publication is claimed.

## Fastest path from a machine with GitHub access

1. Extract the source ZIP into a new folder, or clone the supplied `.bundle` to retain the original commit history.
2. Install and authenticate the [GitHub CLI](https://cli.github.com/) (`gh auth login`).
3. In the project folder run:

```bash
git init -b main             # skip if you cloned the Git bundle
git add .
git commit -m "Harborline Evidence Edition v0.2" # skip if the commit already exists
gh repo create harborline-rfp-review --public --source=. --remote=origin --push
```

If the repository name is taken, pick another name. When cloning the Git bundle instead, use:

```bash
git clone harborline-evidence-edition-v0.2.bundle harborline-rfp-review
cd harborline-rfp-review
gh repo create harborline-rfp-review --public --source=. --remote=origin --push
```

Alternatively, use GitHub's **New repository** UI with the name `harborline-rfp-review`, public visibility and *without* auto-creating a README, then add the remote and push `main`.

## Release and security checklist

- Public contents are a **synthetic-data demo only**. The RFPs, organizations and personas are fictional; user-supplied private PDFs are not included.
- `data/`, `.env`, `node_modules/`, local SQLite state and uploads are ignored. Check `git status` before subsequent pushes.
- No real authentication is implemented. Role selection is a demo simulation and server only binds loopback. **Do not host publicly.**
- Do not commit real organization profiles, credential files, production funder records, database snapshots, or user uploads.
- Generated screenshots show synthetic sample content.
- No open-source license is added without the owner's explicit choice. Public visibility alone does not license reuse.
- Continue shipping changes through reviewed commits/PRs once a GitHub remote exists.
