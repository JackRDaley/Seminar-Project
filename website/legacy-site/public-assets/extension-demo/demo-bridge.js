(() => {
  const tabIds = ["tab1", "tab2", "tab3", "tab4"];
  const parentOrigin = window.location.origin;
  window.__saturnDemoReset?.();

  function notifyParent(message) {
    window.parent?.postMessage(message, parentOrigin);
  }

  function selectTab(index, notify = false) {
    const input = document.getElementById(tabIds[index]);
    if (!input) return;
    input.checked = true;
    if (notify) {
      notifyParent({ type: "saturn-demo-tab-selected", tabIndex: index });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== parentOrigin || event.source !== window.parent) return;
    const data = event.data || {};
    if (data.type === "saturn-demo-reset") {
      window.__saturnDemoReset?.();
      selectTab(0);
      notifyParent({ type: "saturn-demo-ready" });
      return;
    }
    if (data.type !== "saturn-demo-tab") return;
    const tabIndex = Number(data.tabIndex);
    if (
      !Number.isInteger(tabIndex) ||
      tabIndex < 0 ||
      tabIndex >= tabIds.length
    )
      return;
    selectTab(tabIndex);
  });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    window.__saturnDemoReset?.();
    selectTab(0);
    notifyParent({ type: "saturn-demo-ready" });
  });

  document.addEventListener("change", (event) => {
    const index = tabIds.indexOf(event.target?.id);
    if (index >= 0) {
      selectTab(index, true);
    }
  });

  ["click", "focusin", "input", "keydown", "pointerdown"].forEach(
    (eventName) => {
      document.addEventListener(
        eventName,
        () => {
          notifyParent({ type: "saturn-demo-interaction" });
        },
        { capture: true },
      );
    },
  );

  notifyParent({ type: "saturn-demo-ready" });
})();
