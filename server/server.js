import "dotenv/config";
import cors from "cors";
import express from "express";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const app = express();
const port = Number(process.env.PORT || 8787);
app.disable("x-powered-by");

const EXTENSION_ID_RE = /^[a-p]{32}$/i;
const allowedExtensionOrigins = new Set(
	String(process.env.ALLOWED_EXTENSION_IDS || "")
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter((value) => EXTENSION_ID_RE.test(value))
		.map((value) => `chrome-extension://${value}`)
);

app.use(cors({
	origin(origin, callback) {
		if (!origin) {
			return callback(null, false);
		}

		if (allowedExtensionOrigins.has(String(origin).toLowerCase())) {
			return callback(null, true);
		}

		return callback(null, false);
	}
}));
app.use(express.json({ limit: "64kb" }));

const verifyBodySchema = z.object({
	token: z.string().trim().min(1).max(2048),
	extension: z.string().max(128).optional()
}).strict();

function normalizeWhopResult(raw) {
	const rawActive =
		raw?.active ??
		raw?.isActive ??
		raw?.valid ??
		raw?.entitlement?.active ??
		raw?.membership?.active;
	const status = String(raw?.status ?? raw?.membership?.status ?? "").toLowerCase();
	const active = rawActive === true || rawActive === 1 || rawActive === "1" ||
		String(rawActive).toLowerCase() === "true" ||
		["active", "trialing"].includes(status);

	const planName =
		raw?.planName ??
		raw?.plan?.name ??
		raw?.membership?.planName ??
		raw?.tier ??
		(active ? "Premium" : "Free");

	const expiresAt =
		raw?.expiresAt ??
		raw?.expiry ??
		raw?.membership?.expiresAt ??
		raw?.entitlement?.expiresAt ??
		null;

	return {
		active,
		planName: String(planName),
		expiresAt: typeof expiresAt === "string" ? expiresAt : null
	};
}

async function verifyWithWhop(token) {
	const devPremiumToken = process.env.DEV_PREMIUM_TOKEN;
	if (devPremiumToken && token === devPremiumToken) {
		return {
		active: true,
		planName: "Dev Premium",
		expiresAt: null
		};
	}

	const whopApiKey = process.env.WHOP_API_KEY;
	const whopVerifyUrl = process.env.WHOP_VERIFY_URL;

	if (!whopApiKey || !whopVerifyUrl) {
		return {
		active: false,
		planName: "Free",
		expiresAt: null
		};
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000);

	try {
		const response = await fetch(whopVerifyUrl, {
			method: "POST",
			headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${whopApiKey}`
			},
			body: JSON.stringify({ token }),
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`Whop verify failed with status ${response.status}`);
		}

		const data = await response.json();
		return normalizeWhopResult(data);
	} catch (error) {
		if (error?.name === "AbortError") {
			throw new Error("Whop verify timed out");
		}

		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

app.get("/health", (_req, res) => {
  	res.json({ ok: true, service: "whop-verify", now: new Date().toISOString() });
});

app.post("/whop/verify", async (req, res) => {
	const parsed = verifyBodySchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({
		error: "Invalid request body",
		details: parsed.error.flatten()
		});
	}

	try {
		const entitlement = await verifyWithWhop(parsed.data.token);
		return res.json({
		active: entitlement.active,
		planName: entitlement.planName,
		expiresAt: entitlement.expiresAt
		});
	} catch (error) {
		console.error("Whop verification failed", {
			name: error instanceof Error ? error.name : "UnknownError"
		});
		return res.status(502).json({
		error: "Verification temporarily unavailable"
		});
	}
});

app.use((_req, res) => {
	res.status(404).json({ error: "Not found" });
});

app.use((error, _req, res, _next) => {
	const status = Number(error?.status || error?.statusCode || 0);
	if (status === 400 || status === 413) {
		return res.status(status).json({
			error: status === 413 ? "Request body too large" : "Invalid JSON body"
		});
	}
	console.error("Unhandled request error", {
		name: error instanceof Error ? error.name : "UnknownError"
	});
	res.status(500).json({ error: "Internal server error" });
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	app.listen(port, () => {
		console.log(`Whop verify backend listening on http://localhost:${port}`);
	});
}

export { app, normalizeWhopResult };
