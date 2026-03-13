const $ = (id) => document.getElementById(id);

const SETTINGS_KEY = "uiSettings";
const DEFAULT_SETTINGS = Object.freeze({
    defaultLimitMinutes: 60,
    use24HourTime: false
});

let currentSettings = { ...DEFAULT_SETTINGS };
let saveMessageTimer = null;
let latestActiveBlocks = [];
let activeCountdownTimer = null;
let popupRefreshTimer = null;
let popupRefreshInFlight = false;

function startActiveCountdownTicker() {
    if (activeCountdownTimer != null) return;
    activeCountdownTimer = setInterval(() => {
        renderActive(latestActiveBlocks);
    }, 1000);
}

function stopActiveCountdownTicker() {
    if (activeCountdownTimer == null) return;
    clearInterval(activeCountdownTimer);
    activeCountdownTimer = null;
}

function startPopupRefreshTicker() {
    if (popupRefreshTimer != null) return;
    popupRefreshTimer = setInterval(async () => {
        if (popupRefreshInFlight) return;
        popupRefreshInFlight = true;
        try {
            await chrome.runtime.sendMessage({ action: "flushActiveTimeNow" }).catch(() => null);
            await loadAll();
        } catch {
            // Ignore transient refresh errors in popup ticker.
        } finally {
            popupRefreshInFlight = false;
        }
    }, 1000);
}

function stopPopupRefreshTicker() {
    if (popupRefreshTimer == null) return;
    clearInterval(popupRefreshTimer);
    popupRefreshTimer = null;
}

function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function normalizeSettings(raw) {
    const defaultLimitMinutes = Number(raw?.defaultLimitMinutes);
    return {
        defaultLimitMinutes: Number.isFinite(defaultLimitMinutes) && defaultLimitMinutes > 0
            ? Math.min(1440, Math.floor(defaultLimitMinutes))
            : DEFAULT_SETTINGS.defaultLimitMinutes,
        use24HourTime: Boolean(raw?.use24HourTime)
    };
}

async function loadSettingsFromStorage() {
    const { [SETTINGS_KEY]: stored } = await chrome.storage.local.get([SETTINGS_KEY]);
    currentSettings = normalizeSettings(stored);
    return currentSettings;
}

async function saveSettingsToStorage(partialSettings) {
    const merged = normalizeSettings({ ...currentSettings, ...partialSettings });
    currentSettings = merged;
    await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
    return merged;
}

