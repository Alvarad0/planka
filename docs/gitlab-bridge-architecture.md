# GitLab Bridge — Architecture (Phase 0 / Discovery)

> Status: **Proposal, pending review.** No code has been changed.
> Baseline: PLANKA Community **v2.2.1** (tag `v2.2.1`, commit `266246e2`). Production currently runs 2.1.0.

## TL;DR

| Question | Answer |
|---|---|
| Plugin system? | **No.** Neither server nor client has one. Everything is statically registered. |
| Where does the Bridge live? | **Inside the Planka backend (Sails) as an isolated module**, plus a new section in the React client. A fork is unavoidable because the card UI must change. |
| Source of truth | GitLab for code/MR/pipeline/issue. Planka stores **only the mapping** plus a small status snapshot for failure isolation. |
| GitLab auth (MVP) | One **service token** (group/project access token) from env/Docker secret. **No tokens in the DB.** |
| Webhook auth | Public route + `X-Gitlab-Token` checked in constant time against a **hashed** per-integration secret. Idempotency via `Idempotency-Key` (fallback `X-Gitlab-Event-UUID`). Target GitLab: **17.5**. |
| Relationships | **Nothing equivalent exists** except `Task.linkedCardId`. Reuse it for subtasks; add a new `card_relationship` table for dependencies/related. |
| "Completed" | Driven by **list type `closed`** (already sets `card.isClosed`). Target lists are configured by ID, never by name. |
| Biggest risks | No test infrastructure, no job queue, no encryption-at-rest helper, fork maintenance cost. |

---

## 1. Current Architecture

### 1.1 Stack

| Layer | Technology | Evidence |
|---|---|---|
| Runtime | Node.js ≥ 24 | `server/package.json` engines, `Dockerfile` |
| Backend | Sails 1.5.18 (actions2), Waterline 0.15.2 + `sails-postgresql` | `server/package.json`, `server/patches/` |
| Migrations | Knex 3 (`server/db/migrations`, table `migration`) | `server/db/knexfile.js` |
| DB | PostgreSQL 16 | `docker-compose.yml` |
| Realtime | `sails-hook-sockets` (socket.io) | `server/api/hooks/current-user` |
| Frontend | React 18, Redux 5 + redux-saga + redux-orm, semantic-ui-react, SCSS modules, i18next | `client/package.json` |
| Build | Vite 7 | `client/vite.config.js` |
| Logging | `sails.log` → winston in production (plain text) | `server/utils/logger.js` |
| Tests | Server: Mocha + Chai + Supertest on `sails-disk`. Client: Jest + Cucumber/Playwright | `server/test/`, `client/tests/` |

### 1.2 Backend layering

```text
config/routes.js ──► config/policies.js ──► api/controllers/<resource>/<action>.js
                                                  │  (inputs, exits, permission checks)
                                                  ▼
                                   api/helpers/<resource>/<verb>-one.js
                                   (business logic, socket broadcast, webhooks, actions)
                                                  ▼
                                   api/hooks/query-methods/models/<Model>.js  (Model.qm)
                                                  ▼
                                   api/models/<Model>.js  (Waterline)
```

Reference flow `PATCH /api/cards/:id`:

1. Policy `is-authenticated` + `is-external` (`server/config/policies.js`).
2. `cards/update.js`: `getPathToProjectById` → board membership → role check (`:230-264`).
3. `helpers/cards/update-one.js`: sets `isClosed` from list type (`:212-232`), `Card.qm.updateOne`, broadcast `cardUpdate` to `board:<id>` (`:284-314`), `moveCard` action (`:317-332`), outgoing webhooks (`:362-382`).

### 1.3 Frontend data flow

```text
Component ─dispatch─► entry-action ─► saga (services/*) ─► api/*.js (socket.patch)
                                           │                        │
                                           ▼                        ▼
                                  actions + redux-orm models ◄── server response
                                           ▲
                       socket event (e.g. cardUpdate) ─► watchers/socket.js
```

Most CRUD calls use **the socket**, not plain HTTP (`client/src/api/socket.js`). Auth header is `Authorization: Bearer <token>` injected by `sagas/core/request.js`.

---

## 2. Integration Points

