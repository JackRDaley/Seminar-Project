import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const EXTENSION_ID = "pecaajdaecdmikcgfdgldcofdebhfbgo";

function analyticsEnv() {
    return {
        ANALYTICS_PRODUCTION_EXTENSION_IDS: EXTENSION_ID,
        POSTHOG_HOST: "https://us.i.posthog.com",
        POSTHOG_PROJECT_API_KEY: "phc_test"
    };
}

function analyticsRequest(path, body) {
    return new Request(`https://api.saturnfocus.com${path}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            origin: `chrome-extension://${EXTENSION_ID}`
        },
        body: JSON.stringify({
            clientId: "analytics-client-id",
            extensionId: EXTENSION_ID,
            extensionVersion: "3.3.19",
            ...body
        })
    });
}

test("queued extension events forward their insert id to PostHog", async (t) => {
    const nativeFetch = globalThis.fetch;
    const captures = [];
    t.after(() => {
        globalThis.fetch = nativeFetch;
    });
    globalThis.fetch = async (url, options) => {
        captures.push({ url: String(url), options });
        return new Response(null, { status: 200 });
    };

    const response = await worker.fetch(
        analyticsRequest("/analytics/event", {
            eventId: "analytics-event-123",
            eventName: "blocked_page_view",
            params: {
                block_source: "limit",
                block_tier: "strict"
            }
        }),
        analyticsEnv()
    );

    assert.equal(response.status, 200);
    assert.equal(captures.length, 1);
    assert.equal(captures[0].url, "https://us.i.posthog.com/i/v0/e/");
    const capture = JSON.parse(captures[0].options.body);
    assert.equal(capture.event, "blocked_page_view");
    assert.equal(capture.properties.$insert_id, "analytics-event-123");
    assert.equal(capture.properties.block_source, "limit");
    assert.equal(capture.properties.block_tier, "strict");
});

test("legacy blocked-page endpoint remains compatible with older releases", async (t) => {
    const nativeFetch = globalThis.fetch;
    const captures = [];
    t.after(() => {
        globalThis.fetch = nativeFetch;
    });
    globalThis.fetch = async (url, options) => {
        captures.push({ url: String(url), options });
        return new Response(null, { status: 200 });
    };

    const response = await worker.fetch(
        analyticsRequest("/analytics/block-event", {
            eventId: "legacy-block-event-123",
            source: "scheduled",
            tier: "immutable"
        }),
        analyticsEnv()
    );

    assert.equal(response.status, 200);
    assert.equal(captures.length, 1);
    const capture = JSON.parse(captures[0].options.body);
    assert.equal(capture.event, "blocked_page_view");
    assert.equal(capture.properties.$insert_id, "legacy-block-event-123");
    assert.equal(capture.properties.block_source, "scheduled");
    assert.equal(capture.properties.block_tier, "immutable");
});

test("migration baselines forward only allowlisted privacy-safe state", async (t) => {
    const nativeFetch = globalThis.fetch;
    const captures = [];
    t.after(() => {
        globalThis.fetch = nativeFetch;
    });
    globalThis.fetch = async (url, options) => {
        captures.push({ url: String(url), options });
        return new Response(null, { status: 200 });
    };

    const response = await worker.fetch(
        analyticsRequest("/analytics/event", {
            eventId: "migration-event-123",
            eventName: "analytics_migration",
            params: {
                analytics_schema_version: 2,
                has_limit: 1,
                has_schedule: 1,
                has_block_history: 1,
                onboarding_complete: 1,
                raw_domain: "private.example"
            }
        }),
        analyticsEnv()
    );

    assert.equal(response.status, 200);
    assert.equal(captures.length, 1);
    const capture = JSON.parse(captures[0].options.body);
    assert.equal(capture.event, "analytics_migration");
    assert.equal(capture.properties.analytics_schema_version, 2);
    assert.equal(capture.properties.has_limit, 1);
    assert.equal(capture.properties.has_schedule, 1);
    assert.equal(capture.properties.has_block_history, 1);
    assert.equal(capture.properties.onboarding_complete, 1);
    assert.equal("raw_domain" in capture.properties, false);
});

test("health exposes analytics configuration without revealing credentials", async () => {
    const configured = await worker.fetch(
        new Request("https://api.saturnfocus.com/health"),
        analyticsEnv()
    );
    const configuredBody = await configured.json();
    assert.deepEqual(configuredBody.analytics, {
        posthogConfigured: true,
        productionExtensionGateConfigured: true
    });
    assert.equal(JSON.stringify(configuredBody).includes("phc_test"), false);

    const missing = await worker.fetch(
        new Request("https://api.saturnfocus.com/health"),
        {
            ANALYTICS_PRODUCTION_EXTENSION_IDS: ""
        }
    );
    const missingBody = await missing.json();
    assert.equal(missingBody.analytics.posthogConfigured, false);
    assert.equal(missingBody.analytics.productionExtensionGateConfigured, true);
});

test("unsupported events are rejected before PostHog forwarding", async (t) => {
    const nativeFetch = globalThis.fetch;
    let called = false;
    t.after(() => {
        globalThis.fetch = nativeFetch;
    });
    globalThis.fetch = async () => {
        called = true;
        return new Response(null, { status: 200 });
    };

    const response = await worker.fetch(
        analyticsRequest("/analytics/event", {
            eventName: "raw_browser_history_upload"
        }),
        analyticsEnv()
    );

    assert.equal(response.status, 400);
    assert.equal(called, false);
});

test("PostHog failures surface as retryable gateway errors", async (t) => {
    const nativeFetch = globalThis.fetch;
    const nativeWarn = console.warn;
    t.after(() => {
        globalThis.fetch = nativeFetch;
        console.warn = nativeWarn;
    });
    globalThis.fetch = async () => new Response(null, { status: 503 });
    console.warn = () => {};

    const response = await worker.fetch(
        analyticsRequest("/analytics/event", {
            eventName: "extension_active_daily",
            params: { analytics_schema_version: 2 }
        }),
        analyticsEnv()
    );
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.error, "Analytics forwarding failed");
});
