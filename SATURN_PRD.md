# Saturn Product Requirements Document

Status: Draft  
Last updated: 2026-08-02  
Product: Saturn - Screen Time Manager  
Current product context: Chrome extension v3.3.18, public website, Cloudflare Worker analytics and premium handoff

## 1. Overview

Saturn is a Chrome extension that helps people reduce distracting web habits by tracking time spent on selected websites, enforcing daily limits and scheduled focus blocks, and making repeated return attempts visible. The product should feel like a calm, capable focus tool rather than a punitive website blocker.

Saturn's core promise:

> Add a pause between impulse and action so users can stop opening distracting sites on autopilot.

The product currently includes a Chrome extension popup, blocked page, onboarding tour, public website, analytics pipeline, review prompt, and Whop-based premium upgrade flow.

## 2. Problem

Users often do not decide to waste time in one large intentional action. They open YouTube, Reddit, TikTok, Instagram, X, Netflix, news, sports, or other sites for "just a minute" and repeatedly return without noticing the pattern. Existing blockers can be too blank at setup, too easy to ignore, too harsh for real life, or too opaque about whether they are actually helping.

Saturn should solve three connected problems:

1. Help users set useful boundaries quickly.
2. Interrupt distracting browsing at the right moment.
3. Show users that the interruption is working through reclaimed time, blocked attempts, visits, and usage patterns.

## 3. Target Users

Primary user:

- College students who are studying, doing homework, attending class, or trying to keep a healthy night routine while repeatedly opening distracting sites.

Secondary users:

- Knowledge workers who need deep-work blocks.
- Students or professionals who want light self-regulation without installing an invasive monitoring app.
- People who want a simple Chrome-only focus tool with no account requirement.

## 4. Positioning

Primary positioning:

- Saturn helps you block distracting sites, set daily limits, protect focus windows, and notice repeat browser habits.

Tone:

- Calm, clear, professional, and productivity-oriented.
- Serious enough to feel useful for school and work.
- Encouraging without being gimmicky or shaming.

Differentiation:

- Makes autopilot behavior visible through visit counts, blocked attempts, reclaimed time, and journey progress.
- Combines daily limits, schedules, and enforcement tiers in one simple extension.
- Works without requiring an account.
- Uses privacy-conscious, low-cardinality analytics for product health rather than raw browsing surveillance.

## 5. Goals

Product goals:

1. Reduce time spent on user-selected distracting websites.
2. Help new users reach value within the first minute after installation.
3. Encourage repeat use by showing tangible progress.
4. Provide flexible enforcement for real-life focus needs.
5. Create a sustainable premium path without weakening the free product.

Growth goals:

1. Increase Chrome Web Store installs.
2. Improve activation from install to first useful rule.
3. Improve retention through presets, insights, and progress feedback.
4. Increase positive reviews after users experience value.
5. Convert highly engaged users to Saturn Pro.

## 6. Non-Goals

The current product should not attempt to:

- Track all browsing activity for broad productivity surveillance.
- Require users to create an account before receiving value.
- Become a full cross-device time management platform.
- Add a complex multi-step setup wizard when a simple preset or rule flow will work.
- Store or forward raw URLs, raw domain lists, emails, notes, or high-cardinality identifiers in product analytics.
- Make the blocked page playful at the expense of clarity and firmness.

## 7. Product Scope

### 7.1 Chrome Extension Popup

The popup is the main control center. It must allow users to review activity, create and edit limits, create and edit schedules, apply presets, view active blocks, manage profile/progress, change settings, and access upgrade or support flows.

Core tabs:

- Dashboard
- Limits
- Schedule
- Profile

### 7.2 Dashboard

The dashboard should make today's pattern understandable at a glance.

Required capabilities:

- Show reclaimed time.
- Show blocked return attempts.
- Show today's pause count.
- Show riskiest/distracted timeframe.
- Show strongest-pull insight when available.
- Show active blocks and schedules.
- Show time-spent ranking for today.
- Show most-visited ranking for today.
- Show usage distribution by hour.
- Provide action buttons to protect a peak hour, review usage, or add a relevant rule.

### 7.3 Daily Limits

Users must be able to add a domain and set a daily time limit. When the limit is reached, Saturn should block or redirect future visits according to the selected enforcement tier.

Required capabilities:

- Normalize user-entered domains.
- Support per-domain enabled/disabled state.
- Support editable limit duration.
- Support enforcement tiers.
- Reset usage daily.
- Keep limit-created rules editable after creation.
- Notify users near or at limits when notifications are enabled.

### 7.4 Focus Schedules

Users must be able to create recurring scheduled blocks for distracting sites.

Required capabilities:

- Set domain, start time, end time, days of week, enabled state, and enforcement tier.
- Support schedules that cross midnight.
- Show active scheduled blocks in the dashboard.
- Allow editing, disabling, and removing schedules.
- Reconcile schedules on startup and extension load.
- Track scheduled-block reclaim contribution separately from limit-block reclaim contribution.

### 7.5 Preset Templates