| Need | Exact place | Notes |
|---|---|---|
| New REST endpoints | `server/config/routes.js` + `server/api/controllers/gitlab-*/` | Routes are available over HTTP **and** socket automatically. |
| Public webhook endpoint | `server/config/policies.js` → `'gitlab-webhooks/receive': true` | Same mechanism as `'access-tokens/create': true`. |
| Business logic | `server/api/helpers/gitlab/*` | Mirrors existing helper structure. |
| Periodic sync | New Sails hook `server/api/hooks/gitlab-sync/` | Pattern exists: `hooks/watcher` uses `setInterval`. |
| Move card automatically | `sails.helpers.cards.updateOne.with({ record, values: { listId }, project, board, list, actorUser })` | Reuses `isClosed`, actions, broadcasts and outgoing webhooks. **Requires an `actorUser`.** |
| Live UI refresh | `sails.sockets.broadcast('board:<id>', 'gitlabCardLinkUpdate', { item })` | Client listens in `sagas/core/watchers/socket.js`. |
| Card UI section | `client/src/components/cards/CardModal/ProjectContent.jsx` (~`:542`) and `StoryContent.jsx` (~`:465`) | Copy the `contentModule / moduleWrapper / moduleIcon / moduleHeader` pattern. Action buttons go in the sidebar "Actions" group. |
| Project config UI | `client/src/components/projects/ProjectSettingsModal/` → new `GitLabPane.jsx` appended to the manager-only panes | Append at the end: `isBackgroundPaneActive` depends on tab index 2. |
| i18n | `client/src/locales/en-US/core.js` and `es-ES/core.js` | Other locales fall back to `en-US`. |
| Outgoing HTTP | Native `fetch` + undici `ProxyAgent` from `sails.config.custom.outgoingProxy` | Same as `helpers/utils/send-webhooks.js`. |

---

## 3. Data Model

### 3.1 Existing models relevant to the Bridge

| Model | Relevant fields | Use |
|---|---|---|
| `Project` | `id`, `ownerProjectManagerId` | 1 Planka project ↔ 1 GitLab project |
| `Board` / `BoardMembership` | `role` (`editor`/`viewer`), `canComment` | Who may trigger GitLab actions |
| `List` | `type` (`active`/`closed`/`archive`/`trash`) | `closed` = completed |
| `Card` | `name`, `description`, `isClosed`, `listId`, `type` (`project`/`story`) | Issue title/description source |
| `Task` | `linkedCardId` | **Existing** card→card link; `isCompleted` follows the linked card's `isClosed` |
| `Webhook` | global, outgoing only, `accessToken` in **plaintext** | Not reused for inbound |
| `User` | `apiKeyHash`, `role` | A dedicated bot user can hold an API key |

Conventions to follow: singular snake_case table names, `bigInteger('id').primary().defaultTo(knex.raw('next_id()'))`, `created_at`/`updated_at`, IDs exposed as strings, `migrate: 'safe'`.

### 3.2 New tables (add-only, no changes to core tables)

**`gitlab_integration`**: one per Planka project.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint `next_id()` | |
| `project_id` | bigint FK → `project`, **unique** | |
| `gitlab_project_id` | bigint | Numeric GitLab ID (stable across renames) |
| `gitlab_project_path` | text | Display only, e.g. `company/erp` |
| `default_branch` | text | e.g. `develop`; validated against GitLab on save |
| `review_list_id` | bigint FK → `list`, nullable | Target for "MR opened" |
| `completed_list_id` | bigint FK → `list`, nullable | Must be `type = closed`; target for "MR merged" |
| `auto_move_on_mr_open` | boolean, default false | |
| `auto_move_on_mr_merge` | boolean, default false | |
| `webhook_secret_hash` | text | SHA-256 of the secret; the secret is shown **once** on creation |
| `last_synced_at` | timestamp, nullable | |
| `created_at`, `updated_at` | timestamp | |

**`gitlab_card_link`**: one per card.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | |
| `card_id` | bigint FK → `card`, **unique**, on delete cascade | |
| `gitlab_integration_id` | bigint FK | |
| `issue_id`, `issue_iid` | bigint | Never match by title |
| `issue_url` | text | |
| `branch_name` | text, nullable | |
| `snapshot` | jsonb, nullable | Last known `{ issueState, mr: {iid, state, target}, pipeline: {status, url}, commitsCount }` |
| `last_synced_at` | timestamp | Shown as "Last synchronization" when GitLab is down |

