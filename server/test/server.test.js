import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOWED_EXTENSION_IDS = "pecaajdaecdmikcgfdgldcofdebhfbgo";

const { app, normalizeWhopResult } = await import("../server.js");

async function withServer(run) {
	const server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	const { port } = server.address();
	try {
		await run(`http://127.0.0.1:${port}`);
	} finally {
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	}
}

test("does not treat the string false as an active entitlement", () => {
	assert.equal(normalizeWhopResult({ active: "false" }).active, false);
	assert.equal(normalizeWhopResult({ status: "trialing" }).active, true);
});

test("health response omits framework disclosure", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/health`);
		assert.equal(response.status, 200);
		assert.equal(response.headers.has("x-powered-by"), false);
	});
});

test("CORS only allows configured extension ids", async () => {
	await withServer(async (baseUrl) => {
		const allowed = await fetch(`${baseUrl}/health`, {
			headers: { Origin: "chrome-extension://pecaajdaecdmikcgfdgldcofdebhfbgo" }
		});
		assert.equal(
			allowed.headers.get("access-control-allow-origin"),
			"chrome-extension://pecaajdaecdmikcgfdgldcofdebhfbgo"
		);

		const denied = await fetch(`${baseUrl}/health`, {
			headers: { Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
		});
		assert.equal(denied.headers.has("access-control-allow-origin"), false);
	});
});

test("verification rejects unknown request fields", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/whop/verify`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ token: "token", unexpected: true })
		});
		assert.equal(response.status, 400);
	});
});

test("malformed JSON is reported as a client error", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/whop/verify`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{not-json"
		});
		assert.equal(response.status, 400);
		assert.deepEqual(await response.json(), { error: "Invalid JSON body" });
	});
});
