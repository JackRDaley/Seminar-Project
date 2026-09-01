import { useEffect } from "react";
import posthog from "./posthog.js";

const storeUrl = "https://chromewebstore.google.com/detail/saturn-screen-time-manage/pecaajdaecdmikcgfdgldcofdebhfbgo";
const feedbackUrl = "https://www.surveymonkey.com/r/QF2RJ58";
const productHuntUrl = "https://www.producthunt.com/products/screen-time-manager";

const benefits = [
  ["block", "Block", "Pause distracting sites before a detour begins.", "pause"],
  ["limit", "Limit", "Set a daily cap that protects time for what matters.", "clock"],
  ["schedule", "Schedule", "Automate focus hours so distractions stay out of reach.", "calendar"],
  ["review", "Review", "See the patterns in your habits and the time you reclaim.", "chart"],
];

const featureDetails = [
  ["Website blocking", "Block distracting sites before they pull you back in.", "pause"],
  ["Daily limits", "Set time limits for specific domains so quick checks do not become long sessions.", "clock"],
  ["Focus schedules", "Create recurring windows where distracting websites stay unavailable.", "calendar"],
  ["Activity dashboard", "See blocked pages, repeat visits, and usage patterns in one clear view.", "chart"],
  ["Adjustable friction", "Use gentle reminders or stricter rules depending on the moment.", "pause"],
  ["Privacy-conscious tracking", "Track only what Saturn needs for blocking, limits, and useful activity summaries.", "chart"],
];

const journeyStops = [
  ["Earth", "12%"],
  ["Moon", "29%"],
  ["Mars", "45%"],
  ["Jupiter", "62%"],
  ["Saturn", "87%"],
];

const faqs = [
  ["Is Saturn free?", "Saturn is free to install from the Chrome Web Store, and you do not need an account to get started."],
  ["How do I get started?", "Add one distracting site, choose a daily limit, recurring schedule, or firmer focus block, then adjust or remove the rule whenever your routine changes."],
  ["Can I block specific websites?", "Yes. Add the domains that distract you, then choose limits, schedules, or firmer focus blocks for each one."],
  ["Does Saturn track everything I do online?", "No. Saturn focuses on domain-level activity, configured limits, blocked attempts, and the usage data needed for the product to work."],
  ["Does Saturn work outside Chrome?", "Saturn is currently built for Google Chrome."],
];

const walkthroughCallouts = [
  {
    key: "summary",
    number: "01",
    side: "left",
    title: "Your day, at a glance",
    description: "See reclaimed time, pauses, and your riskiest hour in one place.",
  },
  {
    key: "journey",
    number: "02",
    side: "right",
    title: "Progress you can feel",
    description: "Watch reclaimed time move your journey toward the next planet.",
  },
  {
    key: "blocks",
    number: "03",
    side: "left",
    title: "What’s protected now",
    description: "See every active block and how much time remains.",
  },
  {
    key: "habits",
    number: "04",
    side: "right",
    title: "The habits underneath",
    description: "Spot which sites consume the most time and attention.",
  },
  {
    key: "risk",
    number: "05",
    side: "right",
    title: "Your riskiest window",
    description: "Find the hour distraction is strongest, then protect it.",
  },
];

function trackStore(location) {
  posthog.capture("chrome_web_store_clicked", { action: "click", cta_location: location, destination: "chrome_web_store", link_text: "Add to Chrome", section_id: location });
}

function trackFeedback(location) {
  posthog.capture("feedback_clicked", { action: "click", cta_location: location, destination: "feedback", link_text: "Send feedback", section_id: location });
}

function BenefitIcon({ icon }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: "1.65", strokeLinecap: "round", strokeLinejoin: "round" };
  if (icon === "pause") return <svg viewBox="0 0 28 28" {...common}><circle cx="14" cy="14" r="10" /><path d="M11.5 10v8M16.5 10v8" /></svg>;
  if (icon === "clock") return <svg viewBox="0 0 28 28" {...common}><circle cx="14" cy="14" r="10" /><path d="M14 8v6l4 2" /></svg>;
  if (icon === "calendar") return <svg viewBox="0 0 28 28" {...common}><rect x="5" y="6.5" width="18" height="16" /><path d="M5 11h18M9 4v5M19 4v5M9 15h2M14 15h2M19 15h.01M9 19h2M14 19h2" /></svg>;
  return <svg viewBox="0 0 28 28" {...common}><path d="M5 22V15M11 22V10M17 22V5M23 22V13" /></svg>;
}

