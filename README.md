# WriteSpace

A browser-local blog demonstration with public previews, registration/login, role-aware reading and authoring, and administrator account management. Built with React 18.2, JavaScript JSX, React Router 6.20, Vite 5.4 and Tailwind 3.4. The only deployable component is `frontend/`.

## Important: local demo only

- Demo administrator: **username `admin`, password `admin`**.
- Do **not** use real passwords or sensitive content. Registered passwords are plaintext in localStorage. Client-side roles and route guards are editable by the browser owner, not production security.
- Posts, accounts and sessions belong to one browser profile/origin. Nothing is sent to a server. Different devices, profiles, ports or domains do not share data.
- Clearing storage loses the data. There is no cloud backup, synchronization, recovery, account verification or password-reset service.
- The default administrator cannot be deleted; an administrator cannot delete their active account. Writers may edit/delete only their own posts. These are demo safeguards, not authoritative access control.

## Run locally

Requires Node.js 20+ and npm. From the repository root:

```sh
cd frontend
npm ci --no-bin-links
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. The root is public. Register a demo account, or sign in with the administrator credentials above. `DEV_PORT`, `PREVIEW_PORT` and `E2E_BASE_URL` are documented in `frontend/.env.example`. They configure local tools only; the compiled app needs no application secret, API URL or runtime data service.

## Production build and preview

```sh
cd frontend
NODE_ENV=production npm run build
npm run preview
```

The self-contained output is `frontend/dist/`; preview defaults to port 4173. Explicit `NODE_ENV=production` avoids embedding development React when a surrounding environment sets development mode. Normal Docker builds already use Vite production mode.

## Routes

| Path | Access |
|---|---|
| `/` | Public introduction, local previews and security disclosure |
| `/login`, `/register` | Public; valid sessions redirect to role home |
| `/blogs`, `/blog/:id` | Signed-in list/full reader |
| `/write` | Signed-in create form |
| `/edit/:id` | Administrator or post author |
| `/admin`, `/users` | Administrator only |

Guest protected entry redirects to `/login`; ordinary users entering admin tools redirect to `/blogs`. Missing posts and unknown routes have explicit not-found states. Plain-text content is rendered without HTML injection and preserves whitespace.

## Persistence and failures

`writespace_posts`, `writespace_users`, and `writespace_session` retain the LLD record contracts. Reads validate the entire collection, including UUID uniqueness, dates, roles and usernames. Invalid/unavailable values fall back independently; render never repairs or overwrites corrupt data. Stale sessions fail closed. Mutations re-read the current collection and session, then report success only after persistence succeeds. Failed writes retain forms/views and display generic feedback. Registration writes the account before its session; if only the session fails, the new account remains available for explicit sign-in. Simultaneous tabs can still overwrite one another; there is no transaction coordinator.

## Tests

```sh
cd frontend
npm test
node node_modules/vitest/vitest.mjs run --coverage
node node_modules/@playwright/test/cli.js install chromium
NODE_ENV=production npm run build
npm run test:e2e
```

Vitest uses jsdom and Testing Library. Playwright starts/reuses the built-artifact Vite preview, uses one Chromium worker, isolated browser storage, and fails on console/uncaught errors. Browser persistence-failure scenarios explicitly restrict the native Storage boundary; application auth/post/account functions and routes remain real. The successful native-storage journeys are separate.

Verified in Development: **684 unit/component tests**, **48 browser scenarios** (47 passed in the first full run; authoring's strict-selector ambiguity was corrected and its 9 scenarios passed on targeted re-run), production build, static Docker image build, and HTTP 200 on root/all nine route patterns. Source-only coverage: 99.94% lines/statements, 99.12% branches, 100% functions. The read-only test critic passed in round 2 with score 1.0 and zero high failures. There is no API/database test layer because the design explicitly has no backend/database.

Optional reproducible evidence captures, while a static preview is running:

```sh
node scripts/preflight.mjs
node scripts/benchmark.mjs
```

Preflight saves accessibility trees, computed styles, HTML and desktop/mobile screenshots under `frontend/evidence/`. Benchmark measures native collection serialization/write and parse/sort at 0/3/100/1000 records; it is not a full UI-render benchmark or an approved latency SLO. The pipeline publishes a separate `verification_evidence.zip` containing these outputs.

## Static container and AWS handoff

```sh
docker build -t writespace-local frontend
docker run --rm -p 8080:80 writespace-local
```

`frontend/Dockerfile` builds assets with Node and serves them with nginx on **0.0.0.0:80**. Root health path is `/`. nginx serves `index.html` for SPA deep links and caches hashed `/assets/` files immutably. It has no backend proxy or server-side data. Browser records never enter the image.

Selected delivery architecture is AWS CloudFront → shared ALB → ECS frontend container/ECR. DevOps owns deployment/account settings, TLS, task sizing, and deployed health checks; Development did not provision or claim a live AWS deployment. `vercel.json` is compatibility configuration for the nested frontend preview/build, not the selected AWS target. The publication manifest supplies the exact repository URL, branch and immutable commit SHA for downstream deployment.

## Known design decisions

- Dashboard retains both `Total Users` and `Total users` labels with the same registered-account count pending product-owner clarification; `Total Admins` includes the built-in admin.
- A restrained editorial Tailwind theme implements the stage's UI policy. Source-specific role avatars and cycling card accents are retained. No unrequested theme toggle, backend, Context API or state-management library is added.
- Pipeline documents (`PLAN.md`, `todos.yaml`, metadata, manifest and test report) are workspace artifacts, not committed application source. `graphify-out/graph.json` is tracked and published for downstream specification synthesis.
