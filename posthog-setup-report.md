# PostHog setup report

PostHog was added to the Vite React marketing website with environment-backed browser initialization, four anonymous interaction events, global exception autocapture, and a starter analytics dashboard.

## Installed and initialized

- Installed `posthog-js` with npm; the root manifest and lockfile declare version `^1.407.5`.
- Initialized the browser singleton in `website/src/posthog.js`, using `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST` from Vite environment variables.
- Imported the initializer once from `website/src/main.jsx`. Capture call sites use that existing singleton rather than initializing another client.
- The real environment values were configured in `website/.env`; the names and placeholders are documented in `website/.env.example`.
- Default PostHog capture behavior remains enabled. No server-side PostHog SDK was added.

## Events instrumented

These are instrumented definitions and call sites. The run did **not** observe events arriving in PostHog, because the application was not started and delivery could not be confirmed.

| Event | What it measures | File |
|---|---|---|
| `chrome_web_store_clicked` | Visitor selected a Chrome Web Store installation call-to-action. | `website/src/App.jsx` |
| `product_hunt_clicked` | Visitor selected the Product Hunt badge from the hero. | `website/src/App.jsx` |
| `walkthrough_screen_selected` | Visitor actively selected a screen in the interactive product walkthrough. | `website/src/App.jsx` |
| `feedback_clicked` | Visitor selected the external feedback call-to-action. | `website/src/App.jsx` |

The event properties reviewed by the run are non-PII: CTA source values and the predefined walkthrough `screen_name`. The website has no account or authentication boundary, so these captures are intentionally anonymous. No stable user identification was wired, and no `identify()` or `reset()` calls were added.

## Error tracking

`website/src/posthog.js` imports the PostHog exception-autocapture support and calls `startExceptionAutocapture()` immediately after guarded initialization. This is configured globally in the existing initializer; the run did not execute the website or observe an exception arriving in PostHog.

## Dashboard

[Analytics basics (wizard)](https://us.posthog.com/project/532977/dashboard/1921349)

The dashboard contains five tagged insight definitions: trends for Chrome Web Store clicks, Product Hunt clicks, walkthrough screen selections, and feedback clicks, plus an ordered Product Hunt-to-feedback funnel. These definitions may remain empty until traffic arrives; their existence was verified, but their data was not.

## What the run verified

- npm installation completed successfully; `npm install` later reported the dependency tree was up to date and audited 326 packages.
- Review found no integration fixes necessary. The root dependency is available to the nested website through normal Node module resolution.
- The initializer, entry import, capture call sites, event contract, and exception-autocapture setup were reviewed.
- The dashboard and five insight definitions were created successfully in PostHog project 532977.

## What remains unconfirmed or unresolved

- **Build conflict:** The website build was not run. The runtime rejected `npm run website:build` before execution because only canonical root build-script command names are allowed. Therefore compilation, package-subpath resolution for `posthog-js/dist/exception-autocapture`, and production output remain unconfirmed. No tests were run.
- **Event delivery:** No application startup or live traffic was observed, so the run cannot claim that any event was captured or that exception data reached PostHog.
- **Deployment configuration:** The local environment was configured, but deployment environments were not verified.

## Before you merge

- [ ] Run the full production build and fix any lint, type, or bundling errors introduced by the integration. Start with the root `website:build` script in `package.json` and the initializer in `website/src/posthog.js`.
- [ ] Run the test suite; instrumented handlers in `website/src/App.jsx` may require updated mocks or fixtures.
- [ ] Set `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST` in every deployment environment, matching the names documented in `website/.env.example`; do not rely only on local `website/.env`.
- [ ] Open the deployed website, exercise each instrumented action in `website/src/App.jsx` (capture call sites around lines 126, 130, 393, and 595), and confirm the four events arrive in PostHog.
- [ ] Trigger a controlled browser exception after deployment and confirm exception autocapture arrives; the setup is centralized in `website/src/posthog.js`.