**`gitlab_webhook_delivery`**: idempotency and audit.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | |
| `event_uuid` | text, **unique** | `Idempotency-Key` (GitLab ≥ 17.4, stable across retries); fallback `X-Gitlab-Event-UUID` |
| `gitlab_integration_id` | bigint FK | |
| `event_type` | text | `push`, `merge_request`, `pipeline`, `issue` |
| `status` | text | `received` / `processed` / `ignored` / `failed` |
| `error` | text, nullable | Never contains tokens |
| `created_at` | timestamp | Pruned after N days by the sync hook |

**`card_relationship`**

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | |
| `card_id` | bigint FK → `card`, cascade | Source |
| `related_card_id` | bigint FK → `card`, cascade | Target |
| `type` | text | Canonical: `depends_on`, `related` |
| `creator_user_id` | bigint FK, nullable | |
| `created_at`, `updated_at` | timestamp | |
| unique | (`card_id`, `related_card_id`, `type`) | Plus a check that `card_id <> related_card_id` |

**Canonical storage, derived views.** The brief lists six relation types, but they are three facts seen from both sides:

| Stored | Seen from `card_id` | Seen from `related_card_id` |
|---|---|---|
| `depends_on` | DEPENDS_ON / BLOCKED_BY | BLOCKS |
| `related` | RELATED | RELATED |
| *(existing `Task.linkedCardId`)* | PARENT (has subtasks) | CHILD |

Storing only the canonical form avoids two rows drifting apart, for example "A blocks B" without "B blocked by A".

---

## 4. API

Follows existing conventions: explicit routes, `{ item, included }` responses, `Errors` constants mapped to exits, `{ code: 'E_NOT_FOUND', message }` bodies, `idInput` from `server/utils/inputs.js`, and `@swagger` JSDoc on every controller.

| Method & path | Controller | Permission |
|---|---|---|
| `POST /api/projects/:projectId/gitlab-integration` | `gitlab-integrations/create` | Project manager |
| `GET /api/projects/:projectId/gitlab-integration` | `gitlab-integrations/show` | Project manager |
| `PATCH /api/gitlab-integrations/:id` | `gitlab-integrations/update` | Project manager |
| `DELETE /api/gitlab-integrations/:id` | `gitlab-integrations/delete` | Project manager |
| `POST /api/gitlab-integrations/:id/test-connection` | `gitlab-integrations/test-connection` | Project manager |
| `POST /api/gitlab-integrations/:id/rotate-webhook-secret` | `gitlab-integrations/rotate-webhook-secret` | Project manager |
| `POST /api/gitlab-integrations/:id/sync` | `gitlab-integrations/sync` | Project manager |
| `GET /api/cards/:id/gitlab` | `gitlab-card-links/show` | Board member (viewer+) |
| `POST /api/cards/:id/gitlab-issue` | `gitlab-card-links/create-issue` | Board editor |
| `POST /api/cards/:id/gitlab-link` | `gitlab-card-links/link-issue` (body: `issueIid`) | Board editor |
| `DELETE /api/cards/:id/gitlab-link` | `gitlab-card-links/unlink` | Board editor |
| `POST /api/cards/:id/gitlab-branch` | `gitlab-card-links/create-branch` | Board editor |
| `POST /api/cards/:id/gitlab-merge-request` | `gitlab-card-links/create-merge-request` | Board editor |
| `GET /api/cards/:id/gitlab-commits` | `gitlab-card-links/commits` | Board member |
| `POST /api/cards/:id/gitlab-sync` | `gitlab-card-links/sync` | Board editor |
| `POST /api/cards/:cardId/card-relationships` | `card-relationships/create` | Board editor |
| `DELETE /api/card-relationships/:id` | `card-relationships/delete` | Board editor |
| `POST /api/gitlab/webhooks/:integrationId` | `gitlab-webhooks/receive` | **Public**, token-verified |

`GET /api/cards/:id/gitlab` returns the link plus a live summary (issue, MR, pipeline, commit count). If GitLab fails it returns the stored `snapshot` with `isStale: true` and `lastSyncedAt`, never a 5xx that breaks the card modal.

Relationships are also returned in `included` of the card response so the modal needs no extra round-trip. Adding them there touches `cards/show.js`; this is a deliberate core change.

---

## 5. Webhooks (inbound)

### 5.1 Receive pipeline

```text
GitLab ──POST /api/gitlab/webhooks/:integrationId──► gitlab-webhooks/receive
   1. Load integration (404 if unknown, identical response to bad token)
   2. Constant-time compare sha256(X-Gitlab-Token) vs webhook_secret_hash → 401
   3. Allow-list X-Gitlab-Event: Push | Merge Request | Pipeline | Issue → else 202 "ignored"
   4. INSERT gitlab_webhook_delivery(event_uuid) — unique conflict → 200 "duplicate"
   5. Respond 200 immediately
   6. setImmediate → handler (errors logged + delivery.status = failed)
```

