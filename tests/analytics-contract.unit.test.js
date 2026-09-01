const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function readSet(source, name) {
  const match = source.match(
    new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`),
  );
  if (!match) throw new Error(`Could not find ${name}`);
  return [...match[1].matchAll(/"([a-z0-9_]+)"/g)].map((item) => item[1]);
}

describe("PostHog analytics contract", () => {
  const workerSource = read("worker/src/index.js");
  const contract = JSON.parse(read("tools/posthog-analytics-contract.json"));
  const allowedEvents = readSet(workerSource, "ANALYTICS_ALLOWED_EVENTS");
  const allowedParams = readSet(workerSource, "ANALYTICS_ALLOWED_PARAMS");
  const propertyDefinitions = contract.event_properties.map(
    (property) => property.name,
  );

  test("the Worker accepts every event emitted by the production extension", () => {
    expect(allowedEvents.sort()).toEqual(
      [
        "analytics_migration",
        "blocked_page_action",
        "blocked_page_view",
        "domain_added",
        "extension_active_daily",
        "extension_update",
        "first_block_reached",
        "first_limit_created",
        "first_schedule_created",
        "insight_add_limit_clicked",
        "insight_presented",
        "insight_viewed",
        "onboarding_completed",
        "onboarding_skipped",
        "onboarding_started",
        "popup_opened",
        "post_install_redirect_action",
        "post_install_redirect_failed",
        "post_install_redirect_shown",
        "preset_applied",
        "review_prompt_action",
        "review_prompt_shown",
        "upgrade_clicked",
      ].sort(),
    );
  });

  test("every Worker parameter has a documented PostHog property", () => {
    expect(allowedParams.filter((name) => !propertyDefinitions.includes(name))).toEqual(
      [],
    );
    expect(new Set(propertyDefinitions).size).toBe(propertyDefinitions.length);
  });

  test("the contract documents Worker-added routing properties", () => {
    expect(propertyDefinitions).toEqual(
      expect.arrayContaining(["analytics_source", "extension_id"]),
    );
  });
});