function StoreButton({ location }) {
  return <a className="store-button" href={storeUrl} onClick={() => trackStore(location)} target="_blank" rel="noreferrer"><span className="chrome-logo-image" aria-hidden="true" /><span>Add to Chrome</span></a>;
}

function SketchArrow({ direction }) {
  const pointsRight = direction === "right";
  return <svg className={`walkthrough-arrow walkthrough-arrow--${direction}`} viewBox="0 0 190 74" aria-hidden="true">
    <path d={pointsRight ? "M5 20 C49 50 119 54 179 28" : "M185 18 C142 49 72 55 11 31"} />
    <path className="walkthrough-arrow-echo" d={pointsRight ? "M7 23 C53 52 121 56 179 29" : "M183 21 C140 52 70 57 11 32"} />
    <path d={pointsRight ? "M164 24 L179 28 L170 41" : "M27 25 L11 31 L21 43"} />
  </svg>;
}

function ProductWalkthrough() {
  return <section className="product-section product-walkthrough" id="product">
    <header className="walkthrough-kicker"><span>01</span><span aria-hidden="true">/</span><span>Product walkthrough</span></header>
    <div className="walkthrough-stage">
      {walkthroughCallouts.map((callout) => <article className={`walkthrough-callout walkthrough-callout--${callout.side} walkthrough-callout--${callout.key}`} key={callout.key}>
        {callout.side === "right" ? <SketchArrow direction="left" /> : null}
        <div><h2>{callout.title}</h2><p>{callout.description}</p></div>
        {callout.side === "left" ? <SketchArrow direction="right" /> : null}
      </article>)}

      <figure className="walkthrough-product">
        <div className="walkthrough-dashboard-frame">
          <img src="/saturn-dashboard-walkthrough.png" alt="Saturn dashboard showing the daily focus summary, space journey, active blocks, site rankings, and hourly usage" />
          <svg className="walkthrough-mobile-map" viewBox="0 0 560 1147" aria-hidden="true">
            <g><path d="M14 155 C70 170 112 193 166 224" /><path d="M151 210 L166 224 L147 228" /><circle cx="14" cy="155" r="12" /><text x="14" y="160">1</text></g>
            <g><path d="M546 438 C505 447 472 466 430 492" /><path d="M446 475 L430 492 L452 493" /><circle cx="546" cy="438" r="12" /><text x="546" y="443">2</text></g>
            <g><path d="M14 578 C67 588 103 600 145 625" /><path d="M129 609 L145 625 L124 627" /><circle cx="14" cy="578" r="12" /><text x="14" y="583">3</text></g>
            <g><path d="M546 748 C500 757 468 777 427 806" /><path d="M444 787 L427 806 L451 804" /><circle cx="546" cy="748" r="12" /><text x="546" y="753">4</text></g>
            <g><path d="M546 1067 C508 1053 477 1032 447 1007" /><path d="M468 1013 L447 1007 L454 1027" /><circle cx="546" cy="1067" r="12" /><text x="546" y="1072">5</text></g>
          </svg>
        </div>
      </figure>
    </div>

    <div className="walkthrough-mobile-notes">
      {walkthroughCallouts.map((callout) => <article key={callout.key}><span>{callout.number}</span><div><h2>{callout.title}</h2><p>{callout.description}</p></div></article>)}
    </div>
  </section>;
}

function JourneyRoute() {
  return <figure className="journey-map" aria-label="Focus journey from Earth to Saturn">
    <img src="/journey-engraved-v4.png" alt="" />
    <figcaption>{journeyStops.map(([label, position], index) => <span className={index === 0 ? "is-current" : ""} style={{ "--stop": position }} key={label}>{label}</span>)}</figcaption>
  </figure>;
}