Why respond first: GitLab auto-disables webhooks that time out or fail repeatedly. Processing is short, but it calls GitLab back and moves cards.

### 5.2 Handlers (`server/api/helpers/gitlab/webhooks/`)

| Handler | Maps to card by | Effect |
|---|---|---|
| `handle-push` | `ref` branch name → `gitlab_card_link.branch_name`; fallback: branch prefix `<iid>-` | Update `snapshot.commitsCount`, broadcast |
| `handle-merge-request` | `source_branch` → link; fallback: `Closes #iid` in description | Update snapshot; optional move to `review_list_id` (opened) / `completed_list_id` (merged) |
| `handle-pipeline` | `ref` / `merge_request.iid` → link | Update `snapshot.pipeline`, broadcast |
| `handle-issue` | `object_attributes.iid` → link | Update `snapshot.issueState` (no card move in MVP) |

### 5.3 Retry and repair

- There is **no job queue** in Planka, so there are no in-process retries. A failed delivery is repaired by the **periodic sync**, which reconciles each linked card against GitLab.
- Sync hook (`api/hooks/gitlab-sync`): every N minutes (env `GITLAB_SYNC_INTERVAL`, default 10, `0` disables it) it re-syncs up to 50 linked cards whose `last_synced_at` is older than N minutes (never synced first, then least recently synced), 4 at a time, through the same coalesced sync as webhooks. It stops starting new cards after 3 consecutive "GitLab unavailable/unauthorized" failures, marks integrations with at least one synced card as synced, and prunes webhook deliveries older than `GITLAB_WEBHOOK_DELIVERY_RETENTION_DAYS` (default 30, `0` keeps them). It takes a transaction-scoped Postgres advisory lock (`pg_try_advisory_xact_lock`) so that only one process syncs if Planka is ever scaled horizontally; it does nothing when GitLab is not configured and never runs its timer in the test environment.
- Manual repair: `POST /api/cards/:id/gitlab-sync` and `POST /api/gitlab-integrations/:id/sync`.

> **Target GitLab 17.5.** HMAC signing tokens (`webhook-signature`) only exist from GitLab 19.0, so `X-Gitlab-Token` is the only option. GitLab disables a webhook temporarily after 4 consecutive failures and permanently after 40, which is why step 5 responds before processing. After upgrading GitLab to ≥ 19.0, switch to signing tokens.

---

## 6. Authentication

### 6.1 Planka side

Nothing new. All non-webhook endpoints use the existing `is-authenticated` + `is-external` policies (JWT session or `X-Api-Key`).

### 6.2 GitLab side (MVP)

| Option | Pros | Cons |
|---|---|---|
| **A. Service token (group/project access token) from env** ✅ | No secrets in DB; simple; Docker-secret friendly (`GITLAB_TOKEN__FILE`) | GitLab actions show as the bot user, not the developer |
| B. Per-integration token in DB | Different token per project | Planka has **no encryption-at-rest helper**; `dataEncryptionKeys` in `config/models.js:108` uses a hard-coded default key, so it is not safe as-is |
| C. Per-user OAuth (GitLab as OAuth provider) | True authorship, GitLab-side permissions | Token refresh, a per-user storage table and encryption: phase 8+ |

**Decision for MVP: A.**
- Config: `GITLAB_URL`, `GITLAB_TOKEN` / `GITLAB_TOKEN__FILE` (add it to `load_secret` in `server/start.sh`).
- Scopes: `api` on the smallest group that contains the target projects.
- `GITLAB_URL` is **global config, never user input**. This removes the SSRF surface of letting users type arbitrary URLs.

---

## 7. Permissions

Reuse the existing checks as-is. Do not invent new roles.

| Action | Rule | Existing mechanism |
|---|---|---|
| Configure integration | Project manager | `sails.helpers.users.isProjectManager` |
| View GitLab section | Can read the card | Same check as `cards/show.js:138-154` |
| Create issue/branch/MR, link, relate, sync card | Board **editor** | `BoardMembership.role === 'editor'` as in `cards/update.js:237-264` |
| Relate two cards | Editor on **both** boards, same project | Prevents leaking card names across projects |
| Webhook-driven moves | Performed as a dedicated **bot user** (`actorUser`) | Keeps the activity log honest ("GitLab Bot moved card…") |

