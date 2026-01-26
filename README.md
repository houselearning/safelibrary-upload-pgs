# HouseLearning Pages Hosting

Static hosting platform on top of GitHub Pages:

- Users log in at `https://pages.houselearning.org`
- Each user can create up to 5 sites
- Site files are stored in Firestore
- "Deploy" triggers a GitHub Action via `repository_dispatch`
- GitHub Action writes files into this repo and GitHub Pages serves them

## URLs

Deployed sites live under:

- `https://pages.houselearning.org/sites/{uid}/{siteId}/`

You can later add a nicer alias layer like:

- `https://pages.houselearning.org/{username}/{siteSlug}/`

## Setup

1. **Clone this repo** into GitHub (e.g. `HouseLearning/pages-hosting`).
2. **Enable GitHub Pages**:
   - Source: `main` branch
   - Folder: `/ (root)` or `/public` depending on how you host
3. **Firebase**:
   - Create a Firebase project
   - Enable Email/Password or other providers
   - Create Firestore in production mode
   - Copy your config into `public/js/firebase-init.js`
4. **GitHub Secrets**:
   - `PAGES_PAT`: Personal Access Token with `repo` scope
   - `PAGES_REPO`: `owner/repo` (e.g. `HouseLearning/pages-hosting`)
   - `PAGES_BRANCH`: usually `main`
5. **Deploy**:
   - Push to GitHub
   - Visit `https://<your-gh-pages-domain>` (or custom domain `pages.houselearning.org`)

## Firestore structure (logical)

- `users/{uid}`:
  - `email`
  - `displayName`
  - `siteCount`
- `sites/{uid}_{siteId}`:
  - `uid`
  - `siteId`
  - `name`
  - `slug`
  - `createdAt`
  - `updatedAt`
  - `lastDeployedAt`
- `siteFiles/{uid}_{siteId}`:
  - `files`: array of `{ path, content, contentType }`
  - (or you can normalize into subcollections if you prefer)

You can adapt this to your existing Blob system.

## Workflow

1. User logs in.
2. User creates a site (up to 5).
3. User uploads files (HTML/CSS/JS).
4. User clicks "Deploy".
5. Frontend calls GitHub REST API `repository_dispatch` with payload:
   - `uid`, `siteId`, `files[]`
6. GitHub Action:
   - Writes files into `/sites/{uid}/{siteId}/`
   - Commits and pushes
   - GitHub Pages serves them.

