// blockedDomains: { [domain]: { limitMinutes: number } }
// statsToday: { [domain]: { timeSec: number, visits: number } }
// activeBlocks: [{ domain: string, endsAt: number|null, remainingSec?: number }]

const KEYS = {
    blockedDomains: "blockedDomains", // { [domain]: { limitMinutes } }
    statsToday: "statsToday",         // { [domain]: { timeSec, visits, lastSeenDay } }
    dayKey: "statsDayKey"             // "YYYY-MM-DD"
};

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
        if (limitMs != null && cur.timeMs >= limitMs) {
        // kick the user off the site (active tab only)
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.id != null) {
            await chrome.tabs.update(tab.id, { url: blockedUrl(domain) }).catch(() => {});
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
    const min = blockedDomains?.[domain]?.limitMinutes;
    if (!Number.isFinite(min) || min <= 0) return null;
    return min * 60 * 1000;
}

function blockedUrl(domain) {
    return chrome.runtime.getURL(`blocked.html?d=${encodeURIComponent(domain)}`);
}

async function flushTime() {
    if (!activeDomain || !activeStartMs) return;
    const deltaMs = Date.now() - activeStartMs;
    activeStartMs = Date.now(); // reset start for continued tracking
    if (deltaMs > 0) await addTime(activeDomain, deltaMs);
}

async function setActiveDomain(tabId, countVisit = false) {
    await flushTime();

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
chrome.runtime.onStartup?.addListener?.(initActive);
chrome.runtime.onInstalled.addListener(initActive);

// When user switches tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    await setActiveDomain(tabId, true);
});

// When the active tab’s URL changes (navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (!changeInfo.url) return;

    const d = domainFromUrl(changeInfo.url);
    if (!d) return;

    const { blockedDomains = {}, [KEYS.statsToday]: stats = {} } =
        await chrome.storage.local.get([KEYS.blockedDomains, KEYS.statsToday]);

    if (isBlockedDomain(d, blockedDomains)) {
        const limitMs = limitMsFor(d, blockedDomains);
        const usedMs = stats?.[d]?.timeMs || 0;

        if (limitMs != null && usedMs >= limitMs) {
            // already out of time → keep them blocked
            await chrome.tabs.update(tabId, { url: blockedUrl(d) }).catch(() => {});
            return;
        }
    }

    // existing behavior: if this is the active tab, update active domain tracking
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === tabId) await setActiveDomain(tabId);
});

// When window focus changes (pause timing if Chrome not focused)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        await flushTime();
        activeDomain = null;
        activeStartMs = null;
        return;
    }
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id != null) await setActiveDomain(tab.id, false);
});