function formatTimeForDisplay(timeStr, use24Hour = currentSettings.use24HourTime) {
    const [hour, minute] = timeStr.split(':').map(Number);
    if (use24Hour) {
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

function parseTimeInput(timeStr, use24Hour = currentSettings.use24HourTime) {
    const trimmed = timeStr.trim();

    if (use24Hour) {
        const match24 = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
        if (!match24) return null;
        const hour = String(Number(match24[1])).padStart(2, "0");
        return `${hour}:${match24[2]}`;
    }
    
    // Check for AM/PM format: H:MM AM/PM or HH:MM AM/PM (space optional)
    const ampmRegex = /^(1[0-2]|0?[1-9]):([0-5][0-9]) ?(AM|PM)$/i;
    const match = trimmed.match(ampmRegex);
    if (match) {
        let hour = parseInt(match[1]);
        const minute = match[2];
        const ampm = match[3].toUpperCase();
        
        if (ampm === 'PM' && hour !== 12) {
            hour += 12;
        } else if (ampm === 'AM' && hour === 12) {
            hour = 0;
        }
        
        return `${hour.toString().padStart(2, '0')}:${minute}`;
    }
    
    return null; // Invalid format
}

function normalizeDomain(input) {
    let d = (input || "").trim().toLowerCase();
    d = d.replace(/^https?:\/\//, "");
    d = d.replace(/^www\./, "");
    d = d.split("/")[0];
    return d;
}

function getLimitSecondsFromConfig(cfg) {
    const fromSeconds = Number(cfg?.limitSeconds);
    if (Number.isFinite(fromSeconds) && fromSeconds > 0) {
        return Math.floor(fromSeconds);
    }

    const fromMinutes = Number(cfg?.limitMinutes);
    if (Number.isFinite(fromMinutes) && fromMinutes > 0) {
        return Math.floor(fromMinutes * 60);
    }

    return null;
}

function applyScheduleInputMode() {
    const use24 = currentSettings.use24HourTime;
    const startEl = $("startTime");
    const endEl = $("endTime");
    if (!startEl || !endEl) return;

    startEl.value = "";
    endEl.value = "";

    startEl.type = "text";
    endEl.type = "text";

    if (use24) {
        startEl.placeholder = "Start (9:00 or 09:00)";
        endEl.placeholder = "End (17:00)";
        startEl.title = "Use HH:MM (24-hour)";
        endEl.title = "Use HH:MM (24-hour)";
    } else {
        startEl.placeholder = "Start (9:00 AM)";
        endEl.placeholder = "End (5:00 PM)";
        startEl.title = "Use H:MM AM/PM";
        endEl.title = "Use H:MM AM/PM";
    }
}

function showSettingsSavedMessage() {
    const messageEl = $("settingsSavedMsg");
    if (!messageEl) return;

    messageEl.classList.add("is-visible");
    if (saveMessageTimer) clearTimeout(saveMessageTimer);
    saveMessageTimer = setTimeout(() => {
        messageEl.classList.remove("is-visible");
        saveMessageTimer = null;
    }, 1800);
}

function updateStatStrip(allStatsToday, blockedDomains) {
    const domains = Object.keys(allStatsToday || {});
    const totalMs = domains.reduce((s, d) => s + (allStatsToday[d]?.timeMs || 0), 0);
    const totalVisits = domains.reduce((s, d) => s + (allStatsToday[d]?.visits || 0), 0);
    const blockedCount = Object.keys(blockedDomains || {}).length;
    if ($("statScreenTime")) $("statScreenTime").textContent = formatTime(Math.round(totalMs / 1000));
    if ($("statVisits"))     $("statVisits").textContent     = String(totalVisits);
    if ($("statBlocked"))    $("statBlocked").textContent    = String(blockedCount);
}

async function loadAll() {
    const {
        blockedDomains = {},
        statsToday = {},
        allStatsToday = {},
        activeBlocks = [],
        scheduledBlocks = [],
        [SETTINGS_KEY]: storedSettings = DEFAULT_SETTINGS
    } = await chrome.storage.local.get(["blockedDomains", "statsToday", "allStatsToday", "activeBlocks", "scheduledBlocks", SETTINGS_KEY]);

    currentSettings = normalizeSettings(storedSettings);
    latestActiveBlocks = Array.isArray(activeBlocks) ? activeBlocks : [];

    updateStatStrip(allStatsToday, blockedDomains);
    renderActive(latestActiveBlocks);
    renderScheduled(scheduledBlocks, activeBlocks);
    renderRanking(blockedDomains, allStatsToday, "ranking", "timeSec", "Top websites by time");
    renderRanking(blockedDomains, allStatsToday, "rankingByVisits", "visits", "Top websites by visits");
    renderBlockList(blockedDomains, statsToday);
}

function renderActive(activeBlocks) {
    const list = $("activeList");
    const count = $("activeCount");

    const active = Array.isArray(activeBlocks) ? activeBlocks : [];
    count.textContent = String(active.length);

    if (active.length === 0) {
        list.classList.add("muted");
        list.textContent = "No active sessions.";
        return;
    }

    list.classList.remove("muted");
    list.innerHTML = "";

    active.forEach((s) => {
        const now = Date.now();
        const endsAt = s.endTime ? new Date(s.endTime) : null;
        const endsText = endsAt ? endsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
        const remainingSec = Math.max(0, Math.floor((s.endTime - now) / 1000));

        const div = document.createElement("div");
        div.className = "row";
        div.innerHTML = `
        <div class="row-main">
            <div class="row-title">${s.domain}</div>
            <div class="row-meta">Ends: ${endsText}</div>
        </div>
        <div class="row-right">
            ${remainingSec > 0 ? `<span class="timer">${formatTime(remainingSec)} left</span>` : ""}
            <button class="btn-ghost" data-domain="${s.domain}">Stop</button>
        </div>
        `;
        div.querySelector("button").addEventListener("click", async (e) => {
            const domain = e.currentTarget.getAttribute("data-domain");
            await stopActiveBlock(domain);
            await loadAll();
        });
        list.appendChild(div);
    });
}

async function stopActiveBlock(domain) {
    const { activeBlocks = [] } = await chrome.storage.local.get(["activeBlocks"]);
    const next = (activeBlocks || []).filter((s) => s.domain !== domain);
    await chrome.storage.local.set({ activeBlocks: next });
}

function renderScheduled(scheduledBlocks, activeBlocks = []) {
    const list = $("scheduledList");
    const count = $("scheduledCount");

    const scheduled = Array.isArray(scheduledBlocks) ? scheduledBlocks : [];
    const active = Array.isArray(activeBlocks) ? activeBlocks : [];
    count.textContent = String(scheduled.length);

    if (scheduled.length === 0) {
        list.classList.add("muted");
        list.textContent = "No scheduled sessions.";
        return;
    }

    list.classList.remove("muted");
    list.innerHTML = "";

    scheduled.forEach((s) => {
        const isActive = active.some((b) => b.domain === s.domain);
        const div = document.createElement("div");
        div.className = "row";
        div.innerHTML = `
        <div class="row-main">
            <div class="row-title">${s.domain}</div>
            <div class="row-meta">Daily: ${formatTimeForDisplay(s.startTime)} – ${formatTimeForDisplay(s.endTime)}</div>
        </div>
        <div class="row-right">
            ${isActive ? '<span class="tag tag-red">Live</span>' : ''}
            <button class="btn-danger" data-domain="${s.domain}" ${isActive ? "disabled title=\"Stop the active session before removing\"" : ""}>Cancel</button>
        </div>
        `;
        if (!isActive) {
            div.querySelector("button").addEventListener("click", async (e) => {
                const { scheduledBlocks = [] } = await chrome.storage.local.get(["scheduledBlocks"]);
                const next = scheduledBlocks.filter((b) => b.id !== s.id);
                await chrome.storage.local.set({ scheduledBlocks: next });
                chrome.alarms.clear(`startBlock_${s.id}`);
                chrome.alarms.clear(`endBlock_${s.id}`);
                await loadAll();
            });
        }
        list.appendChild(div);
    });
}

function renderRanking(blockedDomains, allStatsToday, elementId, sortBy, title) {
    const rank = $(elementId);
    const byVisits = sortBy === "visits";

    const allDomains = Object.keys(allStatsToday || {});
    if (allDomains.length === 0) {
        rank.classList.add("muted");
        rank.textContent = "No data yet.";
        return;
    }

    const rows = allDomains
        .map((domain) => {
            const st = allStatsToday?.[domain] || { timeMs: 0, visits: 0 };
            const timeSec = Math.round((st.timeMs || 0) / 1000);
            return { domain, timeSec, visits: st.visits || 0 };
        })
        .sort((a, b) => byVisits ? b.visits - a.visits : b.timeSec - a.timeSec)
        .slice(0, 3); // top 3

    const maxVal = rows.length > 0 ? (byVisits ? rows[0].visits : rows[0].timeSec) : 1;

    rank.classList.remove("muted");
    rank.innerHTML = "";

    rows.forEach((r, i) => {
        const metricValue = byVisits ? String(r.visits) : formatTime(r.timeSec);
        const mainVal = byVisits ? r.visits : r.timeSec;
        const pct = maxVal > 0 ? Math.round((mainVal / maxVal) * 100) : 0;
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze';
        const isBlocked = !!blockedDomains[r.domain];
        const div = document.createElement("div");
        div.className = "row row-ranking row-with-bar";
        div.innerHTML = `
        <div class="row-top">
            <div class="row-main-inline">
                <span class="rank-num ${rankClass}">${i + 1}</span>
                <div class="row-title">${r.domain}</div>
            </div>
            <div class="row-right">
                <span class="tag tag-cyan">${metricValue}</span>
            </div>
        </div>
        <div class="prog-wrap row-progress"><div class="prog-fill" style="width:${pct}%"></div></div>
        `;
        if (!isBlocked) {
            const addBtn = document.createElement("button");
            addBtn.className = "btn-ghost";
            addBtn.textContent = "+ Limit";
            addBtn.addEventListener("click", async () => {
                await addDomain(r.domain, currentSettings.defaultLimitMinutes * 60);
                await loadAll();
            });
            div.querySelector(".row-top .row-right").appendChild(addBtn);
        } else {
            const blockedSpan = document.createElement("span");
            blockedSpan.className = "tag tag-muted";
            blockedSpan.textContent = "Blocked";
            div.querySelector(".row-top .row-right").appendChild(blockedSpan);
        }
        rank.appendChild(div);
    });
}

function renderBlockList(blockedDomains, statsToday) {
    const list = $("blockList");
    const entries = Object.entries(blockedDomains || {});

    if (entries.length === 0) {
        list.classList.add("muted");
        list.textContent = "No blocked sites yet.";
        return;
    }

    list.classList.remove("muted");
    list.innerHTML = "";

    entries
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([domain, cfg]) => {
        const st = statsToday?.[domain] || { timeMs: 0, visits: 0 };
        const timeSec = Math.round((st.timeMs || 0) / 1000);

        const limitSec = getLimitSecondsFromConfig(cfg);
        const limitMin = limitSec ? Math.round(limitSec / 60) : null;
        const limitText = limitMin == null ? "—" : `${limitMin} min`;

        const displayTimeSec = (limitSec != null && timeSec >= limitSec) ? limitSec : timeSec;
        const pct = limitSec ? Math.min(100, Math.round((displayTimeSec / limitSec) * 100)) : 0;
        const pctTag = pct >= 90 ? 'tag-red' : pct >= 60 ? 'tag-cyan' : 'tag-green';

        const div = document.createElement("div");
        div.className = "row row-limit row-with-bar";
        div.innerHTML = `
            <div class="row-top">
                <div class="row-main">
                    <div class="row-title">${domain}</div>
                    <div class="row-meta">Limit: ${limitText} · Today: ${formatTime(displayTimeSec)} · ${st.visits || 0} visits</div>
                </div>
                <div class="row-right">
                    ${limitSec ? `<span class="tag ${pctTag}">${pct}%</span>` : ""}
                    <button class="btn-ghost" data-domain="${domain}" data-action="reset">Reset</button>
                    <button class="btn-danger" data-domain="${domain}" data-action="remove">Remove</button>
                </div>
            </div>
            ${limitSec ? `<div class="prog-wrap row-progress"><div class="prog-fill" style="width:${pct}%"></div></div>` : ""}
        `;
        div.querySelectorAll("button").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const d = e.currentTarget.getAttribute("data-domain");
                const action = e.currentTarget.getAttribute("data-action");
                if (action === "reset") {
                    await resetDomainStats(d);
                } else if (action === "remove") {
                    await removeDomain(d);
                }
                await loadAll();
            });
        });
        list.appendChild(div);
    });
}

