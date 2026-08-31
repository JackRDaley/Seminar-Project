import posthog from "posthog-js";
import "posthog-js/dist/exception-autocapture";

const token = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
const productionHosts = new Set(["saturnfocus.com", "www.saturnfocus.com"]);
const analyticsOptOutKey = "saturnAnalyticsOptOut";
const hostname = globalThis.location?.hostname || "";

function getAnalyticsOptOut() {
  try {
    const preference = new URLSearchParams(globalThis.location?.search || "").get("analytics");
    if (preference === "off") globalThis.localStorage?.setItem(analyticsOptOutKey, "true");
    if (preference === "on") globalThis.localStorage?.removeItem(analyticsOptOutKey);
    return globalThis.localStorage?.getItem(analyticsOptOutKey) === "true";
  } catch {
    return false;
  }
}

const missingVariables = [
  !token && "VITE_PUBLIC_POSTHOG_KEY",
  !apiHost && "VITE_PUBLIC_POSTHOG_HOST",
].filter(Boolean);
const isProductionHost = productionHosts.has(hostname);
const optedOut = getAnalyticsOptOut();
const enabled = isProductionHost && missingVariables.length === 0 && !optedOut;

export const analyticsStatus = {
  configured: missingVariables.length === 0,
  enabled,
  initialized: false,
  missingVariables,
  optedOut,
};

globalThis.__SATURN_ANALYTICS_STATUS__ = analyticsStatus;

if (analyticsStatus.enabled) {
  posthog.init(token, {
    api_host: apiHost,
    defaults: "2026-05-30",
    loaded: () => {
      analyticsStatus.initialized = true;
    },
  });
  posthog.startExceptionAutocapture();
}

export default analyticsStatus.enabled
  ? posthog
  : { capture: () => {} };
