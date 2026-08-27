# Saturn Chrome Extension

A lightweight Chrome extension that helps users stay focused by tracking time spent on specific websites and automatically blocking them once a limit is reached.

---

## Features

- Time Tracking  
  Tracks how long users spend on selected websites in real time.

- Automatic Blocking  
  Redirects the user to a custom block page when a time limit is exceeded.

- Domain-Based Control  
  Allows setting limits for individual websites (e.g., youtube.com, twitter.com).

- Usage Statistics  
  Stores daily usage data including time spent and visit counts per domain.

- Focus Schedules
  Enforces recurring daily and weekly blocks, including overnight windows.

- Personal Insights
  Detects repeat visits, snooze loops, substitutions, and changing usage patterns locally.

- Notifications  
  Alerts users when they are close to or have reached their limit.

- Custom UI  
  Includes a clean popup interface and a styled block page.

---

## Tech Stack

- JavaScript (Vanilla)
- Chrome Extensions API (Manifest V3)
- React and Vite for the public website
- Cloudflare Worker for analytics and premium handoff endpoints
- Jest and Playwright for automated checks

---

## Repository Layout

The repository is split by runtime so generated files and website code do not crowd the extension source:

```text
.
|-- manifest.json              # Chrome extension manifest
|-- background.js              # Extension service worker
|-- popup.html/css/js          # Extension popup UI
|-- blocked.html/css/js        # Extension blocked-page UI
|-- welcome.html/css/js        # Extension onboarding page
|-- assets/                    # Extension assets and icons
|-- tests/                     # Jest unit and packaging tests
|-- e2e/playwright/            # Playwright browser flows
|-- tools/                     # Local export/media utilities
|-- worker/                    # Cloudflare Worker project
|-- server/                    # Legacy local Whop verifier (not the production API)
`-- website/                   # React/Vite marketing website
```

Generated folders such as `test-results/`, `website/dist/`, `dashboard-exports-*`, and `ga4-data-api-export-*` are intentionally ignored. The `output/` folder is kept because it contains curated store media.

Production release zips use a rolling backlog: keep the latest three `production-*.zip` files in the repo root and scrap anything older. Run `npm run prune:production-builds` after creating a new production archive.

---

## Website

The public Saturn website lives in `website/`.

```bash
npm run website:dev
npm run website:build
npm run website:preview
```

Vercel is configured from the repository root in `vercel.json`:

- Install Command: `cd website && npm ci`
- Build Command: `cd website && npm run build`
- Output Directory: `website/dist`

Speed Insights is installed with the Vercel script tag in `website/index.html`:

```html
<script vite-ignore defer src="/_vercel/speed-insights/script.js"></script>
```

After importing the project, enable Speed Insights from the project dashboard so
Vercel provisions the `/_vercel/speed-insights/*` routes on the next deployment.

Website analytics are loaded as a separate idle-time chunk, keeping PostHog out of
the initial application bundle. Production security headers are defined in the
root `vercel.json`.

---

## Installation

### Option 1: Load Locally (Recommended for Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/your-repo-name.git
   cd your-repo-name
   ```

2. Open Chrome and navigate to:
   ```
   chrome://extensions/
   ```

3. Enable Developer Mode:
   - Toggle the switch in the top-right corner

4. Load the extension:
   - Click "Load unpacked"
   - Select the project folder

5. The extension should now appear in your Chrome toolbar.

---

### Option 2: Install from Chrome Web Store

1. Visit the Chrome Web Store listing
2. Click "Add to Chrome"
3. Confirm installation

---

## How It Works

1. The user adds a domain and sets a time limit.
2. The extension detects the active tab and tracks time spent on that domain.
3. Once the time limit is exceeded:
   - The tab is redirected to a blocked page.
   - The blocked page can emit an anonymous analytics event for active-usage tracking.
4. Usage data resets daily.

---

## PostHog Extension Analytics

Blocked-page redirects and extension actions can be tracked with PostHog through the Cloudflare Worker.

- The extension sends one pseudonymous event per redirect to `/analytics/block-event`.
- The extension sends low-cardinality product events to `/analytics/event`.
- The Worker forwards those events to PostHog's capture endpoint.
- Analytics are sent only from the production Chrome Web Store extension ID; unpacked/internal extension IDs are skipped before they reach PostHog.
- No PostHog project key is stored in the extension.
- Production extension events create a PostHog profile keyed only by the random `analyticsClientId` stored in `chrome.storage.local`. Profiles contain first/latest extension version, the production extension ID, and the install's event timeline.
- Profiles do not receive names, email addresses, Whop identifiers, visited domains, full URLs, redirect IDs, or user-entered notes. Reinstalling the extension or clearing its local storage creates a new profile, and profiles are not linked across devices.
- Website visitors remain anonymous unless the website later implements an explicit account identification flow; `person_profiles: "identified_only"` prevents anonymous marketing-site profiles.

To enable it:

1. Copy the project API key from your PostHog project.
2. Set the project key as a Worker secret:
  ```bash
  wrangler secret put POSTHOG_PROJECT_API_KEY
  ```
3. Set the PostHog ingest host. Use `https://us.i.posthog.com` for US Cloud, `https://eu.i.posthog.com` for EU Cloud, or your self-hosted ingest URL:
  ```bash
  wrangler vars set POSTHOG_HOST
  ```
4. Configure analytics extension ID gates if they differ from the defaults:
  ```bash
  wrangler vars set ANALYTICS_PRODUCTION_EXTENSION_IDS
  wrangler vars set ANALYTICS_INTERNAL_EXTENSION_IDS
  ```
5. Deploy the Worker again.

The main emitted PostHog events are:

- `blocked_page_view`
- `blocked_page_action`
- `post_install_redirect_action`
- `domain_added`
- `popup_opened`
- `onboarding_started`
- `onboarding_completed`
- `onboarding_skipped`
- `first_limit_created`
- `first_schedule_created`
- `first_block_reached`
- `insight_presented`
- `insight_viewed`
- `insight_add_limit_clicked`
- `preset_applied`
- `upgrade_clicked`
- `post_install_redirect_shown`
- `post_install_redirect_failed`
- `extension_update`
- `review_prompt_shown`
- `review_prompt_action`

Allowed low-cardinality event properties:

- `extension_version`
- `extension_id`
- `analytics_source`
- `block_source` (`limit` or `scheduled`)
- `block_tier` (`lenient`, `standard`, `strict`, or `immutable`)
- `action`
- `install_reason`
- `trigger`
- `onboarding_step`
- `funnel_version`
- `error_name`
- `preset_id`
- `rule_type`
- `created_count`
- `skipped_count`
- `conflict_count`
- `capped_count`

Avoid adding unique or high-cardinality values such as redirect IDs, domains, raw URLs, client IDs, email addresses, or user-entered notes as event properties.

Use PostHog trends against `blocked_page_view`, `popup_opened`, and `first_block_reached` if you want a rough view of active installs and activation health.

---

## Whop Premium Handoff

The popup opens `/whop/start` on the Cloudflare Worker instead of linking directly to Whop. The Worker receives the current `chrome.runtime.id`, creates a Whop checkout configuration when `WHOP_PLAN_ID` is set, and uses a return URL that lets the post-payment page message this exact extension install.

Required Worker variables:

- `WHOP_COMPANY_ID`
- `WHOP_PRODUCT_ID` (`prod_...`) or `WHOP_PLAN_ID` (`plan_...`)
- `WHOP_CHECKOUT_URL` as a fallback direct checkout link
- `WHOP_EXTENSION_ID` as a production fallback for Chrome Web Store installs

Required Worker secrets:

- `WHOP_API_KEY`
- `WHOP_WEBHOOK_SECRET`
- `JWT_SECRET`

Configure secrets with `wrangler secret put <NAME>`; never place secret values in
`wrangler.toml`. Webhook delivery is rejected when its secret is absent, stale,
replayed, or for a different configured company/product.

If only `WHOP_PRODUCT_ID` is configured, the Worker looks up the first non-archived buy-now plan for that product before creating checkout. The Whop API key needs checkout configuration create/read permissions, plan read permission, plus the membership/payment read permissions already used by verification.


## Permissions Explained

- tabs  
  Used to detect the active tab and redirect it when necessary.

- storage  
  Stores user settings and usage data locally.

- alarms  
  Triggers periodic checks to enforce time limits.

- host_permissions  
  Allows access to URLs to determine the current domain.

- notifications  
  Notifies users when limits are reached.

---

## Key Concepts

### Domain Extraction
Extracts the hostname from a URL and normalizes it:
```
example.com
```

### Time Tracking
- Uses timestamps to calculate time spent on each domain
- Updates via tab events and background alarms

### Blocking Logic
```
if (timeSpent >= limit) {
    redirect to blocked page
}
```

---

## Known Issues / Future Improvements

- Improve domain management UI
- Add cross-device sync support
- Continue splitting the popup and service worker into smaller feature modules

---

## Automated Checks

```bash
npm test -- --runInBand --coverage
npm run test:playwright
npm --prefix website run build
npm --prefix worker test
npm --prefix server test
```

GitHub Actions runs these checks, dependency audits, and each deployable runtime's
test/build command on pushes and pull requests.

---

## Contributing

Contributions are welcome. Feel free to fork the repository and submit pull requests.

---

## License

This project is licensed under the MIT License.

---

## Contact

For questions or feedback, refer to the Chrome Web Store listing or repository issues section.
