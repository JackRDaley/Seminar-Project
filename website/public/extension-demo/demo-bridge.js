(() => {
  const tabIds = ["tab1", "tab2", "tab3", "tab4"];
  window.__saturnDemoReset?.();

  function selectTab(index, notify = false) {
    const input = document.getElementById(tabIds[index]);
    if (!input) return;
    input.checked = true;
    if (notify) {
      window.parent?.postMessage(
        { type: "saturn-demo-tab-selected", tabIndex: index },
        "*",
      );
    }
  }

  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "saturn-demo-reset") {
      window.__saturnDemoReset?.();
      selectTab(0);
      window.parent?.postMessage({ type: "saturn-demo-ready" }, "*");
      return;
    }
    if (data.type !== "saturn-demo-tab") return;
    selectTab(Number(data.tabIndex) || 0);
  });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    window.__saturnDemoReset?.();
    selectTab(0);
    window.parent?.postMessage({ type: "saturn-demo-ready" }, "*");
  });

  document.addEventListener("change", (event) => {
    const index = tabIds.indexOf(event.target?.id);
    if (index >= 0) {
      selectTab(index, true);
    }
  });

  ["click", "focusin", "input", "keydown", "pointerdown"].forEach((eventName) => {
    document.addEventListener(
      eventName,
      () => {
        window.parent?.postMessage({ type: "saturn-demo-interaction" }, "*");
      },
      { capture: true },
    );
  });

  window.parent?.postMessage({ type: "saturn-demo-ready" }, "*");
})();
