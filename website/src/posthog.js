import posthog from "posthog-js";
import "posthog-js/dist/exception-autocapture";

const token = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
const missingVariables = [
  !token && "VITE_PUBLIC_POSTHOG_KEY",
  !apiHost && "VITE_PUBLIC_POSTHOG_HOST",
].filter(Boolean);

export const analyticsStatus = {
  configured: missingVariables.length === 0,
  initialized: false,
  missingVariables,
};

globalThis.__SATURN_ANALYTICS_STATUS__ = analyticsStatus;

if (analyticsStatus.configured) {
  posthog.init(token, {
    api_host: apiHost,
    defaults: "2026-05-30",
    loaded: () => {
      analyticsStatus.initialized = true;
    },
  });
  posthog.startExceptionAutocapture();
} else {
  const message = `Website analytics disabled: missing ${missingVariables.join(
    " and ",
  )}.`;
  console.error(message);
  if (import.meta.env.DEV) throw new Error(message);
}

export default posthog;
