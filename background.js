// blockedDomains: { [domain]: { limitMinutes: number } }
// statsToday: { [domain]: { timeSec: number, visits: number } }
// activeBlocks: [{ domain: string, endsAt: number|null, remainingSec?: number }]

const KEYS = {
    blockedDomains: "blockedDomains", // { [domain]: { limitMinutes } }
    statsToday: "statsToday",         // { [domain]: { timeSec, visits, lastSeenDay } }
    dayKey: "statsDayKey",            // "YYYY-MM-DD"
    enforceIntervalSec: "enforceIntervalSec" // optional: number of seconds between enforce checks
};

let activeTabId = null;
let activeDomain = null;
let activeStartMs = null;

function getDayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function domainFromUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
        return u.hostname.replace(/^www\./, "");
    } catch {
        return null;
    }
}

async function ensureDayReset() {
    const { [KEYS.dayKey]: storedDay } = await chrome.storage.local.get([KEYS.dayKey]);
    const today = getDayKey();
    if (storedDay !== today) {
        await chrome.storage.local.set({ [KEYS.statsToday]: {}, [KEYS.dayKey]: today });
    }
}

async function addTime(domain, deltaMs) {
    if (!domain || deltaMs <= 0) return;
    await ensureDayReset();

    const { blockedDomains = {}, [KEYS.statsToday]: stats = {} } =
        await chrome.storage.local.get([KEYS.blockedDomains, KEYS.statsToday]);

    const cur = stats[domain] || { timeMs: 0, visits: 0 };
    cur.timeMs = (cur.timeMs || 0) + deltaMs;
    stats[domain] = cur;

    await chrome.storage.local.set({ [KEYS.statsToday]: stats });

    // ENFORCE LIMIT (only if domain is currently blocked)
    if (isBlockedDomain(domain, blockedDomains)) {
        const limitMs = limitMsFor(domain, blockedDomains);
        if (limitMs != null && cur.timeMs >= limitMs && activeTabId != null) {
            const t = await chrome.tabs.get(activeTabId).catch(() => null);
            const tabDomain = t?.url ? domainFromUrl(t.url) : null;

            // only redirect if the active tracked tab is STILL on this domain
            if (t?.id != null && tabDomain === domain) {
                await chrome.tabs.update(t.id, { url: blockedUrl(domain) }).catch(() => {});
            }
        }
    }
}

async function addVisit(domain) {
    if (!domain) return;
    await ensureDayReset();

    const { [KEYS.statsToday]: stats = {} } = await chrome.storage.local.get([KEYS.statsToday]);
    const cur = stats[domain] || { timeMs: 0, visits: 0 };
    cur.visits = (cur.visits || 0) + 1;
    stats[domain] = cur;

    await chrome.storage.local.set({ [KEYS.statsToday]: stats });
}

function isBlockedDomain(domain, blockedDomains) {
    return !!blockedDomains?.[domain];
}

function limitMsFor(domain, blockedDomains) {
    const sec = blockedDomains?.[domain]?.limitSeconds;
    if (!Number.isFinite(sec) || sec <= 0) return null;
    return sec * 1000;
}

function blockedUrl(domain) {
    return chrome.runtime.getURL(`blocked.html?d=${encodeURIComponent(domain)}`);
}

async function enforceIfNeeded(tabId) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab?.url) return;
    if (tab.url.startsWith(chrome.runtime.getURL("blocked.html"))) return;

    const domain = domainFromUrl(tab.url);
    if (!domain) return;

    const { blockedDomains = {}, statsToday = {} } =
        await chrome.storage.local.get(["blockedDomains", "statsToday"]);

    const limitMs = limitMsFor(domain, blockedDomains);
    if (limitMs == null) return;

    const usedMs = statsToday?.[domain]?.timeMs || 0;
    if (usedMs >= limitMs) {
        await chrome.tabs.update(tabId, { url: blockedUrl(domain) }).catch(() => {});
    }
}


async function flushTime() {
    if (!activeDomain || !activeStartMs) return;
    const deltaMs = Date.now() - activeStartMs;
    activeStartMs = Date.now(); // reset start for continued tracking
    if (deltaMs > 0) await addTime(activeDomain, deltaMs);
    
    // immediately check if we should enforce on the active tab
    if (activeTabId != null) {
        await enforceIfNeeded(activeTabId);
    }
}

async function setActiveDomain(tabId, countVisit = false) {
    await flushTime();

    activeTabId = tabId;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const d = tab?.url ? domainFromUrl(tab.url) : null;

    if (countVisit && d && d !== activeDomain) await addVisit(d);

    activeDomain = d;
    activeStartMs = d ? Date.now() : null;
}

async function initActive() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id != null) await setActiveDomain(tab.id);
}
chrome.runtime.onStartup?.addListener(() => {
    initActive();
    createEnforceAlarm();
})

chrome.runtime.onInstalled.addListener(() => {
    initActive();
    createEnforceAlarm();
});

async function createEnforceAlarm() {
    const { [KEYS.enforceIntervalSec]: stored = 5 } = await chrome.storage.local.get([KEYS.enforceIntervalSec]);
    let sec = Number(stored);
    if (!Number.isFinite(sec) || sec <= 0) sec = 5;
    const whenMs = Date.now() + sec * 1000;
    // create a one-shot alarm; onAlarm will reschedule the next one
    chrome.alarms.create("enforce", { when: whenMs });
}

// When user switches tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    await setActiveDomain(tabId, true)
    await enforceIfNeeded(tabId); // Check new tab for enforcement
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "enforce") return;

    await flushTime(); // writes timeMs
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); // Get the active tab, not the last tab
    if (activeTab?.id != null) await enforceIfNeeded(activeTab.id);
    // schedule next enforcement
    await createEnforceAlarm();
});

// When the active tab’s URL changes (navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (!changeInfo.url) return;

    // If we navigated to blocked.html, stop tracking immediately
    if (changeInfo.url.startsWith(chrome.runtime.getURL("blocked.html"))) {
        activeDomain = null;
        activeStartMs = null;
        return;
    }

    // existing behavior: if this is the active tab, update active domain tracking
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab?.id === tabId) {
        await setActiveDomain(tabId, true);
        await enforceIfNeeded(tabId)
    }
});

// When window focus changes (pause timing if Chrome not focused)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        await flushTime();
        activeTabId = null;
        activeDomain = null;
        activeStartMs = null;
        return;
    }
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id != null) await setActiveDomain(tab.id, false);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTabId) {
        activeTabId = null;
        activeDomain = null;
        activeStartMs = null;
    }
});

