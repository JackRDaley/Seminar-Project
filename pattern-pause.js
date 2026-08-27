(function initPatternPausePage() {
  "use strict";

  const params = new URLSearchParams(location.search);
  const engine = globalThis.StmPatternPauses || {};
  const domain = engine.normalizeDomain?.(params.get("d")) || "";
  const ruleId = String(params.get("rid") || "");
  const original = String(params.get("u") || "");
  const hasExtensionRuntime = Boolean(
    globalThis.chrome?.runtime?.id && globalThis.chrome?.runtime?.sendMessage,
  );
  let context = null;

  const $ = (id) => document.getElementById(id);

  function send(action, payload = {}) {
    if (!hasExtensionRuntime) {
      return Promise.resolve({ success: false, error: "Extension runtime unavailable." });
    }
    return chrome.runtime
      .sendMessage({ action, ...payload })
      .catch((error) => ({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }));
  }

  function clock(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return "";
    return new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function setFeedback(message = "", isError = false) {
    const feedback = $("feedback");
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-error", Boolean(message && isError));
  }

  function setBusy(busy) {
    ["continueBtn", "closeTabBtn", "disableBtn"].forEach((id) => {
      const button = $(id);
      if (button) button.disabled = Boolean(busy);
    });
  }

  function safeRedirect(url) {
    const candidate = String(url || "");
    try {
      const parsed = new URL(candidate);
      if (!["http:", "https:"].includes(parsed.protocol)) return false;
      if (engine.normalizeDomain?.(parsed.hostname) !== domain) return false;
      location.replace(parsed.href);
      return true;
    } catch {
      return false;
    }
  }

  function render(nextContext) {
    context = nextContext;
    const label = engine.domainLabel?.(domain) || domain || "This site";
    const evidence = nextContext?.evidence || {};
    const rule = nextContext?.rule || {};
    const visits = Math.max(0, Number(evidence.visitCount || 0));
    const newTabs = Math.max(0, Number(evidence.newTabCount || 0));
    const returns = Math.max(
      0,
      Number(evidence.interspersedReturnCount || 0) +
        Number(evidence.returnAfterCloseCount || 0),
    );
    const windowMinutes = Math.max(
      1,
      Number(evidence.observedWindowMinutes || rule.windowMinutes || 30),
    );
    const timeline = Array.isArray(evidence.timeline) ? evidence.timeline : [];
    const firstAt = Number(evidence.firstAt || timeline[0]?.timestamp || 0);
    const lastAt = Number(
      evidence.lastAt || timeline[timeline.length - 1]?.timestamp || 0,
    );
    const returnDelay =
      firstAt && lastAt
        ? Math.max(1, Math.round((lastAt - firstAt) / 60000))
        : Math.max(1, Math.round(windowMinutes / 2));

    document.title = `${label} showed up again · Saturn`;
    $("pauseTitle").textContent = `${label} showed up again.`;
    $("pauseLead").textContent =
      "Saturn noticed a repeated return—not a limit you set.";
    $("evidenceCopy").textContent = `${label} opened ${visits} ${
      visits === 1 ? "time" : "times"
    } in ${windowMinutes} minutes. ${newTabs} ${
      newTabs === 1 ? "visit was" : "visits were"
    } from a new tab${returns ? `, with ${returns} repeated ${returns === 1 ? "return" : "returns"}` : ""}.`;
    $("siteInitial").textContent = label.charAt(0).toUpperCase() || "S";
    $("sequenceSiteLabel").textContent = label;
    $("sequenceStartTime").textContent = clock(firstAt) || "earlier";
    $("sequenceReturnTime").textContent = clock(lastAt) || "just now";
    $("returnDelay").textContent = `+${returnDelay} min`;
    $("ruleMode").textContent =
      rule.mode === "ongoing"
        ? "Pattern pause · Ongoing"
        : "Pattern pause · Today only";
    $("continueBtn").firstChild.textContent = `Continue to ${label} `;
  }

  function localPreviewContext() {
    const now = Date.now();
    return {
      success: true,
      rule: {
        id: ruleId || `pattern:${domain}`,
        domain,
        mode: "today",
        windowMinutes: 30,
      },
      evidence: {
        domain,
        visitCount: 7,
        newTabCount: 4,
        interspersedReturnCount: 2,
        returnAfterCloseCount: 1,
        observedWindowMinutes: 24,
        firstAt: now - 24 * 60 * 1000,
        lastAt: now,
      },
      original,
    };
  }

  async function load() {
    if (!engine.isValidDomain?.(domain)) {
      $("pauseTitle").textContent = "This pattern pause is unavailable.";
      $("pauseLead").textContent = "The site information was missing or invalid.";
      setBusy(true);
      setFeedback("Close this tab and try again from Saturn.", true);
      globalThis.__patternPauseReady = true;
      return;
    }

    const response = hasExtensionRuntime
      ? await send("getPatternPauseContext", { domain, ruleId, original })
      : localPreviewContext();
    if (!response?.success) {
      $("pauseTitle").textContent = "This pattern pause has ended.";
      $("pauseLead").textContent =
        "The pattern may have been turned off or expired at midnight.";
      setBusy(true);
      $("closeTabBtn").disabled = false;
      setFeedback(response?.error || "No active pattern pause was found.", true);
      globalThis.__patternPauseReady = true;
      return;
    }

    render(response);
    globalThis.__patternPauseReady = true;
  }

  async function continueToSite() {
    setBusy(true);
    setFeedback("Opening with a temporary one-tab bypass…");
    const response = await send("continuePatternPause", {
      domain,
      ruleId,
      original: context?.original || original,
    });
    if (response?.success && safeRedirect(response.redirectUrl)) return;
    setBusy(false);
    setFeedback(response?.error || "Saturn couldn't continue to this site.", true);
  }

  async function closeTab() {
    setBusy(true);
    setFeedback("Closing this tab…");
    if (!hasExtensionRuntime) {
      window.close();
      setBusy(false);
      return;
    }
    const response = await send("closePatternPauseTab", { domain, ruleId });
    if (response?.success) {
      window.close();
      return;
    }
    setBusy(false);
    setFeedback(response?.error || "Saturn couldn't close this tab.", true);
  }

  async function disablePattern() {
    setBusy(true);
    setFeedback("Turning off this pattern pause…");
    const response = await send("disablePatternPause", {
      domain,
      ruleId,
      original: context?.original || original,
    });
    if (response?.success && safeRedirect(response.redirectUrl)) return;
    setBusy(false);
    setFeedback(response?.error || "Saturn couldn't turn off this pause.", true);
  }

  $("continueBtn")?.addEventListener("click", continueToSite);
  $("closeTabBtn")?.addEventListener("click", closeTab);
  $("disableBtn")?.addEventListener("click", disablePattern);
  load();
})();
