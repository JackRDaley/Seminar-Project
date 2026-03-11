// blockedDomains: { [domain]: { limitMinutes: number } }
// statsToday: { [domain]: { timeSec: number, visits: number } }
// activeBlocks: [{ domain: string, endsAt: number|null, remainingSec?: number }]

const KEYS = {
    blockedDomains: "blockedDomains", // { [domain]: { limitMinutes } }
    statsToday: "statsToday",         // { [domain]: { timeSec, visits, lastSeenDay } }
    allStatsToday: "allStatsToday",   // { [domain]: { timeMs, visits } } for all websites
    dayKey: "statsDayKey",            // "YYYY-MM-DD"
    enforceIntervalSec: "enforceIntervalSec", // optional: number of seconds between enforce checks
    alertsSent: "alertsSent",          // { [domain]: Set of alert thresholds already notified ("75", "90") }
    scheduledBlocks: "scheduledBlocks", // [{ domain: string, startTime: number, endTime: number }]
    activeBlocks: "activeBlocks"       // [{ domain: string, startTime: number, endTime: number }]
};

let activeTabId = null;
let activeDomain = null;
let activeStartMs = null;
let dynamicRuleSync = Promise.resolve();

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
        await chrome.storage.local.set({ [KEYS.statsToday]: {}, [KEYS.allStatsToday]: {}, [KEYS.dayKey]: today });
    }
}

async function addTime(domain, deltaMs) {
    if (!domain || deltaMs <= 0) return;
    await ensureDayReset();

    const { blockedDomains = {}, [KEYS.statsToday]: stats = {}, [KEYS.allStatsToday]: allStats = {} } =
        await chrome.storage.local.get([KEYS.blockedDomains, KEYS.statsToday, KEYS.allStatsToday]);

    const cur = stats[domain] || { timeMs: 0, visits: 0 };
    cur.timeMs = (cur.timeMs || 0) + deltaMs;
    stats[domain] = cur;

    const allCur = allStats[domain] || { timeMs: 0, visits: 0 };
    allCur.timeMs = (allCur.timeMs || 0) + deltaMs;
    allStats[domain] = allCur;

    await chrome.storage.local.set({ [KEYS.statsToday]: stats, [KEYS.allStatsToday]: allStats });

    // Check for alerts after updating time
    await checkAndSendAlerts(domain, blockedDomains, stats);

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

    const { [KEYS.statsToday]: stats = {}, [KEYS.allStatsToday]: allStats = {} } = await chrome.storage.local.get([KEYS.statsToday, KEYS.allStatsToday]);
    const cur = stats[domain] || { timeMs: 0, visits: 0 };
    cur.visits = (cur.visits || 0) + 1;
    stats[domain] = cur;

    const allCur = allStats[domain] || { timeMs: 0, visits: 0 };
    allCur.visits = (allCur.visits || 0) + 1;
    allStats[domain] = allCur;

    await chrome.storage.local.set({ [KEYS.statsToday]: stats, [KEYS.allStatsToday]: allStats });
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

async function redirectOpenTabsForDomains(domains) {
    const domainSet = new Set(domains.filter(Boolean));
    if (domainSet.size === 0) return;

    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(async (tab) => {
        if (!tab.id || !tab.url) return;
        if (tab.url.startsWith(chrome.runtime.getURL("blocked.html"))) return;

        const domain = domainFromUrl(tab.url);
        if (!domainSet.has(domain)) return;

        await chrome.tabs.update(tab.id, { url: blockedUrl(domain) }).catch(() => {});
    }));
}

function getNextTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    if (target <= now) {
        target.setDate(target.getDate() + 1);
    }
    return target.getTime();
}

function getTodayTime(timeStr, baseDate = new Date()) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const target = new Date(baseDate);
    target.setHours(hours, minutes, 0, 0);
    return target.getTime();
}

function isScheduleActiveNow(block, now = Date.now()) {
    const startMs = getTodayTime(block.startTime);
    const endMs = getTodayTime(block.endTime);

    if (startMs === endMs) return true;
    if (startMs < endMs) return now >= startMs && now < endMs;
    return now >= startMs || now < endMs;
}

