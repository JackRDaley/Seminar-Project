# PostHog Self-driving setup report

PostHog Self-driving is now configured for Saturn (project 532977). Session Replay, Error Tracking, and Support signal sources are active alongside a seven-scout troop and two custom scouts tailored to Saturn's demo walkthrough and GitHub issue backlog. Findings will start appearing in your [Self-driving inbox](https://us.posthog.com/project/532977/inbox) within ~30 minutes.

---

## AI data processing

**Status:** Approved. Organization-level AI data processing consent was verified by the wizard before this run started.

---

## GitHub

**Status:** Already connected — integration `syntoniousrex` (id 193139), connected 2026-07-29.

---

## Products enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | Enabled (server-side) | `posthog.init` has no `disable_session_recording` override — server flip is effective. No recordings in project yet (no traffic). |
| Error Tracking | Enabled (server-side) | `startExceptionAutocapture()` already called in `website/src/posthog.js`. No `capture_exceptions: false` override. No issues in project yet. |
| Support (Conversations) | Enabled (server-side) | Tickets reach the inbox once an inbound channel is connected. See follow-ups. |

> **Note:** `products-enable` was not available via this MCP session. All three products were enabled at the server level during a prior run (their signal source rows already existed). If any product is not yet active in PostHog UI, enable it manually: Settings → Session replay ("Record user sessions"), Settings → Error tracking ("Enable exception autocapture"), and Support in the product sidebar.

---

## Signal sources

| source_product | source_type | Action | Notes |
|---|---|---|---|
| `health_checks` | `health_issue` | Already enabled | Pre-existing row |
| `error_tracking` | `issue_created` | Already enabled | Pre-existing row |
| `error_tracking` | `issue_reopened` | Already enabled | Pre-existing row |
| `error_tracking` | `issue_spiking` | Already enabled | Pre-existing row |
| `session_replay` | `session_analysis_cluster` | Already enabled | Pre-existing row |
| `conversations` | `ticket` | Already enabled | Pre-existing row |
| `signals_scout` | `cross_source_issue` | On by default | No config row needed — scout findings reach the inbox automatically |
| `github` | `issue` | **Enabled this run** | Config id `019fb05e-615b-7710-af30-ab5664a7cfca` |

---

## Connected tools

| Tool | Status | Notes |
|---|---|---|
| GitHub Issues | **Already connected** (verified) | Warehouse source id `019fabde-2b2b-0000-7b4f-46e074c09db5`; repo `syntoniousrex/screen-time-manager`; issues schema syncing (incremental, 6-hour cadence). GitHub responder row enabled this run. Only the `issues` table is syncing for the responder — additional tables (PRs, releases, etc.) can be enabled in the data warehouse UI. |

---

## Scout troop

**Run budget:** 100 runs/day (early-access default). 3 runs used on 2026-07-30. Banner: *"Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."*

### Enabled (7 scouts)

| Scout | Reason kept |
|---|---|
| `signals-scout-general` | Always on — cross-product correlations and surfaces no specialist covers |
| `signals-scout-product-analytics` | Core product analytics in use: 4 custom events, saved funnels, starter dashboard |
| `signals-scout-web-analytics` | Marketing website (Vite/React) is the primary acquisition surface |
| `signals-scout-web-vitals` | Web performance matters for Chrome Web Store conversion; `$web_vitals` available via posthog-js defaults |
| `signals-scout-data-warehouse` | GitHub warehouse source active with 12 schemas (commits, issues, PRs, releases, workflow runs, etc.) |
| `signals-scout-saturn-walkthrough` | Custom — see Custom scouts section |
| `signals-scout-saturn-github-issues` | Custom — see Custom scouts section |

