(function initPatternPauseEngine(global) {
  "use strict";

  const MINUTE_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * MINUTE_MS;
  const DEFAULT_THRESHOLD_VISITS = 3;
  const DEFAULT_WINDOW_MINUTES = 30;
  const DEFAULT_COOLDOWN_MINUTES = 5;
  const DEFAULT_BYPASS_MINUTES = 10;
  const MAX_TIMELINE_ITEMS = 5;
  const HOMOGENEOUS_TIMELINE_ITEMS = 3;
  const VISIT_SIGNAL_MATCH_MS = 2000;
  const DOMAIN_LABELS = Object.freeze({
    "docs.google.com": "Google Docs",
    "github.com": "GitHub",
    "gmail.com": "Gmail",
    "linkedin.com": "LinkedIn",
    "mail.google.com": "Gmail",
    "tiktok.com": "TikTok",
    "youtube.com": "YouTube",
  });
  const SUPPORTED_INSIGHT_TYPES = Object.freeze([
    "quick_return_pattern",
    "interspersed_visit_pattern",
    "limit_suggestion",
  ]);

  function normalizeDomain(input) {
    const raw = String(input || "")
      .trim()
      .toLowerCase();
    if (!raw) return "";

    try {
      const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
      return new URL(withProtocol).hostname.replace(/^www\./, "");
    } catch {
      return raw.replace(/^www\./, "").split("/")[0];
    }
  }

  function isValidDomain(domain) {
    const value = normalizeDomain(domain);
    if (!value || value.length > 255 || value.includes("..")) return false;
    if (!/^[a-z0-9.-]+$/.test(value)) return false;
    return value
      .split(".")
      .every((part) => part && !part.startsWith("-") && !part.endsWith("-"));
  }

  function getDayKey(date = new Date()) {
    const value = date instanceof Date ? date : new Date(date);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function endOfLocalDay(timestamp = Date.now()) {
    const date = new Date(timestamp);
    date.setHours(24, 0, 0, 0);
    return date.getTime();
  }

  function clampInteger(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  function normalizeRule(raw = {}, now = Date.now()) {
    const domain = normalizeDomain(raw.domain);
    const mode = raw.mode === "ongoing" ? "ongoing" : "today";
    const createdAt = Math.max(0, Number(raw.createdAt || now));
    const expiresAt =
      mode === "ongoing"
        ? 0
        : Math.max(createdAt, Number(raw.expiresAt || endOfLocalDay(now)));

    return {
      id: String(raw.id || `pattern:${domain}`),
      domain,
      enabled: raw.enabled !== false,
      mode,
      createdAt,
      updatedAt: Math.max(createdAt, Number(raw.updatedAt || createdAt)),
      expiresAt,
      thresholdVisits: clampInteger(
        raw.thresholdVisits,
        3,
        10,
        DEFAULT_THRESHOLD_VISITS,
      ),
      windowMinutes: clampInteger(
        raw.windowMinutes,
        15,
        120,
        DEFAULT_WINDOW_MINUTES,
      ),
      minSignals: clampInteger(raw.minSignals, 1, 5, 1),
      cooldownMinutes: clampInteger(
        raw.cooldownMinutes,
        1,
        60,
        DEFAULT_COOLDOWN_MINUTES,
      ),
      bypassMinutes: clampInteger(
        raw.bypassMinutes,
        1,
        60,
        DEFAULT_BYPASS_MINUTES,
      ),
      sourceInsightType: String(raw.sourceInsightType || "behavior_pattern"),
      lastTriggeredAt: Math.max(0, Number(raw.lastTriggeredAt || 0)),
      lastOutcomeAt: Math.max(0, Number(raw.lastOutcomeAt || 0)),
    };
  }

  function isRuleActive(rule, now = Date.now()) {
    const normalized = normalizeRule(rule, now);
    if (!isValidDomain(normalized.domain) || !normalized.enabled) return false;
    return normalized.mode === "ongoing" || normalized.expiresAt > now;
  }

  function activeRules(rules = {}, now = Date.now()) {
    return Object.values(rules || {})
      .map((rule) => normalizeRule(rule, now))
      .filter((rule) => isRuleActive(rule, now))
      .sort(
        (a, b) =>
          Number(b.updatedAt || b.createdAt || 0) -
          Number(a.updatedAt || a.createdAt || 0),
      );
  }

  function ruleForDomain(rules = {}, domain, now = Date.now()) {
    const normalizedDomain = normalizeDomain(domain);
    const direct = rules?.[normalizedDomain];
    if (direct && isRuleActive(direct, now)) return normalizeRule(direct, now);

    const match = Object.values(rules || {}).find(
      (rule) =>
        normalizeDomain(rule?.domain) === normalizedDomain &&
        isRuleActive(rule, now),
    );
    return match ? normalizeRule(match, now) : null;
  }

  function todayEvents(behaviorHistory = {}, now = Date.now()) {
    const day = behaviorHistory?.[getDayKey(new Date(now))] || {};
    return (Array.isArray(day.events) ? day.events : [])
      .filter((event) => Number.isFinite(Number(event?.timestamp)))
      .map((event) => ({ ...event, timestamp: Number(event.timestamp) }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  function countInterspersedReturns(navigationEvents, domain) {
    const normalized = normalizeDomain(domain);
    let previousTargetIndex = -1;
    let count = 0;

    navigationEvents.forEach((event, index) => {
      if (normalizeDomain(event.domain) !== normalized) return;
      if (
        previousTargetIndex >= 0 &&
        navigationEvents
          .slice(previousTargetIndex + 1, index)
          .some((item) => normalizeDomain(item.domain) !== normalized)
      ) {
        count += 1;
      }
      previousTargetIndex = index;
    });

    return count;
  }

  function timelineForDomain(navigationEvents, domain) {
    const normalized = normalizeDomain(domain);
    const targetIndexes = navigationEvents
      .map((event, index) =>
        normalizeDomain(event.domain) === normalized ? index : -1,
      )
      .filter((index) => index >= 0);
    if (!targetIndexes.length) return [];

    const lastTargetIndex = targetIndexes[targetIndexes.length - 1];
    const start = Math.max(0, lastTargetIndex - (MAX_TIMELINE_ITEMS - 1));
    const visibleEvents = navigationEvents.slice(start, lastTargetIndex + 1);
    const displayedEvents =
      visibleEvents.length > HOMOGENEOUS_TIMELINE_ITEMS &&
      visibleEvents.every(
        (event) => normalizeDomain(event.domain) === normalized,
      )
        ? [
            visibleEvents[0],
            visibleEvents[Math.floor((visibleEvents.length - 1) / 2)],
            visibleEvents[visibleEvents.length - 1],
          ]
        : visibleEvents;

    return displayedEvents.map((event) => ({
      domain: normalizeDomain(event.domain),
      timestamp: Number(event.timestamp || 0),
      isTarget: normalizeDomain(event.domain) === normalized,
      visitOrigin: "existing_tab",
      fromNewTab: false,
      afterClose: false,
    }));
  }

  function buildPatternEvidence(input = {}, domain, options = {}) {
    const now = Number(options.now || input.now || Date.now());
    const normalized = normalizeDomain(domain);
    const windowMinutes = clampInteger(
      options.windowMinutes,
      15,
      120,
      DEFAULT_WINDOW_MINUTES,
    );
    const cutoff = now - windowMinutes * MINUTE_MS;
    const events = todayEvents(input.behaviorHistory || {}, now).filter(
      (event) => event.timestamp >= cutoff && event.timestamp <= now,
    );
    const navigationEvents = events.filter(
      (event) =>
        event.type === "navigation_visit" && isValidDomain(event.domain),
    );
    const domainNavigation = navigationEvents.filter(
      (event) => normalizeDomain(event.domain) === normalized,
    );
    const newTabEvents = events.filter(
      (event) =>
        event.type === "new_tab_quick_nav" &&
        normalizeDomain(event.domain) === normalized,
    );
    const closeReturns = events.filter(
      (event) =>
        event.type === "return_after_close" &&
        normalizeDomain(event.domain) === normalized,
    );
    const interspersedReturns = countInterspersedReturns(
      navigationEvents,
      normalized,
    );
    const firstAt = Number(domainNavigation[0]?.timestamp || 0);
    const lastAt = Number(
      domainNavigation[domainNavigation.length - 1]?.timestamp || 0,
    );
    const observedWindowMinutes =
      firstAt && lastAt
        ? Math.max(1, Math.ceil((lastAt - firstAt) / MINUTE_MS))
        : windowMinutes;
    const timeline = timelineForDomain(navigationEvents, normalized);
    const visitOrigins = domainNavigation.map((visit) => {
      const afterClose = closeReturns.some(
        (event) =>
          Math.abs(Number(event.timestamp || 0) - visit.timestamp) <=
          VISIT_SIGNAL_MATCH_MS,
      );
      const fromNewTab = newTabEvents.some(
        (event) =>
          Math.abs(Number(event.timestamp || 0) - visit.timestamp) <=
          VISIT_SIGNAL_MATCH_MS,
      );
      return {
        timestamp: visit.timestamp,
        visitOrigin: afterClose
          ? "after_close"
          : fromNewTab
            ? "new_tab"
            : "existing_tab",
      };
    });
    const visitOriginCounts = visitOrigins.reduce(
      (counts, visit) => {
        counts[visit.visitOrigin] += 1;
        return counts;
      },
      { existing_tab: 0, new_tab: 0, after_close: 0 },
    );

    timeline.forEach((item) => {
      if (!item.isTarget) return;
      const matching = visitOrigins.find(
        (visit) =>
          Math.abs(Number(item.timestamp || 0) - visit.timestamp) <=
          VISIT_SIGNAL_MATCH_MS,
      );
      if (!matching) return;
      item.visitOrigin = matching.visitOrigin;
      item.fromNewTab = matching.visitOrigin === "new_tab";
      item.afterClose = matching.visitOrigin === "after_close";
    });

    return {
      domain: normalized,
      visitCount: domainNavigation.length,
      newTabCount: newTabEvents.length,
      returnAfterCloseCount: closeReturns.length,
      interspersedReturnCount: interspersedReturns,
      existingTabVisitCount: visitOriginCounts.existing_tab,
      newTabVisitCount: visitOriginCounts.new_tab,
      afterCloseVisitCount: visitOriginCounts.after_close,
      signalCount:
        newTabEvents.length + closeReturns.length + interspersedReturns,
      windowMinutes,
      observedWindowMinutes,
      firstAt,
      lastAt,
      timeline,
    };
  }

  function configuredDomainSet(records = {}) {
    return new Set(
      Object.entries(records || {})
        .filter(([, value]) => value?.enabled !== false)
        .map(([key, value]) => normalizeDomain(value?.domain || key))
        .filter(isValidDomain),
    );
  }

  function dismissalIsActive(dismissals = {}, domain, now = Date.now()) {
    const normalized = normalizeDomain(domain);
    const record = dismissals?.[normalized];
    const until = Number(record?.until || record || 0);
    return until > now;
  }

  function selectPatternPauseCandidate(input = {}) {
    const now = Number(input.now || Date.now());
    const rules = input.rules || {};
    const blockedDomains = configuredDomainSet(input.blockedDomains || {});
    const scheduledDomains = configuredDomainSet(
      (input.scheduledBlocks || []).reduce((result, block) => {
        if (block?.domain) result[block.domain] = block;
        return result;
      }, {}),
    );
    const insightsByDomain = new Map();

    (input.insights || []).forEach((insight) => {
      const domain = normalizeDomain(insight?.domain);
      if (!isValidDomain(domain)) return;
      if (!SUPPORTED_INSIGHT_TYPES.includes(String(insight.type || ""))) return;
      const existing = insightsByDomain.get(domain);
      if (!existing || Number(insight.priority || 0) > Number(existing.priority || 0)) {
        insightsByDomain.set(domain, insight);
      }
    });

    const domains = new Set(insightsByDomain.keys());
    todayEvents(input.behaviorHistory || {}, now).forEach((event) => {
      const domain = normalizeDomain(event.domain);
      if (isValidDomain(domain)) domains.add(domain);
    });

    const candidates = [];
    domains.forEach((domain) => {
      const configuredRule = Object.values(rules || {}).find(
        (rule) => normalizeDomain(rule?.domain) === domain,
      );
      if (
        blockedDomains.has(domain) ||
        scheduledDomains.has(domain) ||
        configuredRule?.enabled === false ||
        ruleForDomain(rules, domain, now) ||
        dismissalIsActive(input.dismissals || {}, domain, now)
      ) {
        return;
      }

      const evidence = buildPatternEvidence(input, domain, {
        now,
        windowMinutes: DEFAULT_WINDOW_MINUTES,
      });
      const insight = insightsByDomain.get(domain) || null;
      const hasSupportedInsight = Boolean(insight);
      const hasBehaviorPattern =
        evidence.visitCount >= DEFAULT_THRESHOLD_VISITS &&
        (evidence.newTabCount >= 2 ||
          evidence.interspersedReturnCount >= 2 ||
          evidence.returnAfterCloseCount >= 1);
      if (!hasSupportedInsight && !hasBehaviorPattern) return;
      if (evidence.visitCount < DEFAULT_THRESHOLD_VISITS) return;

      const score =
        evidence.visitCount * 10 +
        evidence.newTabCount * 8 +
        evidence.interspersedReturnCount * 9 +
        evidence.returnAfterCloseCount * 10 +
        Math.min(140, Number(insight?.priority || 0));
      candidates.push({
        domain,
        evidence,
        insight,
        score,
        thresholdVisits: DEFAULT_THRESHOLD_VISITS,
        windowMinutes: DEFAULT_WINDOW_MINUTES,
        sourceInsightType: String(insight?.type || "behavior_pattern"),
      });
    });

    return candidates.sort((a, b) => b.score - a.score)[0] || null;
  }

  function shouldTrigger(rule, evidence, options = {}) {
    const now = Number(options.now || Date.now());
    const normalized = normalizeRule(rule, now);
    if (!isRuleActive(normalized, now)) return false;
    if (!evidence || normalizeDomain(evidence.domain) !== normalized.domain)
      return false;
    if (Number(evidence.visitCount || 0) < normalized.thresholdVisits)
      return false;
    if (Number(evidence.signalCount || 0) < normalized.minSignals) return false;
    const cooldownMs = normalized.cooldownMinutes * MINUTE_MS;
    if (
      normalized.lastTriggeredAt > 0 &&
      now - normalized.lastTriggeredAt < cooldownMs
    ) {
      return false;
    }
    return true;
  }

  function normalizeHistory(history = {}) {
    return {
      events: Array.isArray(history.events) ? history.events : [],
      byRule: history.byRule && typeof history.byRule === "object" ? history.byRule : {},
    };
  }

  function summarizeRuleHistory(history = {}, ruleOrId) {
    const normalizedHistory = normalizeHistory(history);
    const id =
      typeof ruleOrId === "string"
        ? ruleOrId
        : String(ruleOrId?.id || `pattern:${normalizeDomain(ruleOrId?.domain)}`);
    const summary = normalizedHistory.byRule?.[id] || {};
    const events = normalizedHistory.events
      .filter((event) => String(event?.ruleId || "") === id)
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    return {
      shown: Math.max(0, Number(summary.shown || 0)),
      continued: Math.max(0, Number(summary.continued || 0)),
      closed: Math.max(0, Number(summary.closed || 0)),
      disabled: Math.max(0, Number(summary.disabled || 0)),
      lastAt: Math.max(0, Number(summary.lastAt || 0)),
      events: events.slice(-12),
    };
  }

  function domainLabel(domain) {
    const normalized = normalizeDomain(domain);
    if (DOMAIN_LABELS[normalized]) return DOMAIN_LABELS[normalized];
    const base = normalized.split(".")[0] || normalized;
    if (!base) return "This site";
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  const api = Object.freeze({
    MINUTE_MS,
    DAY_MS,
    DEFAULT_THRESHOLD_VISITS,
    DEFAULT_WINDOW_MINUTES,
    DEFAULT_COOLDOWN_MINUTES,
    DEFAULT_BYPASS_MINUTES,
    SUPPORTED_INSIGHT_TYPES,
    normalizeDomain,
    isValidDomain,
    getDayKey,
    endOfLocalDay,
    normalizeRule,
    isRuleActive,
    activeRules,
    ruleForDomain,
    todayEvents,
    buildPatternEvidence,
    selectPatternPauseCandidate,
    shouldTrigger,
    dismissalIsActive,
    normalizeHistory,
    summarizeRuleHistory,
    domainLabel,
  });

  global.StmPatternPauses = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