function stableRuleIdForDomain(domain) {
    let hash = 0;
    for (let index = 0; index < domain.length; index += 1) {
        hash = ((hash * 31) + domain.charCodeAt(index)) % 1000000;
    }
    return hash + 1;
}

async function checkAndSendAlerts(domain, blockedDomains, statsToday) {
    if (!isBlockedDomain(domain, blockedDomains)) return;

    const limitMs = limitMsFor(domain, blockedDomains);
    const usedMs = statsToday?.[domain]?.timeMs || 0;

    if (limitMs == null || usedMs < limitMs * 0.75) return; // Only alert if at 75%+

    const { [KEYS.alertsSent]: alertsSent = {} } = await chrome.storage.local.get([KEYS.alertsSent]);
    let sent = alertsSent[domain] || {};

    const pct75 = usedMs >= limitMs * 0.75;
    const pct90 = usedMs >= limitMs * 0.9;

    const remainingMs = Math.max(0, limitMs - usedMs);
    const remainingSec = Math.round(remainingMs / 1000);

    if (pct90 && !sent["90"]) {
        chrome.notifications.create({
            type: "basic",
            iconUrl: chrome.runtime.getURL("icon.png"),
            title: `90% of limit used: ${domain}`,
            message: `You have ~${formatTimeSec(remainingSec)} left today.`,
            priority: 2
        });
        sent["90"] = true;
    } else if (pct75 && !sent["75"]) {
        chrome.notifications.create({
            type: "basic",
            iconUrl: chrome.runtime.getURL("icon.png"),
            title: `75% of limit used: ${domain}`,
            message: `You have ~${formatTimeSec(remainingSec)} left today.`,
            priority: 1
        });
        sent["75"] = true;
    }

    alertsSent[domain] = sent;
    await chrome.storage.local.set({ [KEYS.alertsSent]: alertsSent });
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

function formatTimeSec(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

async function flushAllStats() {
    const { [KEYS.allStatsToday]: allStats = {}, [KEYS.blockedDomains]: blockedDomains = {} } = 
        await chrome.storage.local.get([KEYS.allStatsToday, KEYS.blockedDomains]);

    const TOP_N = 3;

    // Build a normalized list once, then retain only ranking-relevant entries.
    const allDomains = Object.entries(allStats).map(([domain, stats]) => ({
        domain,
        timeMs: stats.timeMs || 0,
        visits: stats.visits || 0
    }));

    const topByTime = [...allDomains]
        .sort((a, b) => b.timeMs - a.timeMs)
        .slice(0, TOP_N);

    const topByVisits = [...allDomains]
        .sort((a, b) => b.visits - a.visits)
        .slice(0, TOP_N);

    // Always include blocked domains
    const blockedDomainList = Object.keys(blockedDomains);
    const blockedEntries = allDomains.filter((d) => blockedDomainList.includes(d.domain));

    // Keep union of top-by-time, top-by-visits, and blocked domains.
    const combined = [...topByTime, ...topByVisits, ...blockedEntries].reduce((acc, item) => {
        if (!acc[item.domain]) {
            acc[item.domain] = { timeMs: item.timeMs, visits: item.visits };
        }
        return acc;
    }, {});

    // Update with the combined list
    await chrome.storage.local.set({ [KEYS.allStatsToday]: combined });
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

async function createEnforceAlarm() {
    const { [KEYS.enforceIntervalSec]: stored = 2 } = await chrome.storage.local.get([KEYS.enforceIntervalSec]);
    let sec = Number(stored);
    if (!Number.isFinite(sec) || sec <= 0) sec = 2;
    const whenMs = Date.now() + sec * 1000;
    // create a one-shot alarm; onAlarm will reschedule the next one
    chrome.alarms.create("enforce", { when: whenMs });
}

async function createFlushAlarm() {
    const whenMs = Date.now() + 60 * 1000; // every minute
    chrome.alarms.create("flush", { when: whenMs });
}

// When user switches tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    await setActiveDomain(tabId, true)
    await enforceIfNeeded(tabId); // Check new tab for enforcement
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

    // Check for enforcement on this tab
    await enforceIfNeeded(tabId);

    // existing behavior: if this is the active tab, update active domain tracking
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab?.id === tabId) {
        await setActiveDomain(tabId, true);
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

function buildRulesFromActiveBlocks(activeBlocks) {
    const uniqueDomains = [...new Set(activeBlocks.map((block) => block.domain).filter(Boolean))];
    return uniqueDomains.map((domain) => ({
        id: stableRuleIdForDomain(domain),
        priority: 1,
        action: {
            type: "redirect",
            redirect: {
                extensionPath: `/blocked.html?d=${encodeURIComponent(domain)}`
            }
        },
        condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: ["main_frame"]
        }
    }));
}

async function syncBlockRulesNow() {
    const { activeBlocks = [] } = await chrome.storage.local.get([KEYS.activeBlocks]);
    const rules = buildRulesFromActiveBlocks(activeBlocks);
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map((rule) => rule.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [],
        removeRuleIds: existingRuleIds
    });

    if (rules.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules,
            removeRuleIds: []
        });
    }
}