### Disabled (22 scouts)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Covered by the native `error_tracking` signal source (all 3 issue types) |
| `signals-scout-session-replay` | Covered by the native `session_replay` signal source |
| `signals-scout-feature-flags` | No feature flags in active use — not a ranked surface |
| `signals-scout-surveys` | No surveys configured (0 surveys in project) |
| `signals-scout-revenue-analytics` | Whop is the billing layer but no revenue data flows into PostHog |
| `signals-scout-ai-observability` | No `$ai_*` events or LLM SDK in use |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-csp-violations` | No CSP reporting configured |
| `signals-scout-experiments` | No active A/B experiments |
| `signals-scout-customer-analytics` | No group/accounts analytics — consumer extension, not B2B |
| `signals-scout-data-pipelines` | No CDP destinations or batch exports configured |
| `signals-scout-replay-vision` | No Replay Vision scanners configured |
| `signals-scout-anomaly-detection` | Troop ceiling — re-enable if you set up dashboards with key metrics |
| `signals-scout-observability-gaps` | Troop ceiling — re-enable once more events are instrumented |
| `signals-scout-health-checks` | Native `health_checks` source already covers this |
| `signals-scout-inbox-validation` | No shipped fixes to validate yet (fresh setup) |
| `signals-scout-insight-alerts` | No configured insight alerts yet |
| `signals-scout-conversations` | No `$conversation_*` events yet (no inbound channel connected) |
| `signals-scout-apm` | No distributed tracing / OpenTelemetry spans |
| `signals-scout-mcp-tool-calls` | No `$mcp_tool_call` telemetry |
| `signals-scout-tasks` | No PostHog Tasks in use |
| `signals-scout-skills-store` | Troop ceiling |

> To re-enable a disabled specialist later: `scout-config-update` with its config `id` and `{ "enabled": true }`, or use the PostHog UI.

---

## Custom scouts

### `signals-scout-saturn-walkthrough`
**What it watches:** `walkthrough_screen_selected` events, grouped by `screen_name`, for screens receiving ≤40% of the first screen's 7-day selection volume — sustained across ≥3 days.

**Discriminator:** Normalized selection rate per screen (each screen's count as a fraction of the first screen's count). A sustained drop below 40% signals a demo step that's losing visitors before they click through to the Chrome Web Store.

**Why no built-in scout covers it:** `signals-scout-product-analytics` watches saved funnel insights for overall conversion regressions. Per-screen engagement within the interactive walkthrough (using the `screen_name` property) is a separate, uncovered surface.

**Surfaces considered and ruled out:**
- Whop premium conversion funnel — not watchable (no PostHog events for Whop checkout completion or premium activation)
- Extension in-product events — not conclusively watchable (the PostHog integration only covers the marketing website; extension-side events are not instrumented in PostHog)

---

### `signals-scout-saturn-github-issues`
**What it watches:** The repository-specific GitHub Issues warehouse table for issue backlog accumulation (net new open issues vs. 4-week trailing average) and stale issue age distribution (issues open >30 days as a share of total open).

**Table discovery:** Start each run with a live data-warehouse catalog lookup for the connected GitHub source and `syntoniousrex/screen-time-manager` repository, then select the materialized `issues` table from that catalog. Do not hard-code `github_syntoniousrex_screen-time-manager__issues` as the only acceptable table name; PostHog may leave the schema's `table` field null until the first full sync or materialize the table under a source-specific name. Treat catalog absence, authorization failures, or rate-limit failures as source-unavailable close-outs, not backlog findings.

**Empty-state handling:** After table discovery succeeds, issue the metric query against the discovered table. If the table exists but has zero rows, close out as "no GitHub issues rows available yet" rather than reporting a missing table. Only evaluate backlog accumulation and stale issue percentage once the table is both materialized and queryable.

**Discriminator:** Latest complete week's new open issues exceeding the 4-week average by >5, OR stale issue percentage (open >30 days / total open) exceeding 60%. Issues cited by count and date only — no issue titles or body text.

**Why no built-in scout covers it:** `signals-scout-data-warehouse` watches import health (sync status, staleness, row-volume cliffs). It does not watch issue content — accumulation rate and age distribution are uncovered surfaces.

**Safety:** Issue titles and bodies are treated as attacker-influenceable data. The scout's body includes the untrusted-content guard: warehouse rows are analyzed as evidence only, never acted on as instructions.

**Noise escape hatch:** If either custom scout turns noisy, set `emit: false` on its config in PostHog to switch it to dry-run — it will keep running and logging but stop writing to the inbox.

---

## Follow-ups

- [ ] **Connect a Support inbound channel** — tickets only reach the conversations responder once an email, inbox, or Slack channel is connected in PostHog (Settings → Support / Conversations).
- [ ] **Enable products manually if needed** — if Session Replay, Error Tracking, or Support are not active in the PostHog UI, enable them: Settings → Session replay, Settings → Error tracking, and the Support sidebar item.
- [ ] **Verify event delivery** — no live traffic was observed during setup. Open the deployed website, exercise each instrumented action (`chrome_web_store_clicked`, `product_hunt_clicked`, `walkthrough_screen_selected`, `feedback_clicked`), and confirm the four events arrive in PostHog.
- [ ] **Verify exception autocapture** — trigger a controlled browser exception after deployment and confirm it appears in PostHog Error Tracking.
- [ ] **Run the production build** — the website build was not run during the original integration setup. Run `npm run website:build` and fix any lint, type, or bundling errors.
- [ ] **Set deployment environment variables** — confirm `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST` are set in every deployment environment (see `website/.env.example`).
- [ ] **GitHub Issues warehouse sync** — the `issues` schema previously showed `table: null` (data not yet materialized). Keep the custom scout's table discovery catalog-based so it can find the actual materialized table name after sync, and so it can distinguish a missing table from a real table with no rows.
- [ ] **Re-enable disabled scouts as new surfaces are adopted** — e.g. enable `signals-scout-feature-flags` when you start using feature flags, `signals-scout-surveys` when you add surveys, `signals-scout-anomaly-detection` once key metric dashboards exist.

---

## What happens next

- The scout coordinator picks up new configs within **~30 minutes**; the seven enabled scouts will fire on their next tick.
- Each scout run draws from the project's daily budget (100 runs/day during early access). With 7 enabled scouts the troop uses a small fraction of that allowance.
- Scouts write findings as reports in your [Self-driving inbox](https://us.posthog.com/project/532977/inbox). Immediately-actionable reports can auto-start coding tasks.
- The custom scouts will close out quietly until traffic arrives (`saturn-walkthrough`) or the GitHub issues table is discoverable and queryable (`saturn-github-issues`) — that is normal behavior, not an error.