Presets reduce blank-screen setup friction. They should give users quick, opinionated starting points that can be applied in one or two clicks and edited afterward.

Current built-in presets:

| Preset | Rule type | Default behavior | Default sites |
| --- | --- | --- | --- |
| Study Mode | Daily limits | Standard tier, 30 minutes per day | youtube.com, reddit.com, tiktok.com, instagram.com, netflix.com |
| Deep Work Mode | Daily limits | Strict tier, 10 minutes per day | youtube.com, reddit.com, x.com, espn.com, cnn.com |
| Sleep Schedule | Scheduled blocks | Standard tier, 10:30 PM to 6:30 AM every day | youtube.com, netflix.com, reddit.com, tiktok.com, instagram.com |

Required capabilities:

- Present each preset with a name, purpose, recommended use case, enforcement tier, rule type, and preview of affected sites.
- Apply only rules that are not already covered, avoiding duplicate rules.
- Leave conflicting domains unchanged and explain what happened.
- Respect free-plan caps and explain when a preset is partially applied.
- Emit a low-cardinality `preset_applied` analytics event with allowed properties such as `preset_id`, `rule_type`, `created_count`, `skipped_count`, `conflict_count`, and `capped_count`.

### 7.6 Blocked Page

The blocked page is the moment where Saturn must convert an impulse into a deliberate choice.

Required capabilities:

- Explain that the current site is blocked by a limit or schedule.
- Show enough context to make the block feel understandable.
- Support allowed escape routes based on enforcement tier.
- Track blocked attempts and estimated reclaimed time.
- Offer snooze or undo/reset behavior only when allowed by the tier.
- Keep the design serious, minimal, and focused.

### 7.7 Enforcement Tiers

Saturn should support a range of friction levels so users can choose the boundary that fits the moment.

Required tiers:

- Lenient: Allows easy recovery or reset when the user wants soft friction.
- Standard: Provides ordinary blocking with controlled escape routes.
- Strict: Requires a challenge before snoozing or bypassing.
- Immutable: Does not allow normal snooze and supports only limited emergency override behavior.

### 7.8 Insights, Profile, and Journey

Saturn should make progress visible so users understand the benefit of repeated small interruptions.

Required capabilities:

- Generate personal insights from usage, visits, blocked attempts, and recurring patterns.
- Allow users to dismiss insights.
- Show total reclaimed time.
- Show total blocked attempts.
- Separate limit-driven and schedule-driven contribution where useful.
- Convert reclaimed time into journey progress with milestones.
- Keep copy motivating, not judgmental.

### 7.9 Onboarding

Onboarding should help users understand the essential workflow without creating friction.

Required capabilities:

- Introduce dashboard, limits, schedules, and blocked-page behavior.
- Allow skip and completion.
- Track onboarding started, completed, and skipped events.
- Avoid requiring onboarding completion before users can create value.

### 7.10 Review and Feedback Prompt

Saturn should ask for reviews only after the user has likely experienced value.

Required capabilities:

- Delay the first prompt after install.
- Require meaningful eligibility such as multiple dashboard opens, multiple protected domains, a schedule, several usage days, or reclaimed time.
- Offer review, feedback, dismiss, and not-now actions.
- Stop prompting after review or feedback submission.
- Track low-cardinality review prompt events.

### 7.11 Premium

Saturn Pro should expand power-user capacity while preserving a useful free experience.

Current free-plan caps:

- Up to 3 tracked domains.
- Up to 1 scheduled block.

Required capabilities:

- Clearly explain premium limits at the moment a user hits a cap.
- Use the Cloudflare Worker to start Whop checkout.
- Verify premium state without exposing payment secrets in the extension.
- Allow users to manage or refresh premium status.
- Avoid changing user-created rules unexpectedly when premium state changes.

### 7.12 Public Website

The website should convert visitors by showing the actual product and explaining the habit-interruption value.

Required capabilities:

- Explain Saturn's value above the fold.
- Link to the Chrome Web Store.
- Show actual extension UI or an interactive demo.
- Explain how limits, schedules, blocking, and progress work.
- Provide privacy, changelog, and feedback paths.
- Track website CTA and section interactions with allowed analytics properties.

## 8. Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Users can add, edit, enable, disable, and remove daily domain limits. | P0 |
| FR-2 | Users can add, edit, enable, disable, and remove recurring scheduled blocks. | P0 |
| FR-3 | Saturn tracks active time on configured domains and resets daily usage. | P0 |
| FR-4 | Saturn redirects or blocks visits when limits or schedules apply. | P0 |
| FR-5 | Saturn supports lenient, standard, strict, and immutable enforcement tiers. | P0 |
| FR-6 | Users can apply Study Mode, Deep Work Mode, and Sleep Schedule presets. | P0 |
| FR-7 | Preset-created rules are editable and do not duplicate existing rules. | P0 |
| FR-8 | Saturn records blocked attempts and estimated reclaimed time. | P0 |
| FR-9 | Dashboard shows usage, visits, active blocks, strongest pull, and progress. | P0 |
| FR-10 | Profile shows cumulative reclaimed time, blocked attempts, and journey progress. | P1 |
| FR-11 | Onboarding introduces the core workflow and can be skipped. | P1 |
| FR-12 | Review prompts appear only after value-based eligibility is met. | P1 |
| FR-13 | Free caps are enforced and premium upgrade paths are available at cap moments. | P1 |
| FR-14 | Analytics events avoid raw URLs, raw domains, email addresses, notes, and high-cardinality identifiers. | P0 |
| FR-15 | The public website accurately reflects current extension capabilities. | P1 |