function updateBlockRules() {
    dynamicRuleSync = dynamicRuleSync
        .catch(() => {})
        .then(() => syncBlockRulesNow());
    return dynamicRuleSync;
}

// Schedule alarms for scheduled blocks
async function scheduleAlarms() {
    const { [KEYS.scheduledBlocks]: scheduled = [] } = await chrome.storage.local.get([KEYS.scheduledBlocks]);
    scheduled.forEach((block) => {
        const startMs = getNextTime(block.startTime);
        const endMs = getNextTime(block.endTime);
        chrome.alarms.create(`startBlock_${block.id}`, { when: startMs });
        chrome.alarms.create(`endBlock_${block.id}`, { when: endMs });
    });
}

async function activateScheduledBlock(id) {
    const { [KEYS.scheduledBlocks]: scheduled = [], [KEYS.activeBlocks]: activeBlocks = [] } =
        await chrome.storage.local.get([KEYS.scheduledBlocks, KEYS.activeBlocks]);
    const block = scheduled.find((entry) => entry.id === id);
    if (!block) return;

    const nextActiveBlocks = activeBlocks.filter((entry) => entry.id !== id);
    nextActiveBlocks.push({
        id,
        domain: block.domain,
        startTime: Date.now(),
        endTime: getNextTime(block.endTime)
    });

    await chrome.storage.local.set({ [KEYS.activeBlocks]: nextActiveBlocks });
    await updateBlockRules();
    await redirectOpenTabsForDomains([block.domain]);
    chrome.alarms.create(`startBlock_${id}`, { when: getNextTime(block.startTime) });
}

async function deactivateScheduledBlock(id) {
    const { [KEYS.scheduledBlocks]: scheduled = [], [KEYS.activeBlocks]: activeBlocks = [] } =
        await chrome.storage.local.get([KEYS.scheduledBlocks, KEYS.activeBlocks]);
    const block = scheduled.find((entry) => entry.id === id);
    const nextActiveBlocks = activeBlocks.filter((entry) => entry.id !== id);

    await chrome.storage.local.set({ [KEYS.activeBlocks]: nextActiveBlocks });
    await updateBlockRules();

    if (block) {
        chrome.alarms.create(`endBlock_${id}`, { when: getNextTime(block.endTime) });
    }
}

async function reconcileActiveScheduledBlocks() {
    const { [KEYS.scheduledBlocks]: scheduled = [] } = await chrome.storage.local.get([KEYS.scheduledBlocks]);
    const nextActiveBlocks = scheduled
        .filter((block) => isScheduleActiveNow(block))
        .map((block) => ({
            id: block.id,
            domain: block.domain,
            startTime: getTodayTime(block.startTime),
            endTime: getNextTime(block.endTime)
        }));

    await chrome.storage.local.set({ [KEYS.activeBlocks]: nextActiveBlocks });
    await updateBlockRules();
    await redirectOpenTabsForDomains(nextActiveBlocks.map((block) => block.domain));
}

async function initializeExtension() {
    await initActive();
    await createEnforceAlarm();
    await createFlushAlarm();
    await scheduleAlarms();
    await reconcileActiveScheduledBlocks();
}

chrome.runtime.onStartup?.addListener(() => {
    initializeExtension().catch(console.error);
});