The response to "not a member" must stay the disguised **404**, consistent with Planka.

---

## 8. Proposed Architecture

### 8.1 Decision: in-core module vs. separate service

| Criterion | In-core module (Sails) ✅ | Separate service |
|---|---|---|
| Reuse auth and permissions | Direct (`getPathToProjectById`, memberships) | Must call Planka on behalf of the user or reimplement it |
| Realtime UI updates | `sails.sockets.broadcast` | Needs Planka to expose a push channel, which it doesn't |
| Moving cards with side effects | `helpers.cards.updateOne` (actions, notifications, webhooks) | Via REST as bot user: OK, but no transaction |
| Frontend changes | Needed anyway | **Needed anyway** (card section) |
| Deploy | 1 image | 2 images + auth between them |
| Failure isolation | Must be designed (timeouts, try/catch, async webhooks) | Natural |
| Upgrade cost | Rebase of isolated folders plus ~6 registry touch points | Lower on the server, same on the client |

Because the client must be forked regardless, a separate service adds operational cost without removing the fork. **Decision: in-core, as a modular monolith.** The option of extracting a service later stays open because the GitLab client sits behind a port.

### 8.2 Module layout

```text
server/
  api/controllers/gitlab-integrations/*     # driving adapters (HTTP/socket)
  api/controllers/gitlab-card-links/*
  api/controllers/gitlab-webhooks/receive.js
  api/controllers/card-relationships/*
  api/helpers/gitlab/                        # application services (use cases)
    create-issue-for-card.js, create-branch-for-card.js, sync-card.js, ...
    webhooks/handle-push.js, handle-merge-request.js, handle-pipeline.js, handle-issue.js
  utils/gitlab-client.js                     # driven adapter: the ONLY code that talks HTTP to GitLab
                                             # (plain module, not a Sails helper: dependencies are
                                             #  injected, so it is unit-tested without lifting Sails)
  utils/gitlab-url.js                        # GITLAB_URL validation/normalization
  api/models/GitlabIntegration.js, GitlabCardLink.js, GitlabWebhookDelivery.js, CardRelationship.js
  api/hooks/query-methods/models/<same>.js   # Model.qm, following the existing pattern
  api/hooks/gitlab-sync/index.js             # periodic reconciliation
  db/migrations/2026MMDD..._add_gitlab_bridge.js, ..._add_card_relationships.js

client/src/
  components/cards/CardModal/GitLab/*        # card section
  components/cards/CardModal/Relationships/*
  components/projects/ProjectSettingsModal/GitLabPane.jsx
  api/gitlab.js, api/card-relationships.js
  models/GitlabCardLink.js, CardRelationship.js (redux-orm)
  sagas/core/{services,watchers}/gitlab.js
```

Core files touched (keep this list short and reviewable): `config/routes.js`, `config/policies.js`, `cards/show.js` (included relationships), `start.sh` (secret), `ProjectContent.jsx`, `StoryContent.jsx`, `ProjectSettingsModal.jsx`, client registries (`api/index.js`, `orm.js`, `watchers/index.js`, `watchers/socket.js`), locale files.

### 8.3 GitLab client contract

```text
getProject(id) · getBranch(name) · createIssue({title, description}) · getIssue(iid)
createBranch({name, ref}) · createMergeRequest({source, target, title, issueIid})
listCommits({ref, since?}) · listMergeRequests({sourceBranch}) · getLatestPipeline({ref})
```

