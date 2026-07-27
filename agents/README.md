# Saturn Agent Index

Use these custom agents to make Saturn work feel less scattered. Each agent is scoped to a common workflow and includes the files, risks, and validation steps it should care about.

## Agents

- `extension-feature.agent.md`
  - Use for popup, blocked-page, onboarding, schedules, limits, and browser-extension behavior.
- `release-qa.agent.md`
  - Use before packaging or publishing a Chrome Web Store build.
- `storefront-growth.agent.md`
  - Use for the public website, screenshots, store media, product listing polish, and conversion copy.
- `analytics-premium.agent.md`
  - Use for GA4 event tracking, Cloudflare Worker endpoints, Whop handoff, and premium verification flows.
- `refactor.agent.md`
  - Existing deep-dive agent for reducing `popup.js` and `background.js` complexity.

## Quick Routing

If the task changes core blocking behavior, use `extension-feature` first, then `release-qa`.

If the task changes public messaging or screenshots, use `storefront-growth`, then run the relevant website or media verification.

If the task touches `/analytics/*`, `/whop/*`, environment variables, or membership state, use `analytics-premium`, then run Worker-focused tests.

If the task is mostly code movement, use `refactor`, and keep changes incremental.