chrome.runtime.onInstalled.addListener(() => {
    initializeExtension().catch(console.error);
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "enforce") {
        await flushTime();
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab?.id != null) await enforceIfNeeded(activeTab.id);
        await createEnforceAlarm();
    } else if (alarm.name === "flush") {
        await flushAllStats();
        await createFlushAlarm();
    } else if (alarm.name.startsWith('startBlock_')) {
        const id = parseInt(alarm.name.split('_')[1], 10);
        await activateScheduledBlock(id);
    } else if (alarm.name.startsWith('endBlock_')) {
        const id = parseInt(alarm.name.split('_')[1], 10);
        await deactivateScheduledBlock(id);
    }
});

async function runSelfTest() {
    const checks = [];

    try {
        const manifest = chrome.runtime.getManifest();
        const resources = manifest.web_accessible_resources || [];
        const hasBlockedPage = resources.some((entry) =>
            Array.isArray(entry.resources) && entry.resources.includes("blocked.html")
        );

        checks.push({
            name: "blocked page is web accessible",
            pass: hasBlockedPage,
            details: hasBlockedPage ? "blocked.html found in manifest" : "blocked.html missing from web_accessible_resources"
        });
    } catch (error) {
        checks.push({
            name: "blocked page is web accessible",
            pass: false,
            details: String(error)
        });
    }

    try {
        await updateBlockRules();
        const rulesAfterFirstSync = await chrome.declarativeNetRequest.getDynamicRules();

        await updateBlockRules();
        const rulesAfterSecondSync = await chrome.declarativeNetRequest.getDynamicRules();

        const idsOne = rulesAfterFirstSync.map((rule) => rule.id).sort((a, b) => a - b);
        const idsTwo = rulesAfterSecondSync.map((rule) => rule.id).sort((a, b) => a - b);
        const stableIds = JSON.stringify(idsOne) === JSON.stringify(idsTwo);

        checks.push({
            name: "dynamic rule sync is idempotent",
            pass: stableIds,
            details: stableIds ? `stable IDs: [${idsTwo.join(", ")}]` : "rule IDs changed between identical sync passes"
        });

        const uniqueCount = new Set(idsTwo).size;
        checks.push({
            name: "dynamic rule IDs are unique",
            pass: uniqueCount === idsTwo.length,
            details: uniqueCount === idsTwo.length ? `unique IDs: ${uniqueCount}` : "duplicate rule IDs detected"
        });

        const allRedirectRules = rulesAfterSecondSync.every((rule) => rule.action?.type === "redirect");
        checks.push({
            name: "scheduled rules use redirect action",
            pass: allRedirectRules,
            details: allRedirectRules ? "all dynamic rules are redirect rules" : "one or more dynamic rules are not redirect"
        });
    } catch (error) {
        checks.push({
            name: "dynamic rule validation",
            pass: false,
            details: String(error)
        });
    }

    return {
        ok: checks.every((check) => check.pass),
        checkedAt: new Date().toISOString(),
        checks
    };
}

// Expose a direct debug hook for the service worker DevTools console.
self.runSelfTest = runSelfTest;

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || typeof request !== "object") return;

    if (request.action === 'addScheduledBlock') {
        const { domain, startTime, endTime } = request;
        chrome.storage.local.get([KEYS.scheduledBlocks], async (data) => {
            const scheduled = data[KEYS.scheduledBlocks] || [];
            const id = Date.now();
            scheduled.push({ id, domain, startTime, endTime });
            await chrome.storage.local.set({ [KEYS.scheduledBlocks]: scheduled });
            // Set alarms for next occurrences
            const startMs = getNextTime(startTime);
            const endMs = getNextTime(endTime);
            chrome.alarms.create(`startBlock_${id}`, { when: startMs });
            chrome.alarms.create(`endBlock_${id}`, { when: endMs });

            if (isScheduleActiveNow({ startTime, endTime })) {
                await activateScheduledBlock(id);
            }

            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === "runSelfTest") {
        (async () => {
            const result = await runSelfTest();
            sendResponse(result);
        })();
        return true;
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.activeBlocks) {
        updateBlockRules();
    }
});

async function logAllDynamicRules() {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log("Current Dynamic Rules:", rules);
}

// Call logAllDynamicRules to debug and print all current dynamic rules
logAllDynamicRules();

