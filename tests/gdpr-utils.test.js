const GdprUtils = require("../gdpr-utils.js");

describe("GDPR data controls", () => {
  let originalStorage;

  beforeEach(() => {
    originalStorage = global.chrome.storage.local;
  });

  afterEach(() => {
    global.chrome.storage.local = originalStorage;
  });

  test("export includes future storage keys", async () => {
    global.chrome.storage.local = {
      get: jest.fn(async () => ({
        statsToday: { "example.com": { timeMs: 1000 } },
        futurePreference: "included",
      })),
      remove: jest.fn(),
    };

    const snapshot = await GdprUtils.exportAllData();

    expect(global.chrome.storage.local.get).toHaveBeenCalledWith(null);
    expect(snapshot.data.futurePreference).toBe("included");
  });

  test("usage deletion covers behavior and reclaim histories", async () => {
    global.chrome.storage.local = {
      get: jest.fn(),
      remove: jest.fn(async () => true),
    };

    await GdprUtils.deleteUsageHistory();

    const removed = global.chrome.storage.local.remove.mock.calls[0][0];
    expect(removed).toEqual(
      expect.arrayContaining([
        "behaviorHistory",
        "activeSession",
        "saturnBlockReclaimStats",
        "saturnJourneyDisplayState",
      ]),
    );
  });

  test("confirmed full deletion clears unknown and authentication data", async () => {
    const data = {
      whopAccessToken: "sensitive-token",
      futurePreference: "future-value",
    };
    global.chrome.storage.local = {
      get: jest.fn(async () => ({ ...data })),
      remove: jest.fn(),
      clear: jest.fn(async () => {
        Object.keys(data).forEach((key) => delete data[key]);
      }),
    };

    await GdprUtils.deleteAllUserData(true);

    expect(global.chrome.storage.local.clear).toHaveBeenCalledTimes(1);
    expect(data).toEqual({});
    expect(global.chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  test("full deletion requires explicit confirmation", async () => {
    await expect(GdprUtils.deleteAllUserData(false)).rejects.toThrow(
      "requires confirmation",
    );
  });
});