Rules:
- Timeout of 5 s, and the outgoing proxy is honoured.
- The token is only sent in the `PRIVATE-TOKEN` header and is never logged. Errors are mapped to `gitlabUnavailable`, `gitlabNotFound` or `gitlabForbidden`.
- Branch names are built as `<iid>-<slug>`: the slug is lower-case ASCII (accents stripped, so `cálculo` becomes `calculo`), with runs of `[^a-z0-9]` collapsed to `-` and a length cap. Before creation the name is validated against git ref rules (no `..`, `~^:?*[\`, `@{`, leading `-`, trailing `.lock` or `/`).

### 8.4 Docker

- **One custom image** built from this fork: `docker build -t <registry>/planka:2.2.1-gitlab.1 .`. The production `docker-compose.yml` then points `image:` to it, **pinned, never `:latest`**.
- New env vars: `GITLAB_URL`, `GITLAB_TOKEN__FILE`, `GITLAB_SYNC_INTERVAL` (minutes, default `10`, `0` disables the periodic sync), `GITLAB_WEBHOOK_DELIVERY_RETENTION_DAYS` (default `30`, `0` disables pruning). Invalid values (not a non-negative integer, or too large) log a warning on startup and fall back to the default.
- Outgoing proxy: `start.sh` starts Squid with `OUTGOING_BLOCKED_HOSTS=localhost,postgres`. The GitLab host must be **reachable** through it, which matters if it is on a private network. Verify this in Phase 1.
- Inbound: GitLab must reach `BASE_URL/api/gitlab/webhooks/:id`, so check the reverse proxy and firewall between the two servers.

---

## 9. Risks and Pending Decisions

| # | Risk / decision | Impact | Mitigation / proposal |
|---|---|---|---|
| R1 | **No usable test infrastructure** (test env uses `sails-disk`; the qm layer uses raw SQL and `next_id()`) | High | Phase 1 adds a Postgres-backed test setup (compose service `postgres-test`) before any feature |
| R2 | Fork maintenance on Planka upgrades | Medium | Add-only migrations, isolated folders, short touch-point list (§8.2), `git diff upstream..gitlab-bridge` reviewed per release |
| R3 | No job queue: lost webhooks, no retries | Medium | Idempotent handlers + periodic sync + manual sync endpoints |
| R4 | No encryption at rest | Medium | MVP keeps **no GitLab token in DB**; webhook secret stored hashed |
| R5 | GitLab reachability through Squid / reverse proxy | Medium | Test-connection endpoint in Phase 1; document network rules |
| R6 | Automatic moves by a bot user | Low | Dedicated `boardUser` bot account, member (editor) of the relevant boards only |
| R7 | Production 2.1.0 → 2.2.1 data migration **not rehearsed yet** (no prod access) | High | **Mandatory gate before cutover.** Rehearse with a real backup. |
| R8 | License | Low for internal use | Community License allows internal modification. Keep copyright headers and add a prominent "modified" notice (`LICENSE.md`). Do not offer the instance to third parties. |
| D1 | Subtasks: reuse `Task.linkedCardId` (proposed) vs new `parent` relation type | Design | Reuse gives "3 / 5 completed" for free and follows Rule 2 |
| D2 | One GitLab project per Planka project (proposed) vs per board | Design | Per project matches the brief; per board could come later |
| D3 | Cross-board relationships allowed within the same project? | Design | Proposed: yes, same project only |
| D4 | ~~Webhook signing tokens?~~ **Resolved:** GitLab 17.5 has none (19.0+). Use `X-Gitlab-Token` + `Idempotency-Key` | Security | Revisit when GitLab ≥ 19.0 |

---

## 10. Implementation Plan

Every phase ends with: tests green, a manual check against the GitLab sandbox repo, and a clean `git diff upstream..gitlab-bridge` review.

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | This document | Reviewed and approved |
| 1 | Test infra (Postgres), config/env, bot user, `gitlab-client` + `getProject`, `gitlab_integration` migration/model/API, **Test connection**, `GitLabPane` | Can link a Planka project to the sandbox repo and see "Connection OK" |
| 2 | `gitlab_card_link`, create issue, link existing issue, open issue, card section (read-only) | Card shows `Issue #N` with a link |
| 3 | Create branch (`<iid>-<slug>`, base from config), show/open branch | Branch appears in GitLab; `git checkout` works from the terminal |
| 4 | Commits, MR detection/creation, latest pipeline, `snapshot`, stale fallback | Card shows MR and pipeline; GitLab stopped → card still opens and shows "Last synchronization" |
| 5 | Webhook receiver, 4 handlers, deliveries table, sync hook, manual sync | Push/MR/pipeline update the card live; duplicate delivery ignored |
| 6 | Auto-move on MR opened/merged (opt-in per integration, list IDs) | MR merged → card in configured `closed` list |
| 7 | `card_relationship` + UI, subtasks via linked tasks | Depends on / Blocks / Related visible with ⚠ warning, no enforcement |
| 8 | Polish, docs, custom image, **production migration rehearsal (R7)**, cutover runbook | Rehearsal passes with a real backup |

## Review checklist

- [ ] In-core module decision (§8.1) accepted
- [ ] Service-token auth for MVP (§6.2) accepted
- [ ] Canonical relationship model and subtask reuse (§3.2, D1) accepted
- [ ] Pending decisions D2–D4 answered
- [ ] Network path GitLab ↔ Planka confirmed (R5)
