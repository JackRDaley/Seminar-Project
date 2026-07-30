import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "tools", "posthog-analytics-contract.json");
const contract = JSON.parse(await readFile(contractPath, "utf8"));

const projectId = process.env.POSTHOG_PROJECT_ID || String(contract.project_id || "");
const appHost = (process.env.POSTHOG_APP_HOST || contract.host || "https://us.posthog.com").replace(/\/+$/g, "");
const ingestHost = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/g, "");
const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY || await readEnvFileValue("POSTHOG_PERSONAL_API_KEY");
const projectApiKey = process.env.POSTHOG_PROJECT_API_KEY || await readEnvFileValue("POSTHOG_PROJECT_API_KEY");
const shouldSeed = !process.argv.includes("--no-seed");
const shouldDryRun = process.argv.includes("--dry-run");
const numericPropertyNames = new Set([
  "created_count",
  "skipped_count",
  "conflict_count",
  "capped_count",
  "is_first_activity_this_week",
  "is_first_activity_today",
  "onboarding_step",
  "percent_scrolled",
]);

if (!projectId) {
  throw new Error("Missing PostHog project id. Set POSTHOG_PROJECT_ID or update tools/posthog-analytics-contract.json.");
}

if (!personalApiKey && !shouldDryRun) {
  throw new Error("Missing POSTHOG_PERSONAL_API_KEY. Set it in your shell or ignored .dev.vars file.");
}

if (shouldSeed && !projectApiKey && !shouldDryRun) {
  throw new Error("Missing POSTHOG_PROJECT_API_KEY for seeding. Set it in your shell or ignored .dev.vars file, or pass --no-seed.");
}

if (shouldDryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    projectId,
    propertyCount: contract.event_properties.length,
    properties: contract.event_properties.map((property) => ({
      name: property.name,
      display_type: displayTypeFor(property.name),
      description: property.description,
    })),
  }, null, 2));
  process.exit(0);
}

if (shouldSeed) {
  await seedDefinitionEvent();
  await wait(3000);
}

const existing = await listPropertyDefinitions();
const byName = new Map(existing.map((definition) => [definition.name, definition]));
const results = [];

for (const property of contract.event_properties) {
  const existingDefinition = byName.get(property.name);
  const displayType = displayTypeFor(property.name);

  if (existingDefinition?.id) {
    const updated = await patchPropertyDefinition(existingDefinition.id, {
      description: property.description,
      display_type: displayType,
    });
    results.push({ name: property.name, action: "updated", id: updated.id || existingDefinition.id });
    continue;
  }

  const created = await createCustomPropertyDefinition(property.name, {
    description: property.description,
    display_type: displayType,
  });
  results.push({ name: property.name, action: "created", id: created.id || null });
}

console.log(JSON.stringify({
  ok: true,
  projectId,
  seeded: shouldSeed,
  synced: results.length,
  results,
}, null, 2));

async function readEnvFileValue(name) {
  for (const relativePath of [".dev.vars", path.join("worker", ".dev.vars")]) {
    try {
      const text = await readFile(path.join(root, relativePath), "utf8");
      const line = text.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim();
    } catch {
      // Ignore missing local env files.
    }
  }
  return "";
}

async function seedDefinitionEvent() {
  const properties = {
    "$process_person_profile": false,
    analytics_source: "definition_seed",
  };

  for (const property of contract.event_properties) {
    properties[property.name] = sampleValueFor(property.name);
  }

  const response = await fetch(`${ingestHost}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: projectApiKey,
      distinct_id: "posthog_definition_seed",
      event: "posthog_definition_seed",
      properties,
    }),
  });

  if (!response.ok) {
    throw new Error(`PostHog seed event failed (${response.status}): ${await response.text()}`);
  }
}

async function listPropertyDefinitions() {
  const properties = contract.event_properties.map((property) => property.name).join(",");
  const url = new URL(`${appHost}/api/projects/${projectId}/property_definitions/`);
  url.searchParams.set("type", "event");
  url.searchParams.set("properties", properties);
  url.searchParams.set("limit", "500");

  const response = await posthogApi(url, { method: "GET" });
  return Array.isArray(response.results) ? response.results : [];
}

async function patchPropertyDefinition(id, payload) {
  return posthogApi(`${appHost}/api/projects/${projectId}/property_definitions/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function createCustomPropertyDefinition(name, payload) {
  try {
    return await posthogApi(`${appHost}/api/projects/${projectId}/custom_property_definitions/`, {
      method: "POST",
      body: JSON.stringify({
        name,
        ...payload,
        target_type: "event",
      }),
    });
  } catch (error) {
    if (!String(error.message).includes("target_type")) throw error;
    return posthogApi(`${appHost}/api/projects/${projectId}/custom_property_definitions/`, {
      method: "POST",
      body: JSON.stringify({ name, ...payload }),
    });
  }
}

async function posthogApi(url, options = {}) {
  const response = await fetch(String(url), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${personalApiKey}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`PostHog API ${options.method || "GET"} ${url} failed (${response.status}): ${await response.text()}`);
  }

  if (response.status === 204) return {};
  return response.json();
}

function displayTypeFor(name) {
  return numericPropertyNames.has(name) ? "number" : "text";
}

function sampleValueFor(name) {
  if (numericPropertyNames.has(name)) return 1;
  if (name.endsWith("_day_key")) return "2026-07-29";
  if (name.endsWith("_week_key")) return "2026-W31";
  if (name === "link_url") return "https://saturnfocus.com/";
  if (name === "link_domain") return "saturnfocus.com";
  return "definition_seed";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