## 9. UX Requirements

- Users should understand what Saturn does within 10 seconds of opening the extension or website.
- A new user should be able to create a useful rule or apply a preset within 60 seconds.
- Presets should feel helpful and reversible, not like a hidden bulk operation.
- Blocked-page copy should be firm, brief, and understandable.
- Dashboard cards should prioritize scanability over decorative complexity.
- Settings and premium prompts should be available but not dominant during ordinary use.
- Empty states should suggest the next useful action.
- Error messages should explain what happened and how to recover.

## 10. Analytics and Success Metrics

Activation metrics:

- Install to first popup open.
- Install to onboarding started.
- Install to onboarding completed or skipped.
- Install to first limit created.
- Install to first schedule created.
- Install to first preset applied.
- Install to first block reached.

Engagement metrics:

- Daily and weekly popup opens.
- Active days per install.
- Number of configured domains.
- Number of configured schedules.
- Preset applications by preset ID.
- Blocked attempts per active user.
- Reclaimed time per active user.
- Dashboard opens after first block.

Retention metrics:

- Day 1, Day 7, and Day 30 active extension usage.
- Repeat blocked attempts after first block.
- Repeat rule edits after preset application.
- Users with two or more active focus rules.

Growth and monetization metrics:

- Chrome Web Store CTA clicks from the website.
- Chrome Web Store installs.
- Review prompt shown to review action conversion.
- Feedback prompt conversion.
- Upgrade clicked.
- Checkout started.
- Premium verification success.

Analytics constraints:

- No raw URLs.
- No raw domain lists in PostHog events.
- No email addresses.
- No user-entered notes.
- No unique redirect IDs, client IDs, or high-cardinality browsing identifiers.
- Extension analytics should be production-gated where appropriate.

## 11. Release Acceptance Criteria

A release is acceptable when:

- Core limit and schedule blocking works in Chrome.
- Existing user rules survive update and migration.
- Presets apply correctly, respect caps, and avoid duplicates.
- Strict and immutable behavior cannot be bypassed through normal snooze/reset flows.
- Blocked attempts and reclaimed time update correctly.
- Dashboard and profile values remain internally consistent.
- Onboarding and review prompts do not block ordinary usage.
- Premium checkout and verification flows fail gracefully when external services are unavailable.
- Public website messaging matches actual product behavior.
- Jest unit tests and relevant Playwright flows pass.
- Store assets, manifest version, and release zip are prepared for Chrome Web Store submission.

## 12. Milestones

### Milestone 1: Core Focus Loop

- Daily limit creation and enforcement.
- Blocked page.
- Basic usage stats.
- Daily reset.

### Milestone 2: Fast Setup and Flexible Enforcement

- Preset templates.
- Scheduled blocks.
- Enforcement tiers.
- Snooze/reset/challenge behavior.

### Milestone 3: Retention and Motivation

- Dashboard insights.
- Profile and journey progress.
- Notifications.
- Review prompt.

### Milestone 4: Growth and Monetization

- Public website and interactive demo.
- Chrome Web Store listing assets.
- Whop premium handoff.
- Premium verification and cap management.

## 13. Risks and Dependencies

Risks:

- Chrome extension permissions may create trust friction if not explained clearly.
- Schedule reconciliation across browser restarts must remain reliable.
- Strict and immutable tiers can frustrate users if escape behavior is unclear.
- Preset caps can make free users feel blocked if partial application messaging is weak.
- Analytics must remain privacy-conscious as new events are added.
- Website claims can drift from extension behavior if product changes are not reflected in copy.

Dependencies:

- Chrome Extensions Manifest V3 APIs.
- Chrome storage, tabs, alarms, notifications, and declarative net request APIs.
- Cloudflare Worker for analytics and premium handoff.
- PostHog for product analytics.
- Whop for premium checkout and membership verification.
- Vercel for the public website.

## 14. Open Questions

1. Should Saturn keep college students as the primary audience, or broaden positioning toward all productivity users?
2. Should preset templates be customizable before apply, or remain one-click with editing afterward?
3. Should Saturn Pro offer only higher caps, or also advanced features such as unlimited presets, reports, or cross-device sync?
4. Should alternative browser support be prioritized after Chrome growth stabilizes?
5. What is the minimum activation event that best predicts retention: first limit, first schedule, first preset, or first block?
6. Should the journey system remain central to the product identity or become a lighter retention layer?
7. What review-prompt threshold produces high-quality reviews without annoying retained users?