export default function App() {
  useEffect(() => {
    const seen = new Set();
    const recordDepth = () => {
      const available = document.documentElement.scrollHeight - window.innerHeight;
      if (available <= 0) return;
      const depth = Math.round((window.scrollY / available) * 100);
      [25, 50, 75, 90].forEach((threshold) => {
        if (depth < threshold || seen.has(threshold)) return;
        seen.add(threshold);
        posthog.capture("website_scroll_depth", { action: "scroll", percent_scrolled: threshold, section_id: "page" });
      });
    };
    window.addEventListener("scroll", recordDepth, { passive: true });
    return () => window.removeEventListener("scroll", recordDepth);
  }, []);

  return <main className="site-shell">
    <header className="site-header">
      <a className="wordmark" href="#top">Saturn</a>
      <nav aria-label="Main navigation"><a href="#product">Product</a><a href="#features">Features</a><a href="#journey">Journey</a><a href="#faq">FAQ</a><a href={feedbackUrl} onClick={() => trackFeedback("header")} target="_blank" rel="noreferrer">Feedback</a></nav>
      <StoreButton location="header" />
    </header>

    <section className="hero" id="top">
      <div className="hero-reference-art" aria-hidden="true" />
      <div className="hero-copy"><h1>Keep the<br />internet in<br />its place.</h1><span className="orange-rule" /><p>Saturn puts a pause between you and the tabs that steal your time.</p><StoreButton location="hero" /></div>
    </section>

    <section className="benefit-strip" aria-label="Saturn features">
      {benefits.map(([key, label, description, icon]) => <article key={key} tabIndex="0"><div className="benefit-summary"><BenefitIcon icon={icon} /><h2>{label}</h2><span className="orange-rule" /></div><p className="benefit-description">{description}</p></article>)}
    </section>

    <ProductWalkthrough />

    <section className="quote-band"><div className="quote-planet"><img src="/saturn-concept-hero.png" alt="" /></div><blockquote><span>“</span><p>Really like how it tracks how often you try to revisit blocked sites - that little number made me think twice before clicking reddit again. Simple and does the job without a bunch of extra fluff.</p><footer>Aras Yaka <b>—</b> Product Hunt</footer></blockquote><StoreButton location="testimonial" /></section>

    <section className="journey-section" id="journey">
      <div className="editorial-heading"><span className="section-number">02</span><span className="orange-rule" /><h2>Put your reclaimed time into perspective.</h2><p>Every blocked distraction and minute reclaimed moves your journey farther through the solar system.</p></div>
      <JourneyRoute />
    </section>

    <section className="features-section" id="features">
      <header className="section-rail features-rail"><div><span className="section-number">03</span><span className="orange-rule" /></div><h2>Simple controls.<br />Useful signals.</h2><p>Everything you need to interrupt the habit, without turning your browser into a punishment system.</p></header>
      <div className="feature-detail-list">{featureDetails.map(([title, detail, icon]) => <article key={title}><BenefitIcon icon={icon} /><div><h3>{title}</h3><p>{detail}</p></div></article>)}</div>
    </section>

    <section className="faq-section" id="faq">
      <div><span className="section-number">04</span><span className="orange-rule" /><h2>Questions<br />before you<br />install.</h2></div>
      <div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
    </section>

    <section className="closing-section"><div><span>Ready to focus?</span><h2>Start with one distracting site.</h2><p>Choose the site that pulls you off task most often and give your next focus session a stronger boundary.</p></div><StoreButton location="final_cta" /></section>

    <footer className="site-footer"><a className="wordmark" href="#top">Saturn</a><span>For a calmer relationship with the web.</span><nav aria-label="Footer navigation"><a href={storeUrl} onClick={() => trackStore("footer")} target="_blank" rel="noreferrer">Chrome Web Store</a><a href={productHuntUrl} target="_blank" rel="noreferrer">Product Hunt</a><a href="/privacy">Privacy</a><a href="/changelog">Changelog</a><a href={feedbackUrl} onClick={() => trackFeedback("footer")} target="_blank" rel="noreferrer">Feedback</a></nav></footer>
  </main>;
}
