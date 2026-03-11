const $ = (id) => document.getElementById(id);

function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function formatTimeForDisplay(timeStr) {
    const [hour, minute] = timeStr.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

function parseTimeInput(timeStr) {
    const trimmed = timeStr.trim();
    
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

async function loadAll() {
    const { blockedDomains = {}, statsToday = {}, allStatsToday = {}, activeBlocks = [], scheduledBlocks = [] } =
        await chrome.storage.local.get(["blockedDomains", "statsToday", "allStatsToday", "activeBlocks", "scheduledBlocks"]);

    renderActive(activeBlocks);
    renderScheduled(scheduledBlocks);
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
        const remaining = remainingSec > 0 ? ` : ${formatTime(remainingSec)} left` : "";

        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
        <div>
            <strong>${s.domain}</strong>
            <div class="meta">Ends: ${endsText}${remaining}</div>
        </div>
        <button class="btn danger" data-domain="${s.domain}">Stop</button>
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

function renderScheduled(scheduledBlocks) {
    const list = $("scheduledList");
    const count = $("scheduledCount");

    const scheduled = Array.isArray(scheduledBlocks) ? scheduledBlocks : [];
    count.textContent = String(scheduled.length);

    if (scheduled.length === 0) {
        list.classList.add("muted");
        list.textContent = "No scheduled sessions.";
        return;
    }

    list.classList.remove("muted");
    list.innerHTML = "";

    scheduled.forEach((s) => {
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
        <div>
            <strong>${s.domain}</strong>
            <div class="meta">Daily: ${formatTimeForDisplay(s.startTime)} - ${formatTimeForDisplay(s.endTime)}</div>
        </div>
        <button class="btn danger" data-domain="${s.domain}">Cancel</button>
        `;
        div.querySelector("button").addEventListener("click", async (e) => {
            const { scheduledBlocks = [] } = await chrome.storage.local.get(["scheduledBlocks"]);
            const next = scheduledBlocks.filter((b) => b.id !== s.id);
            await chrome.storage.local.set({ scheduledBlocks: next });
            chrome.alarms.clear(`startBlock_${s.id}`);
            chrome.alarms.clear(`endBlock_${s.id}`);
            await loadAll();
        });
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

    rank.classList.remove("muted");
    rank.innerHTML = "";

    rows.forEach((r, i) => {
        const metricLabel = byVisits ? "Visits" : "Time";
        const metricValue = byVisits ? String(r.visits) : formatTime(r.timeSec);
        const meta = byVisits ? `${r.visits} visits • ${formatTime(r.timeSec)}` : `${formatTime(r.timeSec)} • ${r.visits} visits`;
        const isBlocked = !!blockedDomains[r.domain];
        const div = document.createElement("div");
        div.className = "item ranking-item";
        div.innerHTML = `
        <div class="ranking-main">
            <strong>${i + 1}. ${r.domain}</strong>
            <div class="meta">${meta}</div>
        </div>
        <div class="ranking-actions">
            <div class="metric-chip" aria-label="${metricLabel}">
                <span class="metric-label">${metricLabel}</span>
                <span class="metric-value">${metricValue}</span>
            </div>
        </div>
        `;
        if (!isBlocked) {
            const addBtn = document.createElement("button");
            addBtn.className = "btn-compact";
            addBtn.textContent = "Add";
            addBtn.addEventListener("click", async () => {
                await addDomain(r.domain, 3600); // default 60 min
                await loadAll();
            });
            div.querySelector(".ranking-actions").appendChild(addBtn);
        } else {
            const blockedSpan = document.createElement("span");
            blockedSpan.className = "blocked-indicator";
            blockedSpan.textContent = "Blocked";
            div.querySelector(".ranking-actions").appendChild(blockedSpan);
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

        const limitSec = cfg?.limitSeconds ?? null;
        const limitMin = limitSec ? Math.round(limitSec / 60) : null;
        const limitText = limitMin == null ? "—" : `${limitMin} min`;

        // Show exactly the limit if the site is currently blocked (time >= limit)
        const displayTimeSec = (limitSec != null && timeSec >= limitSec) ? limitSec : timeSec;

        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
            <div style="flex: 1; min-width: 0;">
            <strong>${domain}</strong>
            <div class="meta">Limit: ${limitText} • Today: ${formatTime(displayTimeSec)} • ${st.visits || 0} visits</div>
            </div>
            <div style="display: flex; gap: 4px; flex-shrink: 0;">
            <button class="btn-compact" data-domain="${domain}" data-action="reset">Reset</button>
            <button class="btn-compact danger" data-domain="${domain}" data-action="remove">Remove</button>
            </div>
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
    setInterval(loadAll, 2000);

    $("addForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const domain = normalizeDomain($("domainInput").value);
        const limit = Number($("limitInput").value);

        if (!domain) return;
        if (!Number.isFinite(limit) || limit <= 0) return;

        $("domainInput").value = "";
        $("limitInput").value = "";

        await addDomain(domain, limit * 60);
        await loadAll();
    });

    // Scheduled form event listener
    $("scheduledForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const domain = normalizeDomain($("scheduledDomain").value);
        const startTimeInput = $("startTime").value.trim();
        const endTimeInput = $("endTime").value.trim();

        const startTime = parseTimeInput(startTimeInput);
        const endTime = parseTimeInput(endTimeInput);

        if (!domain || !startTime || !endTime) {
            alert("Please enter valid times in H:MM AM/PM format (e.g., 9:00 AM, 2:30 PM)");
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

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if ( changes.statsToday || changes.allStatsToday || changes.blockedDomains || changes.activeBlocks || changes.scheduledBlocks ) {
        loadAll();
    }
});
