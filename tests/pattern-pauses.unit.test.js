const PatternPauses = require("../pattern-pauses.js");

function behaviorHistory(now, events) {
  return {
    [PatternPauses.getDayKey(new Date(now))]: {
      count: events.length,
      events,
    },
  };
}

function repeatedInstagramHistory(now) {
  const minute = PatternPauses.MINUTE_MS;
  return behaviorHistory(now, [
    {
      type: "navigation_visit",
      domain: "instagram.com",
      timestamp: now - 22 * minute,
    },
    {
      type: "new_tab_quick_nav",
      domain: "instagram.com",
      timestamp: now - 22 * minute + 500,
    },
    {
      type: "navigation_visit",
      domain: "docs.google.com",
      timestamp: now - 15 * minute,
    },
    {
      type: "navigation_visit",
      domain: "instagram.com",
      timestamp: now - 10 * minute,
    },
    {
      type: "new_tab_quick_nav",
      domain: "instagram.com",
      timestamp: now - 10 * minute + 500,
    },
    {
      type: "navigation_visit",
      domain: "mail.google.com",
      timestamp: now - 4 * minute,
    },
    {
      type: "navigation_visit",
      domain: "instagram.com",
      timestamp: now - minute,
    },
  ]);
}

describe("Pattern Pause engine", () => {
  const now = new Date(2026, 7, 19, 14, 0, 0).getTime();

  test("builds explainable evidence and a mixed-site timeline", () => {
    const evidence = PatternPauses.buildPatternEvidence(
      { behaviorHistory: repeatedInstagramHistory(now), now },
      "www.instagram.com",
      { now, windowMinutes: 30 },
    );

    expect(evidence).toEqual(
      expect.objectContaining({
        domain: "instagram.com",
        visitCount: 3,
        newTabCount: 2,
        interspersedReturnCount: 2,
        existingTabVisitCount: 1,
        newTabVisitCount: 2,
        afterCloseVisitCount: 0,
        signalCount: 4,
        observedWindowMinutes: 21,
      }),
    );
    expect(evidence.timeline.map((item) => item.domain)).toEqual([
      "instagram.com",
      "docs.google.com",
      "instagram.com",
      "mail.google.com",
      "instagram.com",
    ]);
  });

  test("compresses a homogeneous visit loop to three representative nodes", () => {
    const minute = PatternPauses.MINUTE_MS;
    const events = [6, 5, 4, 3, 2, 1].flatMap((minutesAgo) => {
      const timestamp = now - minutesAgo * minute;
      return [
        { type: "navigation_visit", domain: "youtube.com", timestamp },
        {
          type: "new_tab_quick_nav",
          domain: "youtube.com",
          timestamp: timestamp + 500,
        },
      ];
    });
    const evidence = PatternPauses.buildPatternEvidence(
      { behaviorHistory: behaviorHistory(now, events), now },
      "youtube.com",
      { now, windowMinutes: 30 },
    );

    expect(evidence.timeline).toHaveLength(3);
    expect(evidence.timeline.map((item) => item.domain)).toEqual([
      "youtube.com",
      "youtube.com",
      "youtube.com",
    ]);
    expect(evidence.timeline.map((item) => item.timestamp)).toEqual([
      now - 5 * minute,
      now - 3 * minute,
      now - minute,
    ]);
    expect(evidence.newTabVisitCount).toBe(6);
    expect(evidence.existingTabVisitCount).toBe(0);
  });

  test("classifies visit origins without double-counting close returns", () => {
    const minute = PatternPauses.MINUTE_MS;
    const firstAt = now - 3 * minute;
    const lastAt = now - minute;
    const evidence = PatternPauses.buildPatternEvidence(
      {
        behaviorHistory: behaviorHistory(now, [
          { type: "navigation_visit", domain: "reddit.com", timestamp: firstAt },
          { type: "new_tab_quick_nav", domain: "reddit.com", timestamp: firstAt + 500 },
          { type: "navigation_visit", domain: "reddit.com", timestamp: now - 2 * minute },
          { type: "navigation_visit", domain: "reddit.com", timestamp: lastAt },
          { type: "return_after_close", domain: "reddit.com", timestamp: lastAt + 300 },
          { type: "new_tab_quick_nav", domain: "reddit.com", timestamp: lastAt + 500 },
        ]),
        now,
      },
      "reddit.com",
      { now, windowMinutes: 30 },
    );

    expect(evidence).toEqual(
      expect.objectContaining({
        visitCount: 3,
        existingTabVisitCount: 1,
        newTabVisitCount: 1,
        afterCloseVisitCount: 1,
      }),
    );
    expect(evidence.timeline.map((item) => item.visitOrigin)).toEqual([
      "new_tab",
      "existing_tab",
      "after_close",
    ]);
  });

  test("selects a suggestion without requiring a generated insight", () => {
    const candidate = PatternPauses.selectPatternPauseCandidate({
      behaviorHistory: repeatedInstagramHistory(now),
      now,
    });

    expect(candidate).toEqual(
      expect.objectContaining({
        domain: "instagram.com",
        thresholdVisits: 3,
        windowMinutes: 30,
        sourceInsightType: "behavior_pattern",
      }),
    );
  });

  test.each([
    ["hard limit", { blockedDomains: { "instagram.com": { enabled: true } } }],
    [
      "scheduled block",
      { scheduledBlocks: [{ domain: "instagram.com", enabled: true }] },
    ],
    [
      "disabled pattern rule",
      {
        rules: {
          "instagram.com": {
            domain: "instagram.com",
            enabled: false,
            mode: "ongoing",
          },
        },
      },
    ],
    [
      "today dismissal",
      {
        dismissals: {
          "instagram.com": { until: now + PatternPauses.MINUTE_MS },
        },
      },
    ],
  ])("does not suggest over a %s", (_label, exclusion) => {
    const candidate = PatternPauses.selectPatternPauseCandidate({
      behaviorHistory: repeatedInstagramHistory(now),
      now,
      ...exclusion,
    });

    expect(candidate).toBeNull();
  });

  test("respects rule threshold, cooldown, and expiry", () => {
    const evidence = PatternPauses.buildPatternEvidence(
      { behaviorHistory: repeatedInstagramHistory(now), now },
      "instagram.com",
      { now, windowMinutes: 30 },
    );
    const active = PatternPauses.normalizeRule(
      {
        domain: "instagram.com",
        mode: "today",
        thresholdVisits: 3,
        windowMinutes: 30,
        expiresAt: now + PatternPauses.MINUTE_MS,
      },
      now,
    );

    expect(PatternPauses.shouldTrigger(active, evidence, { now })).toBe(true);
    expect(
      PatternPauses.shouldTrigger(
        { ...active, lastTriggeredAt: now - 2 * PatternPauses.MINUTE_MS },
        evidence,
        { now },
      ),
    ).toBe(false);
    expect(
      PatternPauses.shouldTrigger(
        { ...active, expiresAt: now - PatternPauses.MINUTE_MS },
        evidence,
        { now },
      ),
    ).toBe(false);
  });

  test("summarizes outcomes for the review state", () => {
    const summary = PatternPauses.summarizeRuleHistory(
      {
        events: [
          { ruleId: "pattern:instagram.com", type: "shown", timestamp: 1 },
          { ruleId: "pattern:instagram.com", type: "continued", timestamp: 2 },
          { ruleId: "pattern:instagram.com", type: "closed", timestamp: 3 },
        ],
        byRule: {
          "pattern:instagram.com": {
            shown: 2,
            continued: 1,
            closed: 1,
          },
        },
      },
      "pattern:instagram.com",
    );

    expect(summary).toEqual(
      expect.objectContaining({ shown: 2, continued: 1, closed: 1 }),
    );
    expect(summary.events).toHaveLength(3);
  });
});