async function removeDomain(domain) {
    const { blockedDomains = {}, statsToday = {}, activeBlocks = [], alertsSent = {} }
        = await chrome.storage.local.get(["blockedDomains", "statsToday", "activeBlocks", "alertsSent"]);
    const nextBlocked = { ...blockedDomains };
    delete nextBlocked[domain];

    const nextStats = { ...statsToday };
    delete nextStats[domain];

    const nextActive = (activeBlocks || []).filter((s) => s.domain !== domain);

    const nextAlerts = { ...alertsSent };
    delete nextAlerts[domain];

    await chrome.storage.local.set({
        blockedDomains: nextBlocked,
        statsToday: nextStats,
        activeBlocks: nextActive,
        alertsSent: nextAlerts
    });
}

async function resetDomainStats(domain) {
    const { statsToday = {}, alertsSent = {} } = await chrome.storage.local.get(["statsToday", "alertsSent"]);
    const nextStats = { ...statsToday };
    delete nextStats[domain];
    
    const nextAlerts = { ...alertsSent };
    delete nextAlerts[domain];
    
    await chrome.storage.local.set({ statsToday: nextStats, alertsSent: nextAlerts });
    
    // redirect the active tab to the domain if it's currently blocked on it
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab?.id != null) {
        const isBlockedPage = activeTab.url?.includes("blocked.html") && activeTab.url?.includes(encodeURIComponent(domain));
        if (isBlockedPage) {
            await chrome.tabs.update(activeTab.id, { url: `https://${domain}` });
        }
    }
}

