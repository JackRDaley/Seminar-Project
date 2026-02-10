// blockedDomains: { [domain]: { limitMinutes: number } }
// statsToday: { [domain]: { timeSec: number, visits: number } }
// activeBlocks: [{ domain: string, endsAt: number|null, remainingSec?: number }]

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

function normalizeDomain(input) {
    let d = (input || "").trim().toLowerCase();
    d = d.replace(/^https?:\/\//, "");
    d = d.replace(/^www\./, "");
    d = d.split("/")[0];
    return d;
}

function setDateTime() {
    const now = new Date();
    const date = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    $("datetime").textContent = `${date} • ${time}`;
}

async function loadAll() {
    setDateTime();

    const { blockedDomains = {}, statsToday = {}, activeBlocks = [] } =
        await chrome.storage.local.get(["blockedDomains", "statsToday", "activeBlocks"]);

    renderActive(activeBlocks);
    renderRanking(blockedDomains, statsToday);
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
        const endsAt = s.endsAt ? new Date(s.endsAt) : null;
        const endsText = endsAt ? endsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
        const remaining = typeof s.remainingSec === "number" ? ` : ${formatTime(s.remainingSec)} left` : "";

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
    // Option A: purely popup-side: remove from activeBlocks
    const { activeBlocks = [] } = await chrome.storage.local.get(["activeBlocks"]);
    const next = (activeBlocks || []).filter((s) => s.domain !== domain);
    await chrome.storage.local.set({ activeBlocks: next });

    // Option B (better): notify background.js to stop timers, overlays, etc.
    // chrome.runtime.sendMessage({ type: "STOP_BLOCK", domain });
}

function renderRanking(blockedDomains, statsToday) {
    const rank = $("ranking");

    const blocked = Object.keys(blockedDomains || {});
    if (blocked.length === 0) {
        rank.classList.add("muted");
        rank.textContent = "Add sites to your block list to see rankings.";
        return;
    }

    const rows = blocked
        .map((domain) => {
        const st = statsToday?.[domain] || { timeSec: 0, visits: 0 };
        return { domain, timeSec: st.timeSec || 0, visits: st.visits || 0 };
        })
        .sort((a, b) => b.timeSec - a.timeSec);

    rank.classList.remove("muted");
    rank.innerHTML = "";

    rows.forEach((r, i) => {
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
        <div>
            <strong>${i + 1}. ${r.domain}</strong>
            <div class="meta">${formatTime(r.timeSec)} • ${r.visits} visits</div>
        </div>
        <div class="pill">${formatTime(r.timeSec)}</div>
        `;
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
        const st = statsToday?.[domain] || { timeSec: 0, visits: 0 };
        const limitMin = cfg?.limitMinutes ?? "—";

        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
            <div>
            <strong>${domain}</strong>
            <div class="meta">Limit: ${limitMin} min • Today: ${formatTime(st.timeSec || 0)} • ${st.visits || 0} visits</div>
            </div>
            <button class="btn danger" data-domain="${domain}">Remove</button>
        `;
        div.querySelector("button").addEventListener("click", async (e) => {
            const d = e.currentTarget.getAttribute("data-domain");
            await removeDomain(d);
            await loadAll();
        });
        list.appendChild(div);
    });
}

async function removeDomain(domain) {
    const { blockedDomains = {} } = await chrome.storage.local.get(["blockedDomains"]);
    const next = { ...blockedDomains };
    delete next[domain];
    await chrome.storage.local.set({ blockedDomains: next });

    // Optional: tell background to stop tracking/blocking this domain
    // chrome.runtime.sendMessage({ type: "UNBLOCK_DOMAIN", domain });
}

async function addDomain(domain, limitMinutes) {
    const { blockedDomains = {} } = await chrome.storage.local.get(["blockedDomains"]);
    const next = { ...blockedDomains };
    next[domain] = { limitMinutes };
    await chrome.storage.local.set({ blockedDomains: next });

    // Optional: tell background to initialize tracking
    // chrome.runtime.sendMessage({ type: "BLOCK_DOMAIN", domain, limitMinutes });
}

document.addEventListener("DOMContentLoaded", async () => {
    setDateTime();
    setInterval(setDateTime, 1000 * 30);

    $("refreshBtn").addEventListener("click", loadAll);

    $("addForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const domain = normalizeDomain($("domainInput").value);
        const limit = Number($("limitInput").value);

        if (!domain) return;
        if (!Number.isFinite(limit) || limit <= 0) return;

        $("domainInput").value = "";
        $("limitInput").value = "";

        await addDomain(domain, limit);
        await loadAll();
    });

    await loadAll();
});
