const token = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
const uiHost = "https://us.posthog.com";
const enabled = Boolean(token && apiHost);
let clientPromise;

if (!enabled && import.meta.env.DEV) {
  const missing = !token
    ? "VITE_PUBLIC_POSTHOG_KEY"
    : "VITE_PUBLIC_POSTHOG_HOST";
  throw new Error(
    `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`,
  );
}

async function loadClient() {
  if (!enabled) return null;
  if (!clientPromise) {
    clientPromise = Promise.all([
      import("posthog-js"),
      import("posthog-js/dist/recorder"),
      import("posthog-js/dist/exception-autocapture"),
    ]).then(([module]) => {
      const client = module.default;
      client.init(token, {
        api_host: apiHost,
        ui_host: uiHost,
        defaults: "2026-05-30",
        person_profiles: "identified_only",
        disable_external_dependency_loading: true,
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: true,
        },
      });
      client.startExceptionAutocapture();
      client.startSessionRecording({
        sampling: true,
        linked_flag: true,
        url_trigger: true,
        event_trigger: true,
      });
      return client;
    });
  }
  return clientPromise;
}

if (enabled && typeof window !== "undefined") {
  const preload = () => void loadClient().catch(() => {});
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(preload, { timeout: 3000 });
  } else {
    window.setTimeout(preload, 1500);
  }
}

export default Object.freeze({
  capture(eventName, properties) {
    void loadClient()
      .then((client) => client?.capture(eventName, properties))
      .catch(() => {});
  },
});
