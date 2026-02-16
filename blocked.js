const params = new URLSearchParams(location.search);
const d = params.get("d") || "this site";
document.getElementById("domain").textContent = d;

document.getElementById("goBackBtn").addEventListener("click", async () => {
    // Reset stats for this domain and redirect to it
    const { statsToday = {} } = await chrome.storage.local.get(["statsToday"]);
    const nextStats = { ...statsToday };
    delete nextStats[d];
    await chrome.storage.local.set({ statsToday: nextStats });
    
    // Redirect to the domain
    window.location.href = `https://${d}`;
});

document.getElementById("closeTabBtn").addEventListener("click", async () => {
    // Close the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
        chrome.tabs.remove(tab.id);
    }
});
