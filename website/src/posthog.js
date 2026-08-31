import posthog from "posthog-js";
import "posthog-js/dist/exception-autocapture";

const token = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
const productionHosts = new Set(["saturnfocus.com", "www.saturnfocus.com"]);
const hostname = globalThis.location?.hostname || "";
const missingVariables = [
  !token && "VITE_PUBLIC_POSTHOG_KEY",
  !apiHost && "VITE_PUBLIC_POSTHOG_HOST",
].filter(Boolean);
const isProductionHost = productionHosts.has(hostname);
const enabled = isProductionHost && missingVariables.length === 0;

export const analyticsStatus = {
  configured: missingVariables.length === 0,
  enabled,
  initialized: false,
  missingVariables,
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
