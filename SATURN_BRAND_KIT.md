# Saturn Brand Kit

This kit is the source of truth for Saturn-branded extension and website work. It reflects the current shipped design in the Chrome extension, blocked page, welcome page, marketing site, and store media. It supersedes the older light "Screen Time Manager" visual direction unless a task explicitly asks to return to that legacy style.

## Brand Snapshot

**Product name:** Saturn

**Store/SEO name:** Saturn - Screen Time Manager

**Tagline:** Your time. Your universe.

**One-line description:** Saturn helps people limit distracting sites, schedule focus blocks, and see where their time actually goes.

**Core promise:** Add friction between impulse and distraction without shaming the user.

**Primary audience:** Students, builders, professionals, and anyone who reflexively reopens distracting sites while trying to focus.

## Personality

Saturn should feel calm, firm, practical, and a little atmospheric. The product can use space language, but it should stay grounded in real focus behavior.

Use:

- Calm accountability
- Clear boundaries
- Small moments of progress
- Orbit, journey, pause, signal, focus, friction, reclaim
- Direct explanations of what the extension does

Avoid:

- Shame or punishment
- Wellness-coach language
- Generic SaaS hype
- Heavy sci-fi fantasy
- Abstract AI/productivity promises
- Childish or cartoon-heavy space language

## Naming Rules

- Use **Saturn** as the primary brand in product UI, website headings, CTAs, store media, and social previews.
- Use **Saturn - Screen Time Manager** where category clarity helps, such as the Chrome Web Store, manifest, page titles, and SEO copy.
- Avoid using **Screen Time Manager** alone in new customer-facing surfaces unless referring to the legacy product name.
- Use **Add Saturn to Chrome** or **Add to Chrome** for install CTAs.

## Logo And Marks

Primary mark:

- `assets/planets/saturn-app-icon-128.png`
- `assets/planets/saturn-app-icon-48.png`
- `assets/planets/saturn-app-icon-32.png`
- `assets/planets/saturn-app-icon-16.png`

Website copies:

- `website/public/planets/saturn-app-icon-128.png`

Store media:

- `output/store-media/chrome-web-store/saturn-icon-128.png`
- `output/store-media/whop/saturn-whop-avatar-400x400.png`

Usage:

- Keep the icon on transparent or very dark warm backgrounds.
- Preserve the planet silhouette and rings. Do not crop through the rings.
- Use the icon as a standalone mark or next to the word "Saturn."
- Avoid putting the mark in a rounded app tile unless the platform requires it.
- Do not recolor the planet, add neon glows, or pair it with unrelated space clip art.

## Color System

Use the shared token file at `assets/brand/saturn-brand-tokens.css` for new surfaces.

### Core Palette

| Token | Hex / Value | Use |
| --- | --- | --- |
| Deep Space | `#120A08` | Extension background, dark page foundation |
| Orbital Depth | `#1B0F0D` | Background variation and dark panels |
| Eclipse | `#100807` | Deep gradient midpoint |
| Cream | `#F7E7D6` | Primary text |
| Bright Cream | `#FFF8EE` | High-emphasis text and CTA text |
| Burnt Orange | `#D46A44` | Main brand accent, active states |
| Orbit Orange | `#FF8A61` | CTA energy, progress, highlights |
| Orbit Gold | `#FFB18A` | Borders, hover states, warm glow |
| Nebula Cyan | `#8FD2D8` | Secondary accent, focus/support states |
| Mission Green | `#9DB35C` | Active/healthy status |
| Alert Coral | `#FF6A4C` | Danger and firm blocked states |

### Surface Tokens

Use translucent cream and warm-orange overlays instead of flat dark cards:

- Panel: `rgba(247, 231, 214, 0.075)`
- Panel soft: `rgba(247, 231, 214, 0.045)`
- Border: `rgba(247, 231, 214, 0.14)`
- Strong border: `rgba(255, 177, 138, 0.34)`
- Muted text: `rgba(247, 231, 214, 0.66)`
- Warm glow: `rgba(212, 106, 68, 0.42)`

### Gradients

Use warm orbital gradients as the signature look:

```css
background:
  linear-gradient(118deg, rgba(212, 106, 68, 0.16) 0%, rgba(212, 106, 68, 0.055) 34%, transparent 58%),
  linear-gradient(242deg, rgba(143, 210, 216, 0.09) 0%, rgba(143, 210, 216, 0.035) 28%, transparent 52%),
  linear-gradient(180deg, #19110f 0%, #100807 48%, #1a100d 100%);
```

Primary CTA:

```css
background: linear-gradient(135deg, rgba(255, 177, 112, 0.98), rgba(230, 96, 58, 0.94) 48%, rgba(142, 54, 38, 0.96));
```

## Typography

Primary brand stack for website, welcome, and blocked page:

```css
font-family: "Space Grotesk", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
```

Dense extension stack:

```css
font-family: Inter, "Segoe UI", Arial, sans-serif;
```

Rules:

- Use Space Grotesk for expressive website and onboarding headlines.
- Use Inter inside the extension popup where density and tabular readability matter.
- Keep normal letter spacing at `0`.
- Reserve uppercase tracking for small kickers and labels only.
- Prefer compact, confident headings over oversized SaaS-style hero copy.

Suggested type scale:

| Surface | Size |
| --- | --- |
| Website hero | `clamp(3.2rem, 5.45vw, 5rem)` |
| Website section heading | `clamp(2.25rem, 4.2vw, 3.85rem)` |
| Blocked page heading | `24px` to `26px` |
| Popup base | `13px` |
| Popup card title | `13px` to `18px` |
| Micro labels | `10px` to `12px` |

## Shape, Depth, And Motion

Shape:

- Cards: `14px`
- Inputs and compact controls: `10px`
- Website medium controls: `14px`
- Pills: `999px`

Depth:

- Prefer inner highlights plus soft shadow.
- Use `backdrop-filter: blur(18px)` for glass panels.
- Keep glows warm, subtle, and tied to progress or active states.

Motion:

- Use quick transitions: `120ms`, `180ms`, `280ms`.
- Use smooth standard easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Use spring easing only for small progress or unlock moments.
- Respect reduced motion.
- Avoid constant decorative motion on focus surfaces.

## UI Components

### Extension Popup

The popup is a compact command center.

- Fixed design target: `560px` wide by `570px` high.
- Keep tab navigation dense and predictable.
- Use card hierarchy: dominant cards for today's focus/progress, quieter cards for lists and settings.
- Use warm CTA gradients for primary actions.
- Use cyan sparingly for support, schedule, and secondary focus signals.
- Keep analytics readable with compact labels, clear numbers, and no unnecessary chart decoration.

### Website

The website should feel like the extension expanded into a public product story.

- Keep Saturn and the product UI visible in the first viewport.
- Use realistic product previews and live extension captures as the visual identity.
- Use a dark warm page foundation rather than blue SaaS gradients.
- Keep the hero direct: what Saturn does, why it helps, and how to install.
- Use the planet journey system as a signature feature, not as background decoration.

### Blocked Page

The blocked page is a brand-defining moment.

- Tone: calm, firm, minimal, helpful.
- Show the blocked domain clearly.
- Explain the reason without scolding.
- Make the next action obvious.
- Keep challenge and snooze controls visually secondary to the block message.

### Welcome Page

The welcome page should make the extension feel active and ready.

- Use the Saturn mark prominently.
- Explain setup in practical steps.
- Keep the mood warm and focused.
- Treat pinning, limits, and schedules as immediate user actions.

### Cards

Use layered warm glass:

```css
background:
  linear-gradient(180deg, rgba(247, 231, 214, 0.075), rgba(247, 231, 214, 0.025)),
  linear-gradient(165deg, rgba(212, 106, 68, 0.11), transparent 54%),
  rgba(247, 231, 214, 0.075);
```

Cards should have clear information hierarchy. Avoid card-within-card layouts unless the inner element is a true repeated item or compact list row.

### Buttons

Primary buttons:

- Warm orange/gold gradient
- Bright cream text
- Strong border on hover
- Used for install, add, continue, save, and primary setup actions

Secondary buttons:

- Dark translucent fill
- Warm border
- Cream or muted cream text

Destructive or firm actions:

- Use Alert Coral and warm borders.
- Keep copy direct, not dramatic.

### Pills And Status

Use pills for active state, plan state, time filters, and compact labels.

- Active/healthy: Mission Green
- Focus/support: Nebula Cyan
- Limit/blocked: Orbit Orange or Alert Coral
- Neutral: muted cream on translucent warm surface

## Iconography And Imagery

Primary imagery:

- Saturn app icon
- Planet milestone assets in `assets/planets/`
- Rocket and mission path assets for reclaimed-time journey
- Real extension screenshots and product previews

Line icons:

- Use simple line icons for clock, pause, calendar, pointer, shield, settings, and trend concepts.
- Keep stroke width consistent.
- Use cream, orange, cyan, or muted cream.

Avoid:

- Emoji-first UI
- Stock photography
- Abstract 3D shapes
- Random astronomy assets that do not connect to the Saturn journey system
- Blue/purple AI gradient language

## Copy System

Voice:

- Clear
- Calm
- Practical
- Firm when blocking
- Encouraging through evidence, not cheerleading

Approved phrases:

- Your time. Your universe.
- Limit distracting sites, schedule focus blocks, and see where your time actually goes.
- Saturn adds a pause between impulse and action.
- Turn an automatic tab check into a choice you can notice.
- Every blocked distraction becomes a little signal.
- You reclaimed 30 minutes this week.
- Focus block active.
- Daily limit reached.

CTAs:

- Add Saturn to Chrome
- Add to Chrome
- Set a limit
- Add site
- Start focus block
- Review progress
- Send feedback

Avoid:

- Unlock your potential
- Crush distractions
- Transform your life
- You failed
- Wasted time
- Digital wellness journey
- AI-powered productivity

## Store And Marketing Assets

Chrome Web Store assets:

- `output/store-media/chrome-web-store/saturn-icon-128.png`
- `output/store-media/chrome-web-store/saturn-promo-small-440x280.png`
- `output/store-media/chrome-web-store/saturn-promo-marquee-1400x560.png`
- `output/store-media/chrome-web-store/saturn-screenshot-1-dashboard-1280x800.png`
- `output/store-media/chrome-web-store/saturn-screenshot-2-limits-1280x800.png`
- `output/store-media/chrome-web-store/saturn-screenshot-3-schedules-1280x800.png`
- `output/store-media/chrome-web-store/saturn-screenshot-4-blocked-page-1280x800.png`
- `output/store-media/chrome-web-store/saturn-screenshot-5-profile-1280x800.png`

Whop assets:

- `output/store-media/whop/saturn-whop-avatar-400x400.png`
- `output/store-media/whop/saturn-whop-banner-2000x1000.png`
- `output/store-media/whop/saturn-whop-product-1280x720.png`
- `output/store-media/whop/saturn-whop-premium-product-1280x720.png`

Asset guidance:

- Use product UI and store screenshots as primary proof.
- Keep copy large, direct, and cream-colored.
- Use the icon and orange orbital path as recurring brand anchors.
- Do not overfill store images with UI text.

## Accessibility

- Maintain strong contrast between cream text and dark warm backgrounds.
- Do not rely on orange/cyan alone to explain status.
- Preserve visible focus states for all controls.
- Keep extension controls large enough for Chrome popup use.
- Avoid motion-heavy states on blocked and setup surfaces.
- Make long domains wrap safely.

## Implementation Checklist

For new extension or website work:

1. Start from `assets/brand/saturn-brand-tokens.css`.
2. Use Saturn naming unless a store or SEO context needs "Saturn - Screen Time Manager."
3. Use warm dark backgrounds, cream text, orange/gold CTAs, and cyan as a secondary signal.
4. Use real product UI, planet journey assets, or store captures for visuals.
5. Keep copy practical and non-shaming.
6. Check mobile and popup constraints before shipping.
7. If a surface looks like a generic blue SaaS page, bring it back to the warm Saturn system.

## Current Design Sources

These files currently express the Saturn design language:

- `popup.css`
- `blocked.css`
- `welcome.css`
- `website/src/styles.css`
- `assets/planets/`
- `output/store-media/README.md`

