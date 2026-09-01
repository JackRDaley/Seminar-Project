const path = require("path");

// Provide a minimal importScripts implementation so background.js can load helper scripts in Node tests
global.importScripts = (scriptPath) => {
  try {
    // resolve relative to project root
    const full = path.join(process.cwd(), scriptPath);
    require(full);
  } catch (e) {
    // ignore if file doesn't load in test env
  }
};

// Require the background script so it registers test helpers on global
require("../background.js");
const runtimeMessageListener =
  global.chrome.runtime.onMessage.addListener.mock.calls[0][0];
const runtimeExternalMessageListener =
  global.chrome.runtime.onMessageExternal.addListener.mock.calls[0][0];
const {
  createResetToken,
  verifyResetToken,
  resetDomainUsage,
  clearDomainSnooze,
  enforceIfNeeded,
  flushActiveTimeNow,
  flushTime,
  setActiveDomain,
  syncActionBadge,
  redirectUrlForDomain,
  isScheduleActive,
  nextScheduleTime,
  buildDnrBlockEntries,
  buildDnrRedirectRule,
  syncDnrRules,
  scheduleActiveLimitWakeups,
  handleActiveLimitWakeup,
  handleActivePageHeartbeat,
  handleWindowFocusChanged,
  ensureDayReset,
  updateDomainActivity,
  reconcileSchedules,
  parseTime,
  refreshStoredPremiumStatus,
  snoozeDomain,
  analyzeUsagePatterns,
  generateInsights,
  shouldSendNotification,
  sendPatternNotification,
  ACTIVE_LIMIT_BADGE_ALARM,
} = global;

function sendBackgroundMessage(request, sender = {}) {
  return new Promise((resolve) => {
    runtimeMessageListener(request, sender, resolve);
  });
}

function sendExternalBackgroundMessage(
  request,
  sender = { url: "https://api.saturnfocus.com/whop/complete" },
) {
  return new Promise((resolve) => {
    runtimeExternalMessageListener(request, sender, resolve);
  });
}

function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

