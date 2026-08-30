(() => {
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const dayKey = (offset = 0) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const minute = 60 * 1000;
  const now = Date.now();
  const today = dayKey();

  const domainStats = {
    "youtube.com": { timeMs: 258 * minute + 20 * 1000, visits: 143 },
    "reddit.com": { timeMs: 44 * minute + 10 * 1000, visits: 29 },
    "instagram.com": { timeMs: 28 * minute + 30 * 1000, visits: 24 },
  };

  const initialStorageData = {
    blockedDomains: {
      "instagram.com": { enabled: true, limitSeconds: 15 * 60, tier: "gentle" },
      "reddit.com": { enabled: true, limitSeconds: 30 * 60, tier: "standard" },
      "youtube.com": { enabled: true, limitSeconds: 60 * 60, tier: "strict" },
    },
    statsToday: clone(domainStats),
    allStatsToday: clone(domainStats),
    statsHistory: {
      [dayKey(1)]: {
        "youtube.com": { timeMs: 96 * minute, visits: 88 },
        "reddit.com": { timeMs: 52 * minute, visits: 36 },
        "instagram.com": { timeMs: 34 * minute, visits: 31 },
      },
      [dayKey(2)]: {
        "youtube.com": { timeMs: 104 * minute, visits: 93 },
        "reddit.com": { timeMs: 43 * minute, visits: 28 },
        "instagram.com": { timeMs: 25 * minute, visits: 24 },
      },
      [dayKey(3)]: {
        "youtube.com": { timeMs: 77 * minute, visits: 61 },
        "reddit.com": { timeMs: 38 * minute, visits: 22 },
        "instagram.com": { timeMs: 39 * minute, visits: 34 },
      },
    },
    hourlyUsageHistory: {
      [today]: {
        "08": {
          timeMs: 14 * minute,
          visits: 8,
          domains: { "instagram.com": 9 * minute, "reddit.com": 5 * minute },
        },
        "09": {
          timeMs: 18 * minute,
          visits: 11,
          domains: { "reddit.com": 11 * minute, "instagram.com": 7 * minute },
        },
        "10": {
          timeMs: 36 * minute,
          visits: 18,
          domains: { "reddit.com": 18 * minute, "youtube.com": 18 * minute },
        },
        "11": {
          timeMs: 17 * minute,
          visits: 9,
          domains: { "instagram.com": 10 * minute, "reddit.com": 7 * minute },
        },
        "13": {
          timeMs: 31 * minute,
          visits: 19,
          domains: { "youtube.com": 24 * minute, "instagram.com": 7 * minute },
        },
        "14": {
          timeMs: 45 * minute,
          visits: 26,
          domains: { "youtube.com": 32 * minute, "reddit.com": 13 * minute },
        },
        "15": {
          timeMs: 87 * minute,
          visits: 43,
          domains: { "youtube.com": 68 * minute, "reddit.com": 19 * minute },
        },
        "16": {
          timeMs: 63 * minute,
          visits: 29,
          domains: { "youtube.com": 46 * minute, "instagram.com": 17 * minute },
        },
        "18": {
          timeMs: 32 * minute,
          visits: 17,
          domains: { "reddit.com": 18 * minute, "instagram.com": 14 * minute },
        },
        "19": {
          timeMs: 58 * minute,
          visits: 33,
          domains: { "youtube.com": 40 * minute, "instagram.com": 18 * minute },
        },
        "20": {
          timeMs: 41 * minute,
          visits: 25,
          domains: { "youtube.com": 30 * minute, "reddit.com": 11 * minute },
        },
      },
      [dayKey(1)]: {
        "08": {
          timeMs: 7 * minute,
          visits: 4,
          domains: { "instagram.com": 4 * minute, "reddit.com": 3 * minute },
        },
        "09": {
          timeMs: 11 * minute,
          visits: 5,
          domains: { "reddit.com": 7 * minute, "instagram.com": 4 * minute },
        },
        "10": {
          timeMs: 16 * minute,
          visits: 7,
          domains: { "reddit.com": 10 * minute, "instagram.com": 6 * minute },
        },
        "12": {
          timeMs: 8 * minute,
          visits: 4,
          domains: { "youtube.com": 8 * minute },
        },
        "14": {
          timeMs: 24 * minute,
          visits: 11,
          domains: { "youtube.com": 18 * minute, "reddit.com": 6 * minute },
        },
        "15": {
          timeMs: 38 * minute,
          visits: 18,
          domains: { "youtube.com": 28 * minute, "reddit.com": 10 * minute },
        },
        "16": {
          timeMs: 20 * minute,
          visits: 9,
          domains: { "youtube.com": 12 * minute, "instagram.com": 8 * minute },
        },
        "18": {
          timeMs: 13 * minute,
          visits: 6,
          domains: { "reddit.com": 8 * minute, "instagram.com": 5 * minute },
        },
        "19": {
          timeMs: 25 * minute,
          visits: 12,
          domains: { "youtube.com": 17 * minute, "instagram.com": 8 * minute },
        },
        "21": {
          timeMs: 22 * minute,
          visits: 9,
          domains: { "youtube.com": 16 * minute, "instagram.com": 6 * minute },
        },
      },
    },
    personalInsights: [
      {
        id: "demo-substitution",
        type: "substitution_pattern",
        domain: "youtube.com",
        displayDomainLabel: "YouTube",
        title: "After Instagram was blocked, YouTube became the next stop",
        message: "Opened 3 times within five minutes",
        context: {
          blockedDomain: "instagram.com",
          substituteDomain: "youtube.com",
          count: 3,
          windowMinutes: 5,
          hour: 21,
          daypart: "evening",
        },
        createdAt: now - 50 * minute,
      },
    ],
    dismissedInsights: {},
    snoozeHistory: {
      [today]: { "youtube.com": { count: 4 }, "reddit.com": { count: 3 }, "instagram.com": { count: 2 } },
      [dayKey(1)]: { "youtube.com": { count: 5 }, "reddit.com": { count: 2 } },
    },
    snoozedDomains: {},
    recentlyReset: {},
    activeBlocks: [
      {
        id: "schedule-reddit-morning",
        domain: "reddit.com",
        source: "scheduled",
        tier: "strict",
        startTime: "09:00",
        endTime: "12:00",
        endsAt: now + 42 * minute,
      },
    ],
    scheduledBlocks: [
      {
        id: "schedule-reddit-morning",
        domain: "reddit.com",
        tier: "strict",
        startTime: "09:00",
        endTime: "12:00",
        days: [1, 2, 3, 4, 5],
        enabled: true,
      },
    ],
    uiSettings: {
      defaultLimitMinutes: 30,
      use24HourTime: false,
      limitNotificationsEnabled: true,
      personalInsightsEnabled: true,
      insightNotificationsEnabled: false,
      journeyCollapsed: false,
    },
    premiumState: { active: true, planName: "Demo" },
    reviewPromptState: {
      dismissedAt: now,
      dashboardOpenCount: 0,
      lastPromptAt: now,
    },
    onboardingState: {
      completed: true,
      completedAt: now - 7 * 24 * 60 * minute,
      version: 2,
    },
    saturnBlockReclaimStats: {
      [today]: {
        count: 9,
        estimatedMs: 45 * minute,
        bySource: { limit: 6, scheduled: 3 },
        byTier: { gentle: 2, standard: 4, strict: 3 },
      },
      [dayKey(1)]: {
        count: 14,
        estimatedMs: 70 * minute,
        bySource: { limit: 9, scheduled: 5 },
        byTier: { standard: 7, strict: 7 },
      },
      [dayKey(2)]: {
        count: 11,
        estimatedMs: 55 * minute,
        bySource: { limit: 7, scheduled: 4 },
        byTier: { gentle: 2, standard: 5, strict: 4 },
      },
      [dayKey(3)]: {
        count: 16,
        estimatedMs: 80 * minute,
        bySource: { limit: 11, scheduled: 5 },
        byTier: { standard: 9, strict: 7 },
      },
      [dayKey(4)]: {
        count: 10,
        estimatedMs: 50 * minute,
        bySource: { limit: 4, scheduled: 6 },
        byTier: { standard: 3, strict: 7 },
      },
    },
    saturnJourneyDisplayState: {
      totalReclaimedMs: 300 * minute,
      updatedAt: now,
    },
    activationFunnelState: {},
    immutableAdminOverrideEnabled: false,
  };

  const storageData = clone(initialStorageData);
  const changeListeners = new Set();

  function resetDemoStorage() {
    Object.keys(storageData).forEach((key) => {
      delete storageData[key];
    });
    Object.assign(storageData, clone(initialStorageData));
  }

  function resolveGet(keys) {
    if (keys == null) return clone(storageData);
    if (typeof keys === "string") return { [keys]: clone(storageData[keys]) };
    if (Array.isArray(keys)) {
      return keys.reduce((result, key) => {
        result[key] = clone(storageData[key]);
        return result;
      }, {});
    }
    return Object.entries(keys).reduce((result, [key, fallback]) => {
      result[key] = clone(storageData[key] ?? fallback);
      return result;
    }, {});
  }

  function notify(changes) {
    changeListeners.forEach((listener) => listener(clone(changes), "local"));
  }

  window.chrome = {
    runtime: {
      id: "saturn-demo",
      getManifest: () => ({ version: "demo" }),
      sendMessage: async (message = {}) => {
        if (message.action === "getImmutableOverrideState") {
          return { success: true, available: false };
        }
        return { success: true, demo: true };
      },
    },
    storage: {
      local: {
        get: async (keys) => resolveGet(keys),
        set: async (items = {}) => {
          const changes = {};
          Object.entries(items).forEach(([key, value]) => {
            changes[key] = { oldValue: clone(storageData[key]), newValue: clone(value) };
            storageData[key] = clone(value);
          });
          notify(changes);
        },
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const changes = {};
          list.forEach((key) => {
            changes[key] = { oldValue: clone(storageData[key]), newValue: undefined };
            delete storageData[key];
          });
          notify(changes);
        },
        clear: async () => {
          const changes = {};
          Object.keys(storageData).forEach((key) => {
            changes[key] = { oldValue: clone(storageData[key]), newValue: undefined };
            delete storageData[key];
          });
          notify(changes);
        },
      },
      onChanged: {
        addListener: (listener) => changeListeners.add(listener),
        removeListener: (listener) => changeListeners.delete(listener),
      },
    },
    tabs: {
      create: async ({ url } = {}) => ({ id: 1, url }),
    },
    alarms: {
      clear: async () => true,
    },
  };

  window.__saturnDemoReset = resetDemoStorage;
})();
