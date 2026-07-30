import posthog from "posthog-js";
import "posthog-js/dist/exception-autocapture";

const token = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

if (token && apiHost) {
  posthog.init(token, {
    api_host: apiHost,
    defaults: "2026-05-30",
  });
  posthog.startExceptionAutocapture();
} else if (import.meta.env.DEV) {
  const missing = !token ? "VITE_PUBLIC_POSTHOG_KEY" : "VITE_PUBLIC_POSTHOG_HOST";
  throw new Error(
    `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`,
  );
}

export default posthog;