async function addDomain(domain, limitSeconds) {
    const { blockedDomains = {}, alertsSent = {} } = await chrome.storage.local.get(["blockedDomains", "alertsSent"]);
    const next = { ...blockedDomains };
    next[domain] = { limitSeconds };
    
    // Reset alerts when limit is changed
    const nextAlerts = { ...alertsSent };
    delete nextAlerts[domain];
    
    await chrome.storage.local.set({ blockedDomains: next, alertsSent: nextAlerts });
}

document.addEventListener("DOMContentLoaded", async () => {
    startActiveCountdownTicker();
    startPopupRefreshTicker();

    await loadSettingsFromStorage();

    const defaultLimitEl = $("defaultLimitMinutes");
    const use24HourEl = $("use24HourTime");
    if (defaultLimitEl) defaultLimitEl.value = String(currentSettings.defaultLimitMinutes);
    if (use24HourEl) use24HourEl.checked = currentSettings.use24HourTime;
    applyScheduleInputMode();

    const statRangeSelect = document.getElementById("statRange");
    if (statRangeSelect) {
        statRangeSelect.addEventListener("change", () => {
            requestAnimationFrame(() => statRangeSelect.blur());
        });
    }

    $("settingsForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const parsedMinutes = Number(defaultLimitEl?.value);
        const defaultLimitMinutes = Number.isFinite(parsedMinutes) && parsedMinutes > 0
            ? Math.min(1440, Math.floor(parsedMinutes))
            : DEFAULT_SETTINGS.defaultLimitMinutes;

        const use24HourTime = Boolean(use24HourEl?.checked);
        await saveSettingsToStorage({ defaultLimitMinutes, use24HourTime });

        if (defaultLimitEl) defaultLimitEl.value = String(currentSettings.defaultLimitMinutes);
        if (use24HourEl) use24HourEl.checked = currentSettings.use24HourTime;
        applyScheduleInputMode();
        showSettingsSavedMessage();
        await loadAll();
    });

    $("addForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const domain = normalizeDomain($("domainInput").value);
        const rawLimitValue = $("limitInput").value.trim();
        const parsedMinutes = Number(rawLimitValue);
        const limitMinutes = rawLimitValue === "" ? currentSettings.defaultLimitMinutes : parsedMinutes;
        const limitSeconds = Math.floor(limitMinutes * 60);

        if (!domain) return;
        if (!Number.isFinite(limitSeconds) || limitSeconds <= 0) return;

        $("domainInput").value = "";
        $("limitInput").value = "";

        await addDomain(domain, limitSeconds);
        await loadAll();
    });

    // Scheduled form event listener
    $("scheduledForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const domain = normalizeDomain($("scheduledDomain").value);
        const startTimeInput = $("startTime").value.trim();
        const endTimeInput = $("endTime").value.trim();

        const startTime = parseTimeInput(startTimeInput, currentSettings.use24HourTime);
        const endTime = parseTimeInput(endTimeInput, currentSettings.use24HourTime);

        if (!domain || !startTime || !endTime) {
            if (currentSettings.use24HourTime) {
                alert("Please enter valid times in 24-hour format (e.g., 9:00, 09:00, 17:30)");
            } else {
                alert("Please enter valid times in H:MM AM/PM format (e.g., 9:00 AM, 2:30 PM)");
            }
            return;
        }

        await chrome.runtime.sendMessage({ action: 'addScheduledBlock', domain, startTime, endTime });
        $("scheduledDomain").value = "";
        $("startTime").value = "";
        $("endTime").value = "";
        await loadAll();
    });

    await loadAll();
});

window.addEventListener("unload", () => {
    stopActiveCountdownTicker();
    stopPopupRefreshTicker();
    if (saveMessageTimer) {
        clearTimeout(saveMessageTimer);
        saveMessageTimer = null;
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes[SETTINGS_KEY]) {
        currentSettings = normalizeSettings(changes[SETTINGS_KEY].newValue || DEFAULT_SETTINGS);
        const defaultLimitEl = $("defaultLimitMinutes");
        const use24HourEl = $("use24HourTime");
        if (defaultLimitEl) defaultLimitEl.value = String(currentSettings.defaultLimitMinutes);
        if (use24HourEl) use24HourEl.checked = currentSettings.use24HourTime;
        applyScheduleInputMode();
    }

    if (changes[SETTINGS_KEY] || changes.statsToday || changes.allStatsToday || changes.blockedDomains || changes.activeBlocks || changes.scheduledBlocks) {
        loadAll();
    }
});
