import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import test from "node:test";

import worker from "../src/index.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const WEBHOOK_SECRET = "test-webhook-secret";

function createKv() {
    const values = new Map();
    return {
        values,
        async get(key) {
            return values.get(key) ?? null;
        },
        async put(key, value) {
            values.set(key, value);
        },
        async delete(key) {
            values.delete(key);
        }
    };
}

function baseEnv(overrides = {}) {
    return {
        WHOP_COMPANY_ID: "biz_saturn",
        WHOP_PRODUCT_ID: "prod_saturn",
        WHOP_WEBHOOK_SECRET: WEBHOOK_SECRET,
        PREMIUM_STATUS: createKv(),
        ...overrides
    };
}

function signedWebhookRequest(payload, { id = "msg_test", timestamp = Math.floor(Date.now() / 1000) } = {}) {
    const rawBody = JSON.stringify(payload);
    const signature = createHmac("sha256", WEBHOOK_SECRET)
        .update(`${id}.${timestamp}.${rawBody}`)
        .digest("base64");

    return new Request("https://api.saturnfocus.com/whop/webhook", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "webhook-id": id,
            "webhook-timestamp": String(timestamp),
            "webhook-signature": `v1,${signature}`
        },
        body: rawBody
    });
}

function membershipPayload(productId = "prod_saturn") {
    return {
        type: "membership.activated",
        data: {
            membership: {
                id: "mem_test",
                status: "active",
                user: { id: "user_test" },
                company: { id: "biz_saturn" },
                product: { id: productId, title: "Saturn Premium" }
            }
        }
    };
}

test("webhook fails closed when no signing secret is configured", async () => {
    const env = baseEnv({ WHOP_WEBHOOK_SECRET: "" });
    const response = await worker.fetch(signedWebhookRequest(membershipPayload()), env);

    assert.equal(response.status, 503);
    assert.equal(env.PREMIUM_STATUS.values.size, 0);
});

test("webhook rejects a correctly signed but stale request", async () => {
    const env = baseEnv();
    const response = await worker.fetch(
        signedWebhookRequest(membershipPayload(), {
            timestamp: Math.floor(Date.now() / 1000) - 301
        }),
        env
    );

    assert.equal(response.status, 401);
    assert.equal(env.PREMIUM_STATUS.values.size, 0);
});

test("webhook ignores memberships for a different product", async () => {
    const env = baseEnv();
    const response = await worker.fetch(
        signedWebhookRequest(membershipPayload("prod_other")),
        env
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.reason, "out-of-scope");
    assert.equal(env.PREMIUM_STATUS.values.has("user:user_test"), false);
});

test("webhook activates the configured product once", async () => {
    const env = baseEnv();
    const request = signedWebhookRequest(membershipPayload());
    const response = await worker.fetch(request, env);

    assert.equal(response.status, 200);
    const premium = JSON.parse(env.PREMIUM_STATUS.values.get("user:user_test"));
    assert.equal(premium.active, true);
    assert.equal(premium.planName, "Saturn Premium");
    assert.equal(env.PREMIUM_STATUS.values.get("webhook:msg_test"), "1");

    const duplicate = await worker.fetch(signedWebhookRequest(membershipPayload()), env);
    assert.equal((await duplicate.json()).duplicate, true);
});

test("membership verification only accepts the configured product", async (t) => {
    const nativeFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = nativeFetch;
    });

    const env = baseEnv({
        WHOP_API_KEY: "test-api-key",
        WHOP_VERIFY_URL: "https://api.whop.com/api/v5/memberships"
    });

    globalThis.fetch = async () => new Response(JSON.stringify({
        data: {
            id: "mem_wrong",
            status: "active",
            user: { id: "user_test" },
            company: { id: "biz_saturn" },
            product: { id: "prod_other", title: "Other Product" }
        }
    }), { status: 200, headers: { "content-type": "application/json" } });

    const wrongProduct = await worker.fetch(new Request("https://api.saturnfocus.com/whop/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "mem_wrong" })
    }), env);
    assert.equal((await wrongProduct.json()).active, false);

    globalThis.fetch = async () => new Response(JSON.stringify({
        data: {
            id: "mem_right",
            status: "active",
            user: { id: "user_test" },
            company: { id: "biz_saturn" },
            product: { id: "prod_saturn", title: "Saturn Premium" }
        }
    }), { status: 200, headers: { "content-type": "application/json" } });

    const rightProduct = await worker.fetch(new Request("https://api.saturnfocus.com/whop/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "mem_right" })
    }), env);
    const body = await rightProduct.json();
    assert.equal(body.active, true);
    assert.equal(body.planName, "Saturn Premium");
});

test("extension analytics create a pseudonymous install profile", async (t) => {
    const nativeFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = nativeFetch;
    });

    const extensionId = "pecaajdaecdmikcgfdgldcofdebhfbgo";
    const clientId = "e1aeb9f3-40ab-446e-89ee-891aaf3b492b";
    const captures = [];
    const env = baseEnv({
        ANALYTICS_PRODUCTION_EXTENSION_IDS: extensionId,
        POSTHOG_HOST: "https://us.i.posthog.com",
        POSTHOG_PROJECT_API_KEY: "phc_test"
    });

    globalThis.fetch = async (url, options) => {
        captures.push({ url: String(url), options });
        return new Response(null, { status: 200 });
    };

    const response = await worker.fetch(new Request("https://api.saturnfocus.com/analytics/event", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            origin: `chrome-extension://${extensionId}`
        },
        body: JSON.stringify({
            clientId,
            eventName: "popup_opened",
            extensionId,
            extensionVersion: "3.3.18",
            params: { trigger: "toolbar" }
        })
    }), env);

    assert.equal(response.status, 200);
    assert.equal(captures.length, 1);
    assert.equal(captures[0].url, "https://us.i.posthog.com/i/v0/e/");

    const capture = JSON.parse(captures[0].options.body);
    assert.equal(capture.distinct_id, clientId);
    assert.equal(capture.properties.$process_person_profile, true);
    assert.deepEqual(capture.properties.$set, {
        latest_extension_version: "3.3.18"
    });
    assert.deepEqual(capture.properties.$set_once, {
        analytics_source: "saturn_extension",
        extension_id: extensionId,
        first_seen_extension_version: "3.3.18",
        profile_type: "pseudonymous_extension_install"
    });
    assert.equal(capture.properties.client_id, undefined);
    assert.equal(capture.properties.email, undefined);
});