describe("Background helper functions (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createResetToken and verifyResetToken behave as one-time tokens", async () => {
    const token = await createResetToken("example.com");
    expect(typeof token).toBe("string");

    const ok = await verifyResetToken(token, "example.com");
    expect(ok).toBe(true);

    const again = await verifyResetToken(token, "example.com");
    expect(again).toBe(false);
  });

  test("resetDomainUsage clears stats and sets recentlyReset timestamp", async () => {
    // Prepare a simple in-memory storage mock
    const storage = {
      data: {
        statsToday: {
          "example.com": { timeMs: 60000, visits: 1 },
          "www.example.com": { timeMs: 120000, visits: 2 },
        },
        allStatsToday: {
          "example.com": { timeMs: 60000, visits: 1 },
          "www.example.com": { timeMs: 120000, visits: 2 },
        },
        alertsSent: {
          "example.com": { 75: true },
          "www.example.com": { 90: true },
        },
        recentlyReset: {},
      },
      async get(keys) {
        const out = {};
        for (const k of keys) {
          out[k] = this.data[k];
        }
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    // Patch global chrome.storage.local used by background.js
    const origStorage = global.chrome.storage.local;
    const origAlarmsClear = global.chrome.alarms.clear;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    global.chrome.storage.local = storage;
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});

    // Call resetDomainUsage (exposed on global)
    const res = await resetDomainUsage("example.com");
    expect(res).toBe(true);

    // After reset, stats should no longer have example.com
    expect(storage.data.statsToday["example.com"]).toBeUndefined();
    expect(storage.data.statsToday["www.example.com"]).toBeUndefined();
    expect(storage.data.allStatsToday["example.com"]).toBeUndefined();
    expect(storage.data.allStatsToday["www.example.com"]).toBeUndefined();
    expect(storage.data.alertsSent["example.com"]).toBeUndefined();
    expect(storage.data.alertsSent["www.example.com"]).toBeUndefined();

    // recentlyReset should be set to a timestamp (>0)
    expect(typeof storage.data.recentlyReset).toBe("object");
    expect(typeof storage.data.recentlyReset["example.com"]).toBe("number");
    expect(storage.data.recentlyReset["example.com"]).toBeGreaterThan(0);

    // restore original storage mock
    global.chrome.storage.local = origStorage;
    global.chrome.alarms.clear = origAlarmsClear;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
  });

  test("clearDomainSnooze removes snooze and immediately redirects over-limit tabs", async () => {
    const storage = {
      data: {
        snoozedDomains: {
          "www.example.com": { expiresAt: Date.now() + 300000, minutes: 5 },
        },
        activeBlocks: [],
        blockedDomains: {
          "example.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        statsToday: { "example.com": { timeMs: 60000, visits: 1 } },
        recentlyReset: {},
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;
    const origClear = global.chrome.alarms.clear;

    global.chrome.storage.local = storage;
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 7, url: "https://example.com/watch" },
    ]);
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.alarms.clear = jest.fn(async () => true);

    const enforced = await clearDomainSnooze("example.com");

    expect(enforced).toBe(true);
    expect(storage.data.snoozedDomains["www.example.com"]).toBeUndefined();
    expect(global.chrome.tabs.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        url: expect.stringContaining("blocked.html?"),
      }),
    );
    expect(global.chrome.tabs.update.mock.calls[0][1].url).toContain(
      "source=limit",
    );

    global.chrome.storage.local = origStorage;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
    global.chrome.alarms.clear = origClear;
  });

  test("enforceIfNeeded honors www-prefixed snooze entries", async () => {
    const storage = {
      data: {
        snoozedDomains: {
          "www.example.com": { expiresAt: Date.now() + 300000, minutes: 5 },
        },
        activeBlocks: [],
        blockedDomains: {
          "example.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        statsToday: { "example.com": { timeMs: 60000, visits: 1 } },
        recentlyReset: {},
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origUpdate = global.chrome.tabs.update;

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 7,
      url: "https://example.com/watch",
    }));
    global.chrome.tabs.update = jest.fn(async () => ({}));

    const enforced = await enforceIfNeeded(7);

    expect(enforced).toBe(false);
    expect(global.chrome.tabs.update).not.toHaveBeenCalled();

    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.update = origUpdate;
  });

  test("syncActionBadge shows pause indicator for snoozed active domains", async () => {
    const storage = {
      data: {
        snoozedDomains: {
          "www.example.com": { expiresAt: Date.now() + 300000, minutes: 5 },
        },
        activeBlocks: [],
        blockedDomains: {
          "example.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        statsToday: { "example.com": { timeMs: 60000, visits: 1 } },
        recentlyReset: {},
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origUpdate = global.chrome.tabs.update;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 7,
      url: "https://example.com/watch",
    }));
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});

    await setActiveDomain(7, false);
    await syncActionBadge();

    expect(global.chrome.action.setBadgeText).toHaveBeenLastCalledWith({
      text: "II",
    });
    expect(global.chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#6b7280",
    });
    expect(global.chrome.tabs.update).not.toHaveBeenCalled();

    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.update = origUpdate;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
  });

  test("syncActionBadge rehydrates the active tab after service worker sleep", async () => {
    const storage = {
      data: {
        snoozedDomains: {},
        blockedDomains: {
          "example.com": { enabled: true, limitSeconds: 120, tier: "standard" },
        },
        statsToday: { "example.com": { timeMs: 60000, visits: 1 } },
        recentlyReset: {},
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origQuery = global.chrome.tabs.query;
    const origGet = global.chrome.tabs.get;
    const origUpdate = global.chrome.tabs.update;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;

    global.chrome.storage.local = storage;
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 11, url: "https://example.com/dashboard" },
    ]);
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 11,
      url: "https://example.com/dashboard",
    }));
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});

    await setActiveDomain(null, false);
    global.chrome.action.setBadgeText.mockClear();
    global.chrome.action.setBadgeBackgroundColor.mockClear();

    await syncActionBadge();

    expect(global.chrome.tabs.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true,
    });
    expect(global.chrome.action.setBadgeText).toHaveBeenLastCalledWith({
      text: "50%",
    });
    expect(global.chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#2563eb",
    });
    expect(global.chrome.tabs.update).not.toHaveBeenCalled();

    global.chrome.storage.local = origStorage;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.update = origUpdate;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
  });

  test("flushTime restores a persisted active session without counting a gap", async () => {
    const startedAt = Date.now() - 60000;
    const storage = {
      data: {
        activeSession: { tabId: 13, domain: "example.com", startedAt },
        statsToday: {},
        allStatsToday: {},
        hourlyUsageHistory: {},
        blockedDomains: {},
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    global.chrome.storage.local = storage;

    await setActiveDomain(null, false);
    storage.data.activeSession = {
      tabId: 13,
      domain: "example.com",
      startedAt,
    };

    await flushTime();

    expect(storage.data.statsToday["example.com"]).toBeUndefined();
    expect(storage.data.allStatsToday["example.com"]).toBeUndefined();
    expect(storage.data.activeSession.domain).toBe("example.com");
    expect(storage.data.activeSession.lastHeartbeatAt).toBe(startedAt);

    global.chrome.storage.local = origStorage;
  });

  test("flushActiveTimeNow refreshes the current tab without adding elapsed time", async () => {
    await setActiveDomain(null, false);

    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: {},
        allStatsToday: {},
        hourlyUsageHistory: {},
        blockedDomains: {
          "example.com": { enabled: true, limitSeconds: 60, tier: "standard" },
          "news.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origQuery = global.chrome.tabs.query;
    const origGet = global.chrome.tabs.get;
    const origUpdate = global.chrome.tabs.update;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 14, url: "https://news.com/home" },
    ]);
    global.chrome.tabs.get = jest.fn(async (tabId) => ({
      id: tabId,
      url: tabId === 13 ? "https://example.com/start" : "https://news.com/home",
    }));
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});

    dateNowSpy.mockReturnValue(startedAt);
    await setActiveDomain(13, false);

    dateNowSpy.mockReturnValue(startedAt + 30000);
    await flushActiveTimeNow();

    expect(storage.data.statsToday["example.com"]).toBeUndefined();
    expect(storage.data.activeSession.domain).toBe("news.com");
    expect(storage.data.activeSession.lastHeartbeatAt).toBe(0);
    expect(global.chrome.action.setBadgeText).toHaveBeenLastCalledWith({
      text: "0%",
    });

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.update = origUpdate;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
  });

  test("completeWhopCheckout verifies pending token before stale stored token", async () => {
    const storage = {
      data: {
        whopAccessToken: "old-token",
        whopPendingToken: null,
        premiumState: { active: false, planName: "Free" },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origFetch = global.fetch;

    global.chrome.storage.local = storage;
    global.fetch = jest.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      return {
        json: jest.fn(async () => ({
          active: body.token === "new-token",
          planName: body.token === "new-token" ? "Pro" : "Free",
        })),
      };
    });

    const response = await sendBackgroundMessage({
      action: "completeWhopCheckout",
      token: "new-token",
    });

    expect(response.success).toBe(true);
    expect(response.premium).toEqual(
      expect.objectContaining({
        active: true,
        planName: "Pro",
        source: "checkout",
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/whop/verify"),
      expect.objectContaining({
        body: JSON.stringify({ token: "new-token" }),
      }),
    );
    expect(storage.data.whopAccessToken).toBe("new-token");
    expect(storage.data.whopPendingToken).toBeNull();

    global.chrome.storage.local = origStorage;
    global.fetch = origFetch;
  });

  test("external Whop checkout attempts to open toolbar popup after activation", async () => {
    const storage = {
      data: {
        whopAccessToken: null,
        whopPendingToken: null,
        premiumState: { active: false, planName: "Free" },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origFetch = global.fetch;
    const origOpenPopup = global.chrome.action.openPopup;

    global.chrome.storage.local = storage;
    global.chrome.action.openPopup = jest.fn(async () => {});
    global.fetch = jest.fn(async () => ({
      json: jest.fn(async () => ({ active: true, planName: "Pro" })),
    }));

    const response = await sendExternalBackgroundMessage({
      action: "whopCheckoutComplete",
      token: "new-token",
    });

    expect(response.success).toBe(true);
    expect(response.openedPopup).toBe(true);
    expect(response.openedExtension).toBe(true);
    expect(global.chrome.action.openPopup).toHaveBeenCalledTimes(1);
    expect(storage.data.whopActivationNotice).toEqual(
      expect.objectContaining({
        createdAt: expect.any(Number),
      }),
    );

    global.chrome.storage.local = origStorage;
    global.fetch = origFetch;
    global.chrome.action.openPopup = origOpenPopup;
  });

  test("redirectUrlForDomain preserves safe same-domain request originals", () => {
    expect(
      redirectUrlForDomain("example.com", {
        original: "https://www.example.com/watch?v=1#focus",
      }),
    ).toBe("https://www.example.com/watch?v=1#focus");
  });

  test("redirectUrlForDomain reads safe originals from blocked page URLs", () => {
    const original = "https://example.com/deep/path?x=1#section";
    const sender = {
      tab: {
        url: global.chrome.runtime.getURL(
          `blocked.html?d=example.com&u=${encodeURIComponent(original)}`,
        ),
      },
    };

    expect(redirectUrlForDomain("example.com", {}, sender)).toBe(original);
  });

  test("redirectUrlForDomain rejects cross-domain originals", () => {
    expect(
      redirectUrlForDomain("example.com", {
        original: "https://evil.example.net/phish",
      }),
    ).toBe("https://example.com/");
  });

  test("redirectUrlForDomain rejects non-web and malformed originals", () => {
    const unsafeOriginals = [
      "javascript:alert(1)",
      "data:text/html,<h1>oops</h1>",
      "file:///C:/Users/Jack/secret.txt",
      "/local/path",
      "not a url",
    ];

    for (const original of unsafeOriginals) {
      expect(redirectUrlForDomain("example.com", { original })).toBe(
        "https://example.com/",
      );
    }
  });

  test("redirectUrlForDomain prefers safe request original over sender blocked URL", () => {
    const senderOriginal = "https://example.com/from-sender";
    const requestOriginal = "https://example.com/from-request?x=1";
    const sender = {
      tab: {
        url: global.chrome.runtime.getURL(
          `blocked.html?d=example.com&u=${encodeURIComponent(senderOriginal)}`,
        ),
      },
    };

    expect(
      redirectUrlForDomain(
        "example.com",
        { original: requestOriginal },
        sender,
      ),
    ).toBe(requestOriginal);
  });

  test("immutable override is unavailable without an active immutable block page", async () => {
    const storage = {
      data: {},
      async get(keys) {
        const out = {};
        for (const key of keys) out[key] = this.data[key];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origQuery = global.chrome.tabs.query;

    global.chrome.storage.local = storage;
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 9, url: "https://focus.com/" },
    ]);

    const response = await sendBackgroundMessage({
      action: "useImmutableAdminOverride",
    });

    expect(response.success).toBe(false);
    expect(storage.data.immutableAdminOverrideEnabled).toBe(false);

    global.chrome.storage.local = origStorage;
    global.chrome.tabs.query = origQuery;
  });

  test("immutable override resets an active immutable limit and redirects the blocked tab", async () => {
    const original = "https://focus.com/watch";
    const blocked = global.chrome.runtime.getURL(
      `blocked.html?d=focus.com&source=limit&tier=immutable&u=${encodeURIComponent(original)}`,
    );
    const storage = {
      data: {
        activeBlocks: [],
        blockedDomains: {
          "focus.com": { enabled: true, limitSeconds: 60, tier: "immutable" },
        },
        statsToday: { "focus.com": { timeMs: 60000, visits: 1 } },
        allStatsToday: { "focus.com": { timeMs: 60000, visits: 1 } },
        snoozedDomains: {},
        recentlyReset: {},
      },
      async get(keys) {
        const out = {};
        for (const key of keys) out[key] = this.data[key];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;

    global.chrome.storage.local = storage;
    global.chrome.tabs.query = jest.fn(async () => [{ id: 10, url: blocked }]);
    global.chrome.tabs.update = jest.fn(async () => ({}));

    const state = await sendBackgroundMessage({
      action: "getImmutableOverrideState",
    });
    const response = await sendBackgroundMessage({
      action: "useImmutableAdminOverride",
    });

    expect(state).toEqual(
      expect.objectContaining({
        success: true,
        available: true,
        domain: "focus.com",
        source: "limit",
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        domain: "focus.com",
        source: "limit",
        redirectUrl: original,
      }),
    );
    expect(storage.data.statsToday["focus.com"]).toBeUndefined();
    expect(typeof storage.data.recentlyReset["focus.com"]).toBe("number");
    expect(storage.data.immutableAdminOverrideLastUsedDay).toBe(localDayKey());
    expect(global.chrome.tabs.update).toHaveBeenCalledWith(10, {
      url: original,
    });

    global.chrome.storage.local = origStorage;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
  });

  test("immutable override cannot be used twice in the same day", async () => {
    const original = "https://focus.com/watch";
    const blocked = global.chrome.runtime.getURL(
      `blocked.html?d=focus.com&source=limit&tier=immutable&u=${encodeURIComponent(original)}`,
    );
    const storage = {
      data: {
        activeBlocks: [],
        blockedDomains: {
          "focus.com": { enabled: true, limitSeconds: 60, tier: "immutable" },
        },
        statsToday: { "focus.com": { timeMs: 60000, visits: 1 } },
        allStatsToday: { "focus.com": { timeMs: 60000, visits: 1 } },
        snoozedDomains: {},
        recentlyReset: {},
        immutableAdminOverrideLastUsedDay: localDayKey(),
      },
      async get(keys) {
        const out = {};
        for (const key of keys) out[key] = this.data[key];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;

    global.chrome.storage.local = storage;
    global.chrome.tabs.query = jest.fn(async () => [{ id: 12, url: blocked }]);
    global.chrome.tabs.update = jest.fn(async () => ({}));

    const state = await sendBackgroundMessage({
      action: "getImmutableOverrideState",
    });
    const response = await sendBackgroundMessage({
      action: "useImmutableAdminOverride",
    });

    expect(state).toEqual(
      expect.objectContaining({
        success: true,
        available: false,
        usedToday: true,
        domain: "focus.com",
        source: "limit",
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        usedToday: true,
        error: "Emergency override already used today.",
      }),
    );
    expect(storage.data.statsToday["focus.com"]).toEqual({
      timeMs: 60000,
      visits: 1,
    });
    expect(global.chrome.tabs.update).not.toHaveBeenCalled();

    global.chrome.storage.local = origStorage;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
  });

  test("immutable override ends an active immutable scheduled block", async () => {
    const blocked = global.chrome.runtime.getURL(
      "blocked.html?d=focus.com&source=scheduled&tier=immutable",
    );
    const storage = {
      data: {
        activeBlocks: [
          {
            id: "deep-work",
            domain: "focus.com",
            startTime: "09:00",
            endTime: "17:00",
            tier: "immutable",
          },
        ],
        scheduledBlocks: [],
        blockedDomains: {},
        statsToday: {},
        snoozedDomains: {},
        recentlyReset: {},
      },
      async get(keys) {
        const out = {};
        for (const key of keys) out[key] = this.data[key];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;

    global.chrome.storage.local = storage;
    global.chrome.tabs.query = jest.fn(async () => [{ id: 11, url: blocked }]);
    global.chrome.tabs.update = jest.fn(async () => ({}));

    const response = await sendBackgroundMessage({
      action: "useImmutableAdminOverride",
    });

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        domain: "focus.com",
        source: "scheduled",
        redirectUrl: "https://focus.com/",
      }),
    );
    expect(storage.data.activeBlocks).toEqual([]);
    expect(storage.data.immutableAdminOverrideLastUsedDay).toBe(localDayKey());
    expect(global.chrome.tabs.update).toHaveBeenCalledWith(11, {
      url: "https://focus.com/",
    });

    global.chrome.storage.local = origStorage;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
  });

  test("ending a scheduled block credits the active session duration as reclaimed time", async () => {
    const base = new Date("2026-06-17T14:00:00Z").getTime();
    jest.spyOn(Date, "now").mockReturnValue(base + 60 * 60 * 1000);

    const storage = {
      data: {
        activeBlocks: [
          {
            id: "deep-work",
            domain: "focus.com",
            startedAt: base,
            tier: "standard",
            breakMs: 5 * 60 * 1000,
          },
        ],
        blockedDomains: {},
        statsToday: {},
        snoozedDomains: {},
        recentlyReset: {},
        saturnBlockReclaimStats: {},
      },
      async get(keys) {
        const out = {};
        for (const key of keys) out[key] = this.data[key];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    global.chrome.storage.local = storage;

    const response = await sendBackgroundMessage({
      action: "endScheduledBlock",
      domain: "focus.com",
    });
    const dayStats = Object.values(storage.data.saturnBlockReclaimStats)[0];

    expect(response.success).toBe(true);
    expect(storage.data.activeBlocks).toEqual([]);
    expect(dayStats).toEqual(
      expect.objectContaining({
        count: 1,
        estimatedMs: 55 * 60 * 1000,
        bySource: { scheduled: 1 },
        byTier: { standard: 1 },
      }),
    );

    global.chrome.storage.local = origStorage;
    Date.now.mockRestore();
  });

  test("scheduled block snoozes subtract the actual break taken from reclaimed time", async () => {
    const base = new Date("2026-06-17T14:00:00Z").getTime();
    const storage = {
      data: {
        activeBlocks: [
          {
            id: "deep-work",
            domain: "focus.com",
            startedAt: base,
            tier: "standard",
            breakMs: 0,
          },
        ],
        blockedDomains: {},
        statsToday: {},
        snoozedDomains: {},
        snoozeHistory: {},
        recentlyReset: {},
        saturnBlockReclaimStats: {},
      },
      async get(keys) {
        const out = {};
        for (const key of keys) out[key] = this.data[key];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    global.chrome.storage.local = storage;
    const nowSpy = jest.spyOn(Date, "now");

    nowSpy.mockReturnValue(base + 10 * 60 * 1000);
    await sendBackgroundMessage({
      action: "snoozeBlock",
      domain: "focus.com",
      minutes: 5,
    });
    expect(storage.data.activeBlocks[0]).toEqual(
      expect.objectContaining({
        breakStartedAt: base + 10 * 60 * 1000,
        breakUntil: base + 15 * 60 * 1000,
      }),
    );

    nowSpy.mockReturnValue(base + 12 * 60 * 1000);
    await clearDomainSnooze("focus.com");
    expect(storage.data.activeBlocks[0]).toEqual(
      expect.objectContaining({
        breakMs: 2 * 60 * 1000,
      }),
    );
    expect(storage.data.activeBlocks[0].breakStartedAt).toBeUndefined();

    nowSpy.mockReturnValue(base + 60 * 60 * 1000);
    await sendBackgroundMessage({
      action: "endScheduledBlock",
      domain: "focus.com",
    });
    const dayStats = Object.values(storage.data.saturnBlockReclaimStats)[0];
    expect(dayStats.estimatedMs).toBe(58 * 60 * 1000);

    global.chrome.storage.local = origStorage;
    nowSpy.mockRestore();
  });

  test("buildDnrBlockEntries mirrors current blocking state", () => {
    const now = Date.now();
    const entries = buildDnrBlockEntries(
      {
        blockedDomains: {
          "example.com": { enabled: true, limitSeconds: 60, tier: "strict" },
          "paused.com": { enabled: true, limitSeconds: 60, tier: "standard" },
          "reset.com": { enabled: true, limitSeconds: 60, tier: "standard" },
          "under.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        statsToday: {
          "example.com": { timeMs: 60000, visits: 1 },
          "paused.com": { timeMs: 60000, visits: 1 },
          "reset.com": { timeMs: 60000, visits: 1 },
          "under.com": { timeMs: 30000, visits: 1 },
        },
        snoozedDomains: {
          "paused.com": { expiresAt: now + 60000, minutes: 1 },
        },
        recentlyReset: {
          "reset.com": now,
        },
        activeBlocks: [
          {
            id: "focus",
            domain: "focus.com",
            startTime: "09:00",
            endTime: "17:00",
            tier: "immutable",
          },
        ],
      },
      now,
    );

    expect(entries).toEqual([
      { domain: "example.com", source: "limit", tier: "strict" },
      { domain: "focus.com", source: "scheduled", tier: "immutable" },
    ]);
  });

  test("buildDnrRedirectRule redirects top-level GET navigation to the block page", () => {
    const rule = buildDnrRedirectRule(
      {
        domain: "example.com",
        source: "limit",
        tier: "strict",
      },
      1000000,
    );

    expect(rule).toEqual(
      expect.objectContaining({
        id: 1000000,
        priority: 10,
        action: expect.objectContaining({
          type: "redirect",
          redirect: expect.objectContaining({
            extensionPath:
              "/blocked.html?d=example.com&source=limit&tier=strict&dnr=1",
          }),
        }),
        condition: expect.objectContaining({
          regexFilter: "^https?://(www\\.)?example\\.com([/:?#]|$)",
          resourceTypes: ["main_frame"],
          requestMethods: ["get"],
        }),
      }),
    );
  });

  test("syncDnrRules replaces only extension-managed dynamic rules", async () => {
    const storage = {
      data: {
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "strict" },
        },
        statsToday: { "alpha.com": { timeMs: 60000, visits: 1 } },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origDnr = global.chrome.declarativeNetRequest;

    global.chrome.storage.local = storage;
    global.chrome.declarativeNetRequest = {
      MAX_NUMBER_OF_REGEX_RULES: 1000,
      getDynamicRules: jest.fn(async () => [
        { id: 999 },
        { id: 1000000 },
        { id: 1000001 },
      ]),
      updateDynamicRules: jest.fn(async () => {}),
    };

    await syncDnrRules({ force: true });

    expect(
      global.chrome.declarativeNetRequest.updateDynamicRules,
    ).toHaveBeenCalledWith({
      removeRuleIds: [1000000, 1000001],
      addRules: [
        expect.objectContaining({
          id: 1000000,
          condition: expect.objectContaining({
            regexFilter: "^https?://(www\\.)?alpha\\.com([/:?#]|$)",
          }),
          action: expect.objectContaining({
            redirect: expect.objectContaining({
              extensionPath:
                "/blocked.html?d=alpha.com&source=limit&tier=strict&dnr=1",
            }),
          }),
        }),
      ],
    });

    global.chrome.storage.local = origStorage;
    global.chrome.declarativeNetRequest = origDnr;
  });

  test("scheduleActiveLimitWakeups creates threshold alarms from stored progress", async () => {
    const now = 1700000000000;
    const storage = {
      data: {
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        statsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origCreate = global.chrome.alarms.create;
    const origClear = global.chrome.alarms.clear;
    const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(now);

    global.chrome.storage.local = storage;
    global.chrome.alarms.create = jest.fn();
    global.chrome.alarms.clear = jest.fn(async () => true);

    await scheduleActiveLimitWakeups("alpha.com");

    expect(global.chrome.alarms.create).toHaveBeenCalledWith(
      "activeLimitThreshold:75:alpha.com",
      { when: now + 25000 },
    );
    expect(global.chrome.alarms.create).toHaveBeenCalledWith(
      "activeLimitThreshold:90:alpha.com",
      { when: now + 34000 },
    );
    expect(global.chrome.alarms.create).toHaveBeenCalledWith(
      "activeLimitThreshold:100:alpha.com",
      { when: now + 40000 },
    );

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.alarms.create = origCreate;
    global.chrome.alarms.clear = origClear;
  });

  test("active limit wakeup uses stored progress without adding live time", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;
    const origCreate = global.chrome.alarms.create;
    const origClear = global.chrome.alarms.clear;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origNotificationCreate = global.chrome.notifications.create;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 22,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 22, url: "https://alpha.com/watch" },
    ]);
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.alarms.create = jest.fn();
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.chrome.notifications.create = jest.fn();
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await setActiveDomain(22, false, { enforce: false, badge: false });
    global.chrome.notifications.create.mockClear();

    dateNowSpy.mockReturnValue(startedAt + 26000);
    await handleActiveLimitWakeup("activeLimitThreshold:75:alpha.com");

    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(20000);
    expect(global.chrome.notifications.create).not.toHaveBeenCalled();
    expect(global.chrome.action.setBadgeText).toHaveBeenLastCalledWith({
      text: "33%",
    });
    expect(global.chrome.alarms.create).not.toHaveBeenCalledWith(
      ACTIVE_LIMIT_BADGE_ALARM,
      expect.anything(),
    );

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
    global.chrome.alarms.create = origCreate;
    global.chrome.alarms.clear = origClear;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.chrome.notifications.create = origNotificationCreate;
    global.fetch = origFetch;
  });

  test("active limit wakeup flushes live time and sends a 75% notification", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 44000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 44000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;
    const origCreate = global.chrome.alarms.create;
    const origClear = global.chrome.alarms.clear;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origNotificationCreate = global.chrome.notifications.create;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 23,
      windowId: 1,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 23, windowId: 1, active: true, url: "https://alpha.com/watch" },
    ]);
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.alarms.create = jest.fn();
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.chrome.notifications.create = jest.fn(
      async () => "stmalert:alpha.com:75",
    );
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await setActiveDomain(23, false, { enforce: false, badge: false });
    await handleActivePageHeartbeat(
      {
        tab: { id: 23, windowId: 1, url: "https://alpha.com/watch" },
      },
      {
        reason: "visible",
        pageFocused: true,
        visibilityState: "visible",
      },
    );
    global.chrome.notifications.create.mockClear();

    dateNowSpy.mockReturnValue(startedAt + 1000);
    await handleActiveLimitWakeup("activeLimitThreshold:75:alpha.com");

    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(45000);
    expect(global.chrome.notifications.create).toHaveBeenCalledWith(
      "stmalert:alpha.com:75",
      expect.objectContaining({
        title: "75% of alpha.com limit used",
      }),
    );
    expect(storage.data.alertsSent["alpha.com"]["75"]).toBe(true);

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
    global.chrome.alarms.create = origCreate;
    global.chrome.alarms.clear = origClear;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.chrome.notifications.create = origNotificationCreate;
    global.fetch = origFetch;
  });

  test("active page heartbeat keeps the badge moving while popup is closed", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;
    const origCreate = global.chrome.alarms.create;
    const origClear = global.chrome.alarms.clear;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origNotificationCreate = global.chrome.notifications.create;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 31,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 31, url: "https://alpha.com/watch" },
    ]);
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.alarms.create = jest.fn();
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.chrome.notifications.create = jest.fn();
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await setActiveDomain(31, false, { enforce: false, badge: false });
    global.chrome.action.setBadgeText.mockClear();

    await handleActivePageHeartbeat(
      {
        tab: { id: 31, url: "https://alpha.com/watch" },
      },
      {
        reason: "visible",
        pageFocused: true,
        visibilityState: "visible",
      },
    );
    global.chrome.action.setBadgeText.mockClear();

    dateNowSpy.mockReturnValue(startedAt + 1000);
    const response = await handleActivePageHeartbeat(
      {
        tab: { id: 31, url: "https://alpha.com/watch" },
      },
      {
        reason: "interval",
        pageFocused: true,
        visibilityState: "visible",
      },
    );

    expect(response).toEqual(
      expect.objectContaining({ success: true, domain: "alpha.com" }),
    );
    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(21000);
    expect(global.chrome.action.setBadgeText).toHaveBeenLastCalledWith({
      text: "35%",
    });

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
    global.chrome.alarms.create = origCreate;
    global.chrome.alarms.clear = origClear;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.chrome.notifications.create = origNotificationCreate;
    global.fetch = origFetch;
  });

  test("heartbeat clamps usage to the limit when it triggers a block", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 59000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 59000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;
    const origCreate = global.chrome.alarms.create;
    const origClear = global.chrome.alarms.clear;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origNotificationCreate = global.chrome.notifications.create;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 91,
      windowId: 1,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 91, windowId: 1, active: true, url: "https://alpha.com/watch" },
    ]);
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.alarms.create = jest.fn();
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.chrome.notifications.create = jest.fn(
      async () => "stmalert:alpha.com:90",
    );
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await handleWindowFocusChanged(1);
    await setActiveDomain(91, false, { enforce: false, badge: false });
    await handleActivePageHeartbeat(
      {
        tab: { id: 91, windowId: 1, url: "https://alpha.com/watch" },
      },
      {
        reason: "visible",
        pageFocused: true,
        visibilityState: "visible",
      },
    );

    global.chrome.tabs.query = jest.fn(async () => [
      {
        id: 99,
        windowId: 1,
        active: true,
        url: global.chrome.runtime.getURL("popup.html"),
      },
    ]);

    dateNowSpy.mockReturnValue(startedAt + 2000);
    const response = await flushActiveTimeNow({ source: "popup" });

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        countedMs: 2000,
      }),
    );
    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(60000);
    expect(storage.data.allStatsToday["alpha.com"].timeMs).toBe(60000);
    expect(global.chrome.tabs.update).toHaveBeenCalledWith(
      91,
      expect.objectContaining({
        url: expect.stringContaining("blocked.html"),
      }),
    );

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
    global.chrome.alarms.create = origCreate;
    global.chrome.alarms.clear = origClear;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.chrome.notifications.create = origNotificationCreate;
    global.fetch = origFetch;
  });

  test("popup refresh keeps the active site ticking when the extension page has focus", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;
    const origCreate = global.chrome.alarms.create;
    const origClear = global.chrome.alarms.clear;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origNotificationCreate = global.chrome.notifications.create;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 31,
      windowId: 1,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 31, windowId: 1, url: "https://alpha.com/watch" },
    ]);
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.alarms.create = jest.fn();
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.chrome.notifications.create = jest.fn();
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await setActiveDomain(31, false, { enforce: false, badge: false });
    await handleActivePageHeartbeat(
      {
        tab: { id: 31, windowId: 1, url: "https://alpha.com/watch" },
      },
      {
        reason: "visible",
        pageFocused: true,
        visibilityState: "visible",
      },
    );
    global.chrome.action.setBadgeText.mockClear();

    global.chrome.tabs.query = jest.fn(async () => [
      {
        id: 99,
        windowId: 1,
        url: global.chrome.runtime.getURL("popup.html"),
      },
    ]);

    dateNowSpy.mockReturnValue(startedAt + 1000);
    const response = await flushActiveTimeNow({ source: "popup" });

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        activeDomain: "alpha.com",
        countedMs: 1000,
      }),
    );
    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(21000);
    expect(storage.data.activeSession).toEqual(
      expect.objectContaining({
        domain: "alpha.com",
        lastHeartbeatAt: startedAt + 1000,
      }),
    );
    expect(global.chrome.action.setBadgeText).toHaveBeenLastCalledWith({
      text: "35%",
    });

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
    global.chrome.alarms.create = origCreate;
    global.chrome.alarms.clear = origClear;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.chrome.notifications.create = origNotificationCreate;
    global.fetch = origFetch;
  });

  test("badge tick displays stored usage without adding elapsed time", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;
    const origGetAll = global.chrome.alarms.getAll;
    const origClear = global.chrome.alarms.clear;
    const origCreate = global.chrome.alarms.create;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 61,
      windowId: 3,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 61, windowId: 3, url: "https://alpha.com/watch" },
    ]);
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.alarms.getAll = jest.fn(async () => [
      { name: ACTIVE_LIMIT_BADGE_ALARM },
    ]);
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.alarms.create = jest.fn();
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await handleWindowFocusChanged(3);
    await setActiveDomain(61, false, { enforce: false, badge: false });
    global.chrome.action.setBadgeText.mockClear();
    global.chrome.alarms.create.mockClear();

    dateNowSpy.mockReturnValue(startedAt + 15000);
    await handleActiveLimitWakeup(ACTIVE_LIMIT_BADGE_ALARM);

    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(20000);
    expect(storage.data.activeSession).toEqual(
      expect.objectContaining({
        domain: "alpha.com",
        lastHeartbeatAt: 0,
      }),
    );
    expect(global.chrome.action.setBadgeText).toHaveBeenLastCalledWith({
      text: "33%",
    });
    expect(global.chrome.alarms.create).not.toHaveBeenCalledWith(
      ACTIVE_LIMIT_BADGE_ALARM,
      expect.anything(),
    );
    expect(global.chrome.alarms.clear).toHaveBeenCalledWith(
      ACTIVE_LIMIT_BADGE_ALARM,
    );

    dateNowSpy.mockReturnValue(startedAt + 16000);
    await handleWindowFocusChanged(3);

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
    global.chrome.alarms.getAll = origGetAll;
    global.chrome.alarms.clear = origClear;
    global.chrome.alarms.create = origCreate;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.fetch = origFetch;
  });

  test("window focus loss pauses tracking and ignores page heartbeat ticks", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origUpdate = global.chrome.tabs.update;
    const origGetAll = global.chrome.alarms.getAll;
    const origClear = global.chrome.alarms.clear;
    const origCreate = global.chrome.alarms.create;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 41,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 41, windowId: 1, url: "https://alpha.com/watch" },
    ]);
    global.chrome.tabs.update = jest.fn(async () => ({}));
    global.chrome.alarms.getAll = jest.fn(async () => [
      { name: "activeLimitThreshold:75:alpha.com" },
      { name: ACTIVE_LIMIT_BADGE_ALARM },
    ]);
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.alarms.create = jest.fn();
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await handleWindowFocusChanged(1);
    await setActiveDomain(41, false, { enforce: false, badge: false });

    dateNowSpy.mockReturnValue(startedAt + 5000);
    await handleWindowFocusChanged(global.chrome.windows.WINDOW_ID_NONE);
    const timeAtBlur = storage.data.statsToday["alpha.com"].timeMs;

    dateNowSpy.mockReturnValue(startedAt + 15000);
    const response = await handleActivePageHeartbeat({
      tab: { id: 41, windowId: 1, url: "https://alpha.com/watch" },
    });

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        ignored: true,
        reason: "browser-unfocused",
      }),
    );
    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(timeAtBlur);
    expect(storage.data.activeSession).toBeNull();
    expect(global.chrome.alarms.clear).toHaveBeenCalledWith(
      ACTIVE_LIMIT_BADGE_ALARM,
    );

    dateNowSpy.mockReturnValue(startedAt + 16000);
    await handleWindowFocusChanged(1);

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.tabs.update = origUpdate;
    global.chrome.alarms.getAll = origGetAll;
    global.chrome.alarms.clear = origClear;
    global.chrome.alarms.create = origCreate;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.fetch = origFetch;
  });

  test("focused page heartbeat resumes when the window focus event was missed", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origGetAll = global.chrome.alarms.getAll;
    const origClear = global.chrome.alarms.clear;
    const origCreate = global.chrome.alarms.create;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 51,
      windowId: 2,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 51, windowId: 2, url: "https://alpha.com/watch" },
    ]);
    global.chrome.alarms.getAll = jest.fn(async () => []);
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.alarms.create = jest.fn();
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await handleWindowFocusChanged(2);
    await setActiveDomain(51, false, { enforce: false, badge: false });

    await handleWindowFocusChanged(global.chrome.windows.WINDOW_ID_NONE);
    dateNowSpy.mockReturnValue(startedAt + 10000);
    const response = await handleActivePageHeartbeat(
      {
        tab: { id: 51, windowId: 2, url: "https://alpha.com/watch" },
      },
      {
        reason: "visible",
        pageFocused: true,
        visibilityState: "visible",
      },
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        domain: "alpha.com",
        countedMs: 0,
      }),
    );
    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(20000);
    expect(storage.data.activeSession.domain).toBe("alpha.com");
    expect(global.chrome.action.setBadgeText).not.toHaveBeenCalledWith({
      text: "50%",
    });

    dateNowSpy.mockReturnValue(startedAt + 11000);
    const resumed = await handleActivePageHeartbeat(
      {
        tab: { id: 51, windowId: 2, url: "https://alpha.com/watch" },
      },
      {
        reason: "interval",
        pageFocused: true,
        visibilityState: "visible",
      },
    );
    expect(resumed).toEqual(
      expect.objectContaining({
        success: true,
        domain: "alpha.com",
        countedMs: 1000,
      }),
    );
    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(21000);

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.alarms.getAll = origGetAll;
    global.chrome.alarms.clear = origClear;
    global.chrome.alarms.create = origCreate;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.fetch = origFetch;
  });

  test("first focused heartbeat after refocus resets the baseline without counting the gap", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origGetAll = global.chrome.alarms.getAll;
    const origClear = global.chrome.alarms.clear;
    const origCreate = global.chrome.alarms.create;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 71,
      windowId: 4,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 71, windowId: 4, url: "https://alpha.com/watch" },
    ]);
    global.chrome.alarms.getAll = jest.fn(async () => []);
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.alarms.create = jest.fn();
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await handleWindowFocusChanged(4);
    await setActiveDomain(71, false, { enforce: false, badge: false });
    await handleActivePageHeartbeat(
      {
        tab: { id: 71, windowId: 4, url: "https://alpha.com/watch" },
      },
      {
        reason: "visible",
        pageFocused: true,
        visibilityState: "visible",
      },
    );

    dateNowSpy.mockReturnValue(startedAt + 5000);
    await handleWindowFocusChanged(global.chrome.windows.WINDOW_ID_NONE);

    dateNowSpy.mockReturnValue(startedAt + 15000);
    const response = await handleActivePageHeartbeat(
      {
        tab: { id: 71, windowId: 4, url: "https://alpha.com/watch" },
      },
      {
        reason: "visible",
        pageFocused: true,
        visibilityState: "visible",
      },
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        domain: "alpha.com",
        countedMs: 0,
      }),
    );
    expect(storage.data.activeSession).toEqual(
      expect.objectContaining({
        domain: "alpha.com",
        lastHeartbeatAt: startedAt + 15000,
      }),
    );
    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(20000);

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.alarms.getAll = origGetAll;
    global.chrome.alarms.clear = origClear;
    global.chrome.alarms.create = origCreate;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.fetch = origFetch;
  });

  test("heartbeat delta is capped so delayed intervals cannot jump the badge", async () => {
    const startedAt = 1700000000000;
    const storage = {
      data: {
        statsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        allStatsToday: { "alpha.com": { timeMs: 20000, visits: 1 } },
        hourlyUsageHistory: {},
        blockedDomains: {
          "alpha.com": { enabled: true, limitSeconds: 60, tier: "standard" },
        },
        snoozedDomains: {},
        recentlyReset: {},
        activeBlocks: [],
        alertsSent: {},
        uiSettings: { limitNotificationsEnabled: true },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = this.data[k];
        return out;
      },
      async set(items) {
        Object.assign(this.data, items);
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origGet = global.chrome.tabs.get;
    const origQuery = global.chrome.tabs.query;
    const origGetAll = global.chrome.alarms.getAll;
    const origClear = global.chrome.alarms.clear;
    const origCreate = global.chrome.alarms.create;
    const origSetBadgeText = global.chrome.action.setBadgeText;
    const origSetBadgeBackgroundColor =
      global.chrome.action.setBadgeBackgroundColor;
    const origFetch = global.fetch;
    const dateNowSpy = jest.spyOn(Date, "now");

    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 81,
      windowId: 5,
      url: "https://alpha.com/watch",
    }));
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 81, windowId: 5, url: "https://alpha.com/watch" },
    ]);
    global.chrome.alarms.getAll = jest.fn(async () => []);
    global.chrome.alarms.clear = jest.fn(async () => true);
    global.chrome.alarms.create = jest.fn();
    global.chrome.action.setBadgeText = jest.fn(async () => {});
    global.chrome.action.setBadgeBackgroundColor = jest.fn(async () => {});
    global.fetch = jest.fn(async () => ({ ok: true }));

    dateNowSpy.mockReturnValue(startedAt);
    await handleWindowFocusChanged(5);
    await setActiveDomain(81, false, { enforce: false, badge: false });
    await handleActivePageHeartbeat(
      {
        tab: { id: 81, windowId: 5, url: "https://alpha.com/watch" },
      },
      {
        reason: "visible",
        pageFocused: true,
        visibilityState: "visible",
      },
    );

    dateNowSpy.mockReturnValue(startedAt + 15000);
    const response = await handleActivePageHeartbeat(
      {
        tab: { id: 81, windowId: 5, url: "https://alpha.com/watch" },
      },
      {
        reason: "interval",
        pageFocused: true,
        visibilityState: "visible",
      },
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        domain: "alpha.com",
        countedMs: 2000,
      }),
    );
    expect(storage.data.statsToday["alpha.com"].timeMs).toBe(22000);
    expect(storage.data.activeSession).toEqual(
      expect.objectContaining({
        domain: "alpha.com",
        lastHeartbeatAt: startedAt + 15000,
      }),
    );

    dateNowSpy.mockRestore();
    global.chrome.storage.local = origStorage;
    global.chrome.tabs.get = origGet;
    global.chrome.tabs.query = origQuery;
    global.chrome.alarms.getAll = origGetAll;
    global.chrome.alarms.clear = origClear;
    global.chrome.alarms.create = origCreate;
    global.chrome.action.setBadgeText = origSetBadgeText;
    global.chrome.action.setBadgeBackgroundColor = origSetBadgeBackgroundColor;
    global.fetch = origFetch;
  });

  test("analyzeUsagePatterns detects session, recurring, and increase patterns", () => {
    const now = new Date(2026, 4, 10, 10, 30).getTime();
    const dayForOffset = (offset) => {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      return localDayKey(date);
    };
    const hourlyUsageHistory = {};

    for (let offset = 0; offset < 3; offset += 1) {
      hourlyUsageHistory[dayForOffset(offset)] = {
        10: {
          timeMs: 8 * 60 * 1000,
          visits: 1,
          domains: { "reddit.com": 8 * 60 * 1000 },
          domainVisits: { "reddit.com": 1 },
        },
      };
    }

    const insights = analyzeUsagePatterns({
      now,
      settings: { personalInsightsEnabled: true, insightSensitivity: "normal" },
      activeSession: {
        domain: "youtube.com",
        startedAt: now - 40 * 60 * 1000,
        lastHeartbeatAt: now,
      },
      allStatsToday: {
        "youtube.com": { timeMs: 40 * 60 * 1000, visits: 2 },
        "linkedin.com": { timeMs: 50 * 60 * 1000, visits: 2 },
      },
      statsHistory: {
        [dayForOffset(1)]: {
          "linkedin.com": { timeMs: 12 * 60 * 1000, visits: 1 },
        },
        [dayForOffset(2)]: {
          "linkedin.com": { timeMs: 10 * 60 * 1000, visits: 1 },
        },
        [dayForOffset(3)]: {
          "linkedin.com": { timeMs: 11 * 60 * 1000, visits: 1 },
        },
      },
      hourlyUsageHistory,
      blockedDomains: {},
    });

    expect(insights.map((insight) => insight.type)).toEqual(
      expect.arrayContaining([
        "long_session",
        "recurring_time_block",
        "usage_increase",
      ]),
    );
    expect(new Set(insights.map((insight) => insight.domain)).size).toBe(
      insights.length,
    );
  });

  test("analyzeUsagePatterns detects blocked returns and snooze loops", () => {
    const now = new Date(2026, 4, 10, 15, 30).getTime();
    const today = localDayKey(new Date(now));
    const yesterday = localDayKey(new Date(now - 24 * 60 * 60 * 1000));
    const behaviorHistory = {
      [today]: {
        count: 8,
        byType: { blocked_page_view: 4, snooze: 4 },
        byDomain: {
          "reddit.com": { blocked_page_view: 4, snooze: 2 },
          "youtube.com": { snooze: 2 },
        },
        byHour: {
          15: { blocked_page_view: 4, snooze: 4 },
        },
        events: [
          { type: "blocked_page_view", domain: "reddit.com", hour: 15, timestamp: now - 20 * 60 * 1000, source: "limit", tier: "standard" },
          { type: "blocked_page_view", domain: "reddit.com", hour: 15, timestamp: now - 18 * 60 * 1000, source: "limit", tier: "standard" },
          { type: "blocked_page_view", domain: "reddit.com", hour: 15, timestamp: now - 15 * 60 * 1000, source: "limit", tier: "standard" },
          { type: "blocked_page_view", domain: "reddit.com", hour: 15, timestamp: now - 12 * 60 * 1000, source: "limit", tier: "standard" },
          { type: "snooze", domain: "reddit.com", hour: 15, timestamp: now - 10 * 60 * 1000, source: "limit", tier: "standard", minutes: 5 },
          { type: "snooze", domain: "reddit.com", hour: 15, timestamp: now - 5 * 60 * 1000, source: "limit", tier: "standard", minutes: 15 },
          { type: "snooze", domain: "youtube.com", hour: 15, timestamp: now - 8 * 60 * 1000, source: "limit", tier: "standard", minutes: 5 },
          { type: "snooze", domain: "youtube.com", hour: 15, timestamp: now - 3 * 60 * 1000, source: "limit", tier: "standard", minutes: 5 },
        ],
      },
    };

    const insights = analyzeUsagePatterns({
      now,
      settings: { personalInsightsEnabled: true, insightSensitivity: "normal" },
      allStatsToday: {
        "reddit.com": { timeMs: 6 * 60 * 1000, visits: 1 },
        "youtube.com": { timeMs: 4 * 60 * 1000, visits: 1 },
      },
      statsHistory: {
        [yesterday]: {
          "reddit.com": { timeMs: 3 * 60 * 1000, visits: 1 },
          "youtube.com": { timeMs: 3 * 60 * 1000, visits: 1 },
        },
      },
      hourlyUsageHistory: {},
      behaviorHistory,
      blockedDomains: {
        "reddit.com": { limitSeconds: 60, tier: "standard" },
        "youtube.com": { limitSeconds: 60, tier: "standard" },
      },
    });

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "blocked_return_pattern",
          domain: "reddit.com",
        }),
        expect.objectContaining({
          type: "snooze_loop",
          domain: "youtube.com",
        }),
      ]),
    );
  });

  test("analyzeUsagePatterns detects quick returns and interspersed visits", () => {
    const now = new Date(2026, 4, 10, 16, 30).getTime();
    const today = localDayKey(new Date(now));
    const yesterday = localDayKey(new Date(now - 24 * 60 * 60 * 1000));
    const events = [
      { type: "return_after_close", domain: "reddit.com", hour: 16, timestamp: now - 40 * 60 * 1000 },
      { type: "new_tab_quick_nav", domain: "reddit.com", hour: 16, timestamp: now - 35 * 60 * 1000 },
      { type: "navigation_visit", domain: "youtube.com", hour: 16, timestamp: now - 30 * 60 * 1000 },
      { type: "navigation_visit", domain: "docs.google.com", hour: 16, timestamp: now - 28 * 60 * 1000 },
      { type: "navigation_visit", domain: "youtube.com", hour: 16, timestamp: now - 25 * 60 * 1000 },
      { type: "navigation_visit", domain: "mail.google.com", hour: 16, timestamp: now - 22 * 60 * 1000 },
      { type: "navigation_visit", domain: "youtube.com", hour: 16, timestamp: now - 18 * 60 * 1000 },
      { type: "navigation_visit", domain: "calendar.google.com", hour: 16, timestamp: now - 14 * 60 * 1000 },
      { type: "navigation_visit", domain: "youtube.com", hour: 16, timestamp: now - 10 * 60 * 1000 },
    ];
    const behaviorHistory = {
      [today]: {
        count: events.length,
        byType: {
          return_after_close: 1,
          new_tab_quick_nav: 1,
          navigation_visit: 7,
        },
        byDomain: {
          "reddit.com": { return_after_close: 1, new_tab_quick_nav: 1 },
          "youtube.com": { navigation_visit: 4 },
          "docs.google.com": { navigation_visit: 1 },
          "mail.google.com": { navigation_visit: 1 },
          "calendar.google.com": { navigation_visit: 1 },
        },
        byHour: {
          16: {
            return_after_close: 1,
            new_tab_quick_nav: 1,
            navigation_visit: 7,
          },
        },
        events,
      },
    };

    const insights = analyzeUsagePatterns({
      now,
      settings: { personalInsightsEnabled: true, insightSensitivity: "normal" },
      allStatsToday: {
        "reddit.com": { timeMs: 4 * 60 * 1000, visits: 2 },
        "youtube.com": { timeMs: 4 * 60 * 1000, visits: 4 },
      },
      statsHistory: {
        [yesterday]: {
          "reddit.com": { timeMs: 3 * 60 * 1000, visits: 1 },
          "youtube.com": { timeMs: 3 * 60 * 1000, visits: 1 },
        },
      },
      hourlyUsageHistory: {},
      behaviorHistory,
      blockedDomains: {},
    });

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "quick_return_pattern",
          domain: "reddit.com",
        }),
        expect.objectContaining({
          type: "interspersed_visit_pattern",
          domain: "youtube.com",
        }),
      ]),
    );
  });

  test("analyzeUsagePatterns detects substitution, baseline, escalation, intervention, and multi-day patterns", () => {
    const now = new Date(2026, 4, 10, 21, 30).getTime();
    const today = localDayKey(new Date(now));
    const dayForOffset = (offset) => {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      return localDayKey(date);
    };
    const event = (type, domain, minutesAgo, extra = {}) => ({
      type,
      domain,
      hour: new Date(now - minutesAgo * 60 * 1000).getHours(),
      timestamp: now - minutesAgo * 60 * 1000,
      ...extra,
    });
    const todayEvents = [
      event("blocked_page_view", "instagram.com", 120, { source: "limit" }),
      event("navigation_visit", "youtube.com", 118),
      event("blocked_page_view", "instagram.com", 90, { source: "limit" }),
      event("navigation_visit", "youtube.com", 88),
      event("blocked_page_view", "instagram.com", 60, { source: "limit" }),
      event("navigation_visit", "youtube.com", 58),
      event("blocked_page_view", "instagram.com", 40, { source: "limit" }),
      event("blocked_page_view", "instagram.com", 20, { source: "limit" }),
      event("blocked_page_view", "reddit.com", 80, { source: "limit" }),
      event("blocked_page_view", "reddit.com", 70, { source: "limit" }),
      event("blocked_page_view", "reddit.com", 60, { source: "limit" }),
      event("blocked_page_view", "reddit.com", 50, { source: "limit" }),
      event("blocked_page_view", "reddit.com", 40, { source: "limit" }),
      ...Array.from({ length: 20 }, (_, index) =>
        event("blocked_page_view", "focus.com", 35 - index, { source: "scheduled" }),
      ),
      event("blocked_page_view", "tiktok.com", 34, { source: "limit" }),
      event("blocked_page_view", "tiktok.com", 33, { source: "limit" }),
      event("blocked_page_view", "tiktok.com", 32, { source: "limit" }),
      event("blocked_page_view", "tiktok.com", 31, { source: "limit" }),
    ];
    const dayEvents = (domain, count, source = "limit") =>
      Array.from({ length: count }, (_, index) => ({
        type: "blocked_page_view",
        domain,
        hour: 14,
        timestamp: now - index * 60 * 1000,
        source,
      }));
    const behaviorHistory = {
      [today]: { events: todayEvents },
      [dayForOffset(1)]: { events: [...dayEvents("instagram.com", 12), ...dayEvents("tiktok.com", 14)] },
      [dayForOffset(2)]: { events: [...dayEvents("instagram.com", 11), ...dayEvents("tiktok.com", 13)] },
      [dayForOffset(3)]: { events: [...dayEvents("instagram.com", 13), ...dayEvents("tiktok.com", 14)] },
      [dayForOffset(4)]: { events: [...dayEvents("instagram.com", 12), ...dayEvents("tiktok.com", 13)] },
    };

    const insights = analyzeUsagePatterns({
      now,
      settings: { personalInsightsEnabled: true, insightSensitivity: "normal" },
      allStatsToday: {
        "instagram.com": { timeMs: 5 * 60 * 1000, visits: 5 },
        "youtube.com": { timeMs: 4 * 60 * 1000, visits: 3 },
        "reddit.com": { timeMs: 5 * 60 * 1000, visits: 5 },
        "focus.com": { timeMs: 3 * 60 * 1000, visits: 1 },
        "tiktok.com": { timeMs: 4 * 60 * 1000, visits: 4 },
      },
      statsHistory: {
        [dayForOffset(1)]: { "instagram.com": { timeMs: 5 * 60 * 1000, visits: 12 } },
      },
      hourlyUsageHistory: {},
      behaviorHistory,
      blockedDomains: {},
    });

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "substitution_pattern",
          domain: "youtube.com",
          context: expect.objectContaining({
            blockedDomain: "instagram.com",
            count: 3,
            windowMinutes: 5,
          }),
        }),
        expect.objectContaining({
          type: "baseline_improvement",
          domain: "instagram.com",
          context: expect.objectContaining({
            todayCount: 5,
            usualCount: 12,
          }),
        }),
        expect.objectContaining({
          type: "late_escalation",
          domain: "reddit.com",
          context: expect.objectContaining({
            count: 5,
            total: 5,
            cutoffHour: 20,
          }),
        }),
        expect.objectContaining({
          type: "intervention_effectiveness",
          domain: "focus.com",
          context: expect.objectContaining({
            scheduledCount: 20,
          }),
        }),
        expect.objectContaining({
          type: "multi_day_return_leader",
          domain: "tiktok.com",
          context: expect.objectContaining({
            days: 4,
            windowDays: 5,
          }),
        }),
      ]),
    );
  });

  test("generateInsights stores insights and caps pattern notifications", async () => {
    const now = new Date(2026, 4, 10, 11, 0).getTime();
    const dayForOffset = (offset) => {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      return localDayKey(date);
    };
    const clone = (value) =>
      value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const storage = {
      data: {
        statsDayKey: dayForOffset(0),
        statsToday: { "youtube.com": { timeMs: 45 * 60 * 1000, visits: 2 } },
        allStatsToday: { "youtube.com": { timeMs: 45 * 60 * 1000, visits: 2 } },
        statsHistory: {
          [dayForOffset(1)]: {
            "youtube.com": { timeMs: 10 * 60 * 1000, visits: 1 },
          },
          [dayForOffset(2)]: {
            "youtube.com": { timeMs: 12 * 60 * 1000, visits: 1 },
          },
          [dayForOffset(3)]: {
            "youtube.com": { timeMs: 11 * 60 * 1000, visits: 1 },
          },
        },
        hourlyUsageHistory: {},
        blockedDomains: {},
        activeSession: {
          domain: "youtube.com",
          startedAt: now - 40 * 60 * 1000,
          lastHeartbeatAt: now,
        },
        personalInsights: [],
        dismissedInsights: {},
        insightNotificationHistory: {},
        insightNotificationDaily: {},
        uiSettings: {
          personalInsightsEnabled: true,
          insightNotificationsEnabled: true,
          insightMaxNotificationsPerDay: 1,
          insightSensitivity: "normal",
        },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = clone(this.data[k]);
        return out;
      },
      async set(items) {
        Object.assign(this.data, clone(items));
        return items;
      },
    };

    const origStorage = global.chrome.storage.local;
    const origNotificationCreate = global.chrome.notifications.create;
    global.chrome.storage.local = storage;
    global.chrome.notifications.create = jest.fn(async () => "notification-id");

    const result = await generateInsights({ now, allowNotifications: true });
    expect(result.success).toBe(true);
    expect(storage.data.personalInsights.length).toBeGreaterThan(0);
    expect(global.chrome.notifications.create).toHaveBeenCalledTimes(1);

    const notified = storage.data.personalInsights.find(
      (insight) => insight.notify,
    );
    expect(await shouldSendNotification(notified, { now: now + 1000 })).toBe(
      false,
    );
    expect(await sendPatternNotification(notified, { now: now + 1000 })).toBe(
      false,
    );
    expect(global.chrome.notifications.create).toHaveBeenCalledTimes(1);

    global.chrome.storage.local = origStorage;
    global.chrome.notifications.create = origNotificationCreate;
  });

  test("generateInsights replaces stale stored insights with current patterns", async () => {
    const now = new Date(2026, 4, 10, 11, 0).getTime();
    const today = localDayKey(new Date(now));
    const yesterday = localDayKey(new Date(now - 24 * 60 * 60 * 1000));
    const clone = (value) =>
      value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const storage = {
      data: {
        statsDayKey: today,
        statsToday: { "youtube.com": { timeMs: 45 * 60 * 1000, visits: 2 } },
        allStatsToday: { "youtube.com": { timeMs: 45 * 60 * 1000, visits: 2 } },
        statsHistory: {
          [yesterday]: { "youtube.com": { timeMs: 5 * 60 * 1000, visits: 1 } },
        },
        hourlyUsageHistory: {},
        blockedDomains: {},
        activeSession: {
          domain: "youtube.com",
          startedAt: now - 40 * 60 * 1000,
          lastHeartbeatAt: now,
        },
        personalInsights: [
          {
            id: `long_session:amazon.com:${today}`,
            type: "long_session",
            domain: "amazon.com",
            title: "Amazon is holding your attention right now",
            message: "Active for 148 minutes straight",
            priority: 100,
            timestamp: now - 60 * 60 * 1000,
            dateKey: today,
            context: { durationMs: 148 * 60 * 1000 },
          },
          {
            id: `legacy-google-id:${today}`,
            type: "limit_suggestion",
            domain: "google.com",
            title: "Google has been a frequent stop this week",
            message: "Active after 9pm on 5 of the last 7 days",
            priority: 95,
            timestamp: now - 30 * 60 * 1000,
            dateKey: today,
            context: { activeDays: 5, windowDays: 7 },
          },
        ],
        dismissedInsights: {},
        uiSettings: {
          personalInsightsEnabled: true,
          insightNotificationsEnabled: true,
          insightMaxNotificationsPerDay: 1,
          insightSensitivity: "normal",
        },
      },
      async get(keys) {
        const out = {};
        for (const k of keys) out[k] = clone(this.data[k]);
        return out;
      },
      set: jest.fn(async function set(items) {
        Object.assign(this.data, clone(items));
        return items;
      }),
    };

    const origStorage = global.chrome.storage.local;
    global.chrome.storage.local = storage;

    const result = await generateInsights({ now, allowNotifications: false });

    expect(result.success).toBe(true);
    expect(storage.data.personalInsights).toHaveLength(1);
    expect(storage.data.personalInsights[0]).toEqual(
      expect.objectContaining({
        type: "long_session",
        domain: "youtube.com",
      }),
    );
    expect(
      storage.data.personalInsights.some(
        (insight) => insight.domain === "amazon.com",
      ),
    ).toBe(false);
    expect(
      storage.data.personalInsights.some(
        (insight) => insight.domain === "google.com",
      ),
    ).toBe(false);

    global.chrome.storage.local = origStorage;
  });

  test("insight titles preserve meaningful Google subdomain labels", () => {
    const now = new Date(2026, 4, 10, 11, 0).getTime();
    const dayForOffset = (offset) => {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      return localDayKey(date);
    };
    const domains = ["chrome.google.com", "analytics.google.com", "google.com"];
    const statsForDomains = Object.fromEntries(
      domains.map((domain) => [domain, { timeMs: 25 * 60 * 1000, visits: 3 }]),
    );

    const insights = analyzeUsagePatterns({
      now,
      settings: { personalInsightsEnabled: true, insightSensitivity: "normal" },
      allStatsToday: statsForDomains,
      statsHistory: {
        [dayForOffset(1)]: statsForDomains,
        [dayForOffset(2)]: statsForDomains,
      },
      hourlyUsageHistory: {},
      blockedDomains: {},
    });

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "chrome.google.com",
          title: expect.stringContaining("Chrome Web Store"),
        }),
        expect.objectContaining({
          domain: "analytics.google.com",
          title: expect.stringContaining("Google Analytics"),
        }),
        expect.objectContaining({
          domain: "google.com",
          title: expect.stringContaining("Google"),
        }),
      ]),
    );
  });

  test("insight titles keep full hosts when friendly labels collide", () => {
    const now = new Date(2026, 4, 10, 11, 0).getTime();
    const dayForOffset = (offset) => {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      return localDayKey(date);
    };
    const domains = ["app.example.com", "docs.example.com", "example.com"];
    const statsForDomains = Object.fromEntries(
      domains.map((domain) => [domain, { timeMs: 25 * 60 * 1000, visits: 3 }]),
    );

    const insights = analyzeUsagePatterns({
      now,
      settings: { personalInsightsEnabled: true, insightSensitivity: "normal" },
      allStatsToday: statsForDomains,
      statsHistory: {
        [dayForOffset(1)]: statsForDomains,
        [dayForOffset(2)]: statsForDomains,
      },
      hourlyUsageHistory: {},
      blockedDomains: {},
    });

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "app.example.com",
          title: expect.stringContaining("app.example.com"),
        }),
        expect.objectContaining({
          domain: "docs.example.com",
          title: expect.stringContaining("docs.example.com"),
        }),
        expect.objectContaining({
          domain: "example.com",
          title: expect.stringContaining("example.com"),
        }),
      ]),
    );
  });

  test("scheduled block messages reject invalid times before storing", async () => {
    const response = await sendBackgroundMessage({
      action: "addScheduledBlock",
      block: {
        domain: "focus.com",
        startTime: "tomorrow",
        endTime: "banana",
        days: [1],
        tier: "standard",
      },
    });

    expect(response).toEqual({
      success: false,
      error: "Enter valid start and end times.",
    });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test("overnight scheduled blocks stay active after midnight", () => {
    const block = {
      domain: "example.com",
      startTime: "22:00",
      endTime: "02:00",
      days: [1],
      enabled: true,
    };

    expect(isScheduleActive(block, new Date(2024, 0, 1, 23, 0).getTime())).toBe(
      true,
    );
    expect(isScheduleActive(block, new Date(2024, 0, 2, 1, 0).getTime())).toBe(
      true,
    );
    expect(isScheduleActive(block, new Date(2024, 0, 2, 3, 0).getTime())).toBe(
      false,
    );
  });

  test("nextScheduleTime returns the current overnight end after restart", () => {
    const block = {
      domain: "example.com",
      startTime: "22:00",
      endTime: "02:00",
      days: [1],
      enabled: true,
    };
    const from = new Date(2024, 0, 2, 1, 0).getTime();
    const nextEnd = new Date(nextScheduleTime(block, "end", from));

    expect(nextEnd.getFullYear()).toBe(2024);
    expect(nextEnd.getMonth()).toBe(0);
    expect(nextEnd.getDate()).toBe(2);
    expect(nextEnd.getHours()).toBe(2);
    expect(nextEnd.getMinutes()).toBe(0);
  });

  test("day reset retains recent histories and prunes expired entries", async () => {
    const now = new Date(2026, 7, 9, 12, 0).getTime();
    const yesterday = localDayKey(new Date(2026, 7, 8, 12, 0));
    const oldDay = localDayKey(new Date(2026, 3, 1, 12, 0));
    const storage = {
      data: {
        statsDayKey: yesterday,
        statsToday: { "example.com": { timeMs: 60000, visits: 1 } },
        statsHistory: { [oldDay]: { stale: true } },
        hourlyUsageHistory: { [oldDay]: { "10": { timeMs: 1000 } } },
        snoozeHistory: { [yesterday]: 2, [oldDay]: 4 },
        recentlyReset: {
          "recent.com": now - 1000,
          "stale.com": now - 6000,
        },
      },
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, structuredClone(this.data[key])]));
      },
      async set(items) {
        Object.assign(this.data, structuredClone(items));
      },
    };
    const original = global.chrome.storage.local;
    global.chrome.storage.local = storage;

    await ensureDayReset(now);

    expect(storage.data.statsToday).toEqual({});
    expect(storage.data.statsHistory[yesterday]).toEqual({
      "example.com": { timeMs: 60000, visits: 1 },
    });
    expect(storage.data.statsHistory[oldDay]).toBeUndefined();
    expect(storage.data.snoozeHistory).toEqual({ [yesterday]: 2 });
    expect(storage.data.recentlyReset).toEqual({ "recent.com": now - 1000 });
    global.chrome.storage.local = original;
  });

  test("concurrent activity updates do not lose elapsed time", async () => {
    const now = Date.now();
    const storage = {
      data: {
        statsDayKey: localDayKey(new Date(now)),
        statsToday: {},
        allStatsToday: {},
        hourlyUsageHistory: {},
        statsHistory: {},
        snoozeHistory: {},
        recentlyReset: {},
        blockedDomains: {},
        snoozedDomains: {},
        uiSettings: { personalInsightsEnabled: false },
      },
      async get(keys) {
        await Promise.resolve();
        return Object.fromEntries(keys.map((key) => [key, structuredClone(this.data[key])]));
      },
      async set(items) {
        await Promise.resolve();
        Object.assign(this.data, structuredClone(items));
      },
    };
    const original = global.chrome.storage.local;
    global.chrome.storage.local = storage;

    await Promise.all([
      updateDomainActivity("example.com", {
        deltaMs: 1000,
        startMs: now - 2000,
        endMs: now - 1000,
      }),
      updateDomainActivity("example.com", {
        deltaMs: 1000,
        startMs: now - 1000,
        endMs: now,
      }),
    ]);

    expect(storage.data.statsToday["example.com"].timeMs).toBe(2000);
    expect(storage.data.allStatsToday["example.com"].timeMs).toBe(2000);
    global.chrome.storage.local = original;
  });

  test("schedule reconciliation preserves active runtime state", async () => {
    const now = new Date(2026, 7, 3, 12, 0).getTime();
    const startedAt = now - 20 * 60 * 1000;
    const block = {
      id: "schedule-1",
      domain: "focus.com",
      startTime: "11:00",
      endTime: "13:00",
      days: [new Date(now).getDay()],
      enabled: true,
      tier: "standard",
    };
    const storage = {
      data: {
        scheduledBlocks: [block],
        activeBlocks: [{ ...block, startedAt, breakMs: 3000 }],
      },
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, structuredClone(this.data[key])]));
      },
      async set(items) {
        Object.assign(this.data, structuredClone(items));
      },
    };
    const originalStorage = global.chrome.storage.local;
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(now);
    global.chrome.storage.local = storage;

    await reconcileSchedules();

    expect(storage.data.activeBlocks[0]).toEqual(
      expect.objectContaining({ startedAt, breakMs: 3000 }),
    );
    nowSpy.mockRestore();
    global.chrome.storage.local = originalStorage;
  });

  test("adding a schedule during its current window activates and redirects immediately", async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 5 * 60 * 1000);
    const time = (date) =>
      `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const storage = {
      data: { scheduledBlocks: [], activeBlocks: [] },
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
      },
      async set(items) {
        Object.assign(this.data, items);
      },
    };
    const originalStorage = global.chrome.storage.local;
    const originalQuery = global.chrome.tabs.query;
    const originalUpdate = global.chrome.tabs.update;
    global.chrome.storage.local = storage;
    global.chrome.tabs.query = jest.fn(async () => [
      { id: 41, url: "https://focus.com/articles" },
    ]);
    global.chrome.tabs.update = jest.fn(async () => ({}));

    const response = await sendBackgroundMessage({
      action: "addScheduledBlock",
      block: {
        id: "current-focus-session",
        domain: "focus.com",
        startTime: time(now),
        endTime: time(end),
        days: [now.getDay()],
        tier: "standard",
      },
    });

    expect(response).toEqual(expect.objectContaining({ success: true }));
    expect(storage.data.activeBlocks).toEqual([
      expect.objectContaining({
        id: "current-focus-session",
        domain: "focus.com",
        tier: "standard",
      }),
    ]);
    expect(global.chrome.tabs.update).toHaveBeenCalledWith(
      41,
      expect.objectContaining({
        url: expect.stringContaining("blocked.html?d=focus.com&source=scheduled"),
      }),
    );

    global.chrome.storage.local = originalStorage;
    global.chrome.tabs.query = originalQuery;
    global.chrome.tabs.update = originalUpdate;
  });

  test("premium verification errors retain the last known state and pending token", async () => {
    const storage = {
      data: {
        whopAccessToken: "known-token",
        whopPendingToken: "pending-token",
        premiumState: { active: true, planName: "Saturn Premium", checkedAt: 123 },
      },
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
      },
      async set(items) {
        Object.assign(this.data, items);
      },
    };
    const originalStorage = global.chrome.storage.local;
    const originalFetch = global.fetch;
    global.chrome.storage.local = storage;
    global.fetch = jest.fn(async () => ({ ok: false, status: 502 }));

    const result = await refreshStoredPremiumStatus("test");

    expect(result).toEqual(expect.objectContaining({ active: true, stale: true }));
    expect(storage.data.whopAccessToken).toBe("known-token");
    expect(storage.data.whopPendingToken).toBe("pending-token");
    global.fetch = originalFetch;
    global.chrome.storage.local = originalStorage;
  });

  test("premium state becomes inactive when no entitlement token remains", async () => {
    const storage = {
      data: {
        whopAccessToken: null,
        whopPendingToken: null,
        premiumState: { active: true, planName: "Saturn Premium" },
      },
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
      },
      async set(items) {
        Object.assign(this.data, items);
      },
    };
    const original = global.chrome.storage.local;
    global.chrome.storage.local = storage;

    const result = await refreshStoredPremiumStatus("test");

    expect(result).toEqual(expect.objectContaining({ active: false, planName: "Free" }));
    expect(storage.data.premiumState.active).toBe(false);
    global.chrome.storage.local = original;
  });

  test("time parsing and snooze duration validation reject ambiguous input", async () => {
    expect(parseTime("13 PM")).toBeNull();
    expect(parseTime("0 PM")).toBeNull();
    expect(parseTime("12:30 AM")).toEqual({ hour: 0, minute: 30 });
    await expect(snoozeDomain("example.com", Infinity)).rejects.toThrow(
      "between 1 and 60 minutes",
    );
  });

  test("disabling immutable override does not reset its daily use record", async () => {
    const storage = {
      data: {
        immutableAdminOverrideEnabled: true,
        immutableAdminOverrideLastUsedDay: "2026-08-09",
      },
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
      },
      async set(items) {
        Object.assign(this.data, items);
      },
    };
    const original = global.chrome.storage.local;
    global.chrome.storage.local = storage;

    const response = await sendBackgroundMessage({
      action: "setImmutableAdminOverride",
      enabled: false,
    });

    expect(response.success).toBe(true);
    expect(storage.data.immutableAdminOverrideLastUsedDay).toBe("2026-08-09");
    global.chrome.storage.local = original;
  });

  test("insight generation loads behavior history", async () => {
    const today = localDayKey();
    const storage = {
      data: {
        statsDayKey: today,
        statsToday: {},
        statsHistory: {},
        hourlyUsageHistory: {},
        snoozeHistory: {},
        recentlyReset: {},
        behaviorHistory: { [today]: { count: 1, events: [] } },
        uiSettings: { personalInsightsEnabled: false },
      },
      get: jest.fn(async function (keys) {
        return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
      }),
      async set(items) {
        Object.assign(this.data, items);
      },
    };
    const original = global.chrome.storage.local;
    global.chrome.storage.local = storage;

    await generateInsights({ now: Date.now(), allowNotifications: false });

    expect(
      storage.get.mock.calls.some(([keys]) => keys.includes("behaviorHistory")),
    ).toBe(true);
    global.chrome.storage.local = original;
  });

  test("pattern pauses redirect only after scheduled and hard-limit checks pass", async () => {
    const now = Date.now();
    const today = localDayKey(new Date(now));
    const rule = {
      id: "pattern:instagram.com",
      domain: "instagram.com",
      enabled: true,
      mode: "ongoing",
      createdAt: now - 60000,
      updatedAt: now - 60000,
      thresholdVisits: 3,
      windowMinutes: 30,
      minSignals: 1,
      cooldownMinutes: 5,
      bypassMinutes: 10,
      lastTriggeredAt: 0,
    };
    const events = [
      { type: "navigation_visit", domain: "instagram.com", timestamp: now - 900000 },
      { type: "new_tab_quick_nav", domain: "instagram.com", timestamp: now - 899500 },
      { type: "navigation_visit", domain: "instagram.com", timestamp: now - 480000 },
      { type: "navigation_visit", domain: "instagram.com", timestamp: now - 60000 },
    ];
    const storage = {
      data: {
        activeBlocks: [],
        blockedDomains: {},
        statsToday: {},
        snoozedDomains: {},
        recentlyReset: {},
        behaviorHistory: { [today]: { count: events.length, events } },
        patternPauseRules: { "instagram.com": rule },
        patternPauseHistory: { events: [], byRule: {} },
        patternPauseBypasses: {},
        uiSettings: { patternPausesEnabled: true, personalInsightsEnabled: false },
        premiumState: { active: true, planName: "Pro" },
      },
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
      },
      async set(items) {
        Object.assign(this.data, items);
      },
    };
    const originalStorage = global.chrome.storage.local;
    const originalGet = global.chrome.tabs.get;
    const originalUpdate = global.chrome.tabs.update;
    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 41,
      url: "https://instagram.com/reels/abc",
    }));
    global.chrome.tabs.update = jest.fn(async () => ({}));

    expect(await enforceIfNeeded(41)).toBe(true);
    expect(global.chrome.tabs.update).toHaveBeenCalledWith(
      41,
      expect.objectContaining({ url: expect.stringContaining("pattern-pause.html?") }),
    );
    expect(global.chrome.tabs.update.mock.calls[0][1].url).toContain(
      "u=https%3A%2F%2Finstagram.com%2Freels%2Fabc",
    );
    expect(storage.data.patternPauseHistory.byRule[rule.id].shown).toBe(1);

    storage.data.blockedDomains = {
      "instagram.com": { enabled: true, limitSeconds: 60, tier: "standard" },
    };
    storage.data.statsToday = {
      "instagram.com": { timeMs: 60000, visits: 3 },
    };
    global.chrome.tabs.update.mockClear();

    expect(await enforceIfNeeded(41)).toBe(true);
    expect(global.chrome.tabs.update.mock.calls[0][1].url).toContain(
      "blocked.html?",
    );
    expect(global.chrome.tabs.update.mock.calls[0][1].url).not.toContain(
      "pattern-pause.html",
    );

    global.chrome.storage.local = originalStorage;
    global.chrome.tabs.get = originalGet;
    global.chrome.tabs.update = originalUpdate;
  });

  test("free users get one experienced Pattern Pause before future activations lock", async () => {
    const now = Date.now();
    const today = localDayKey(new Date(now));
    const rule = {
      id: "pattern:instagram.com",
      domain: "instagram.com",
      enabled: true,
      mode: "ongoing",
      createdAt: now - 60000,
      updatedAt: now - 60000,
      thresholdVisits: 3,
      windowMinutes: 30,
      minSignals: 1,
      cooldownMinutes: 5,
      bypassMinutes: 10,
      lastTriggeredAt: 0,
    };
    const events = [
      { type: "navigation_visit", domain: "instagram.com", timestamp: now - 900000 },
      { type: "new_tab_quick_nav", domain: "instagram.com", timestamp: now - 899500 },
      { type: "navigation_visit", domain: "instagram.com", timestamp: now - 480000 },
      { type: "navigation_visit", domain: "instagram.com", timestamp: now - 60000 },
    ];
    const storage = {
      data: {
        activeBlocks: [],
        blockedDomains: {},
        statsToday: {},
        snoozedDomains: {},
        recentlyReset: {},
        behaviorHistory: { [today]: { count: events.length, events } },
        patternPauseRules: {},
        patternPauseHistory: { events: [], byRule: {} },
        patternPauseDismissals: {},
        patternPauseBypasses: {},
        patternPauseFreeTrial: {},
        uiSettings: { patternPausesEnabled: true, personalInsightsEnabled: true },
        premiumState: { active: false, planName: "Free" },
      },
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
      },
      async set(items) {
        Object.assign(this.data, items);
      },
    };
    const originalStorage = global.chrome.storage.local;
    const originalGet = global.chrome.tabs.get;
    const originalUpdate = global.chrome.tabs.update;
    global.chrome.storage.local = storage;
    global.chrome.tabs.get = jest.fn(async () => ({
      id: 43,
      url: "https://instagram.com/reels/abc",
    }));
    global.chrome.tabs.update = jest.fn(async () => ({}));

    const response = await sendBackgroundMessage({
      action: "enablePatternPause",
      domain: "instagram.com",
      mode: "today",
      thresholdVisits: 3,
      windowMinutes: 30,
    });

    expect(response).toEqual(
      expect.objectContaining({ success: true, freeTrial: true }),
    );
    expect(storage.data.patternPauseRules["instagram.com"]).toEqual(
      expect.objectContaining({ domain: "instagram.com", mode: "today" }),
    );
    expect(storage.data.patternPauseFreeTrial).toEqual(
      expect.objectContaining({
        ruleId: "pattern:instagram.com",
        domain: "instagram.com",
        experiencedAt: 0,
      }),
    );

    const tunedResponse = await sendBackgroundMessage({
      action: "updatePatternPauseRule",
      domain: "instagram.com",
      thresholdVisits: 3,
      windowMinutes: 45,
    });
    expect(tunedResponse).toEqual(expect.objectContaining({ success: true }));
    const keepResponse = await sendBackgroundMessage({
      action: "updatePatternPauseRule",
      domain: "instagram.com",
      mode: "ongoing",
    });
    expect(keepResponse).toEqual(
      expect.objectContaining({ success: false, code: "premium_required" }),
    );

    expect(await enforceIfNeeded(43)).toBe(true);
    expect(global.chrome.tabs.update).toHaveBeenCalledWith(
      43,
      expect.objectContaining({ url: expect.stringContaining("pattern-pause.html?") }),
    );
    expect(storage.data.patternPauseFreeTrial.experiencedAt).toBeGreaterThan(0);

    storage.data.patternPauseRules = {};
    const lockedResponse = await sendBackgroundMessage({
      action: "enablePatternPause",
      domain: "instagram.com",
      mode: "today",
      thresholdVisits: 3,
      windowMinutes: 30,
    });
    expect(lockedResponse).toEqual(
      expect.objectContaining({ success: false, code: "premium_required" }),
    );

    storage.data.patternPauseRules = { "instagram.com": rule };
    storage.data.patternPauseFreeTrial = {
      ruleId: "pattern:reddit.com",
      domain: "reddit.com",
      activatedAt: now - 60000,
      experiencedAt: now - 30000,
      expiresAt: now + 60000,
    };
    global.chrome.tabs.update.mockClear();
    expect(await enforceIfNeeded(43)).toBe(false);
    expect(global.chrome.tabs.update).not.toHaveBeenCalled();

    global.chrome.storage.local = originalStorage;
    global.chrome.tabs.get = originalGet;
    global.chrome.tabs.update = originalUpdate;
  });

  test("continuing grants a same-tab bypass without changing the rule", async () => {
    const now = Date.now();
    const today = localDayKey(new Date(now));
    const rule = {
      id: "pattern:instagram.com",
      domain: "instagram.com",
      enabled: true,
      mode: "ongoing",
      createdAt: now - 60000,
      updatedAt: now - 60000,
      thresholdVisits: 3,
      windowMinutes: 30,
      minSignals: 1,
      cooldownMinutes: 5,
      bypassMinutes: 10,
      lastTriggeredAt: 0,
    };
    const events = [
      { type: "navigation_visit", domain: "instagram.com", timestamp: now - 900000 },
      { type: "new_tab_quick_nav", domain: "instagram.com", timestamp: now - 899500 },
      { type: "navigation_visit", domain: "instagram.com", timestamp: now - 480000 },
      { type: "navigation_visit", domain: "instagram.com", timestamp: now - 60000 },
    ];
    const storage = {
      data: {
        activeBlocks: [],
        blockedDomains: {},
        statsToday: {},
        snoozedDomains: {},
        recentlyReset: {},
        behaviorHistory: { [today]: { count: events.length, events } },
        patternPauseRules: { "instagram.com": rule },
        patternPauseHistory: { events: [], byRule: {} },
        patternPauseBypasses: {},
        uiSettings: { patternPausesEnabled: true, personalInsightsEnabled: false },
        premiumState: { active: true, planName: "Pro" },
      },
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
      },
      async set(items) {
        Object.assign(this.data, items);
      },
    };
    const originalStorage = global.chrome.storage.local;
    const originalGet = global.chrome.tabs.get;
    const originalUpdate = global.chrome.tabs.update;
    global.chrome.storage.local = storage;

    const response = await sendBackgroundMessage(
      {
        action: "continuePatternPause",
        domain: "instagram.com",
        ruleId: rule.id,
        original: "https://instagram.com/reels/abc",
      },
      {
        tab: {
          id: 42,
          url: "chrome-extension://test-id/pattern-pause.html?d=instagram.com",
        },
      },
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        redirectUrl: "https://instagram.com/reels/abc",
      }),
    );
    expect(storage.data.patternPauseBypasses["42"]).toEqual(
      expect.objectContaining({ domain: "instagram.com", tabId: 42 }),
    );
    expect(storage.data.patternPauseRules["instagram.com"].enabled).toBe(true);
    expect(storage.data.patternPauseHistory.byRule[rule.id].continued).toBe(1);

    global.chrome.tabs.get = jest.fn(async () => ({
      id: 42,
      url: "https://instagram.com/reels/abc",
    }));
    global.chrome.tabs.update = jest.fn(async () => ({}));
    expect(await enforceIfNeeded(42)).toBe(false);
    expect(global.chrome.tabs.update).not.toHaveBeenCalled();

    global.chrome.storage.local = originalStorage;
    global.chrome.tabs.get = originalGet;
    global.chrome.tabs.update = originalUpdate;
  });
});
