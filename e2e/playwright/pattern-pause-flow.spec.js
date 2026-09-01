const { test, expect } = require("@playwright/test");
const path = require("path");

function patternPauseUrl() {
  const base = `file:///${path
    .join(process.cwd(), "pattern-pause.html")
    .replace(/\\/g, "/")}`;
  const params = new URLSearchParams({
    d: "instagram.com",
    rid: "pattern:instagram.com",
    u: "https://instagram.com/reels/abc",
  });
  return `${base}?${params.toString()}`;
}

async function installPatternPauseChromeMock(page, messages) {
  await page.exposeFunction("__capturePatternMessage", (message) => {
    messages.push(message);
  });
  await page.addInitScript(() => {
    const now = Date.now();
    window.chrome = {
      runtime: {
        id: "mock-extension-id",
        sendMessage: async (message) => {
          await window.__capturePatternMessage(message);
          if (message.action === "getPatternPauseContext") {
            return {
              success: true,
              original: "https://instagram.com/reels/abc",
              rule: {
                id: "pattern:instagram.com",
                domain: "instagram.com",
                enabled: true,
                mode: "today",
                thresholdVisits: 3,
                windowMinutes: 30,
              },
              evidence: {
                domain: "instagram.com",
                visitCount: 7,
                newTabCount: 4,
                interspersedReturnCount: 2,
                returnAfterCloseCount: 1,
                observedWindowMinutes: 24,
                firstAt: now - 24 * 60 * 1000,
                lastAt: now,
              },
              summary: { shown: 1, continued: 0, closed: 0 },
            };
          }
          if (message.action === "continuePatternPause") {
            return {
              success: true,
              redirectUrl: "https://instagram.com/reels/abc",
            };
          }
          if (message.action === "disablePatternPause") {
            return {
              success: true,
              redirectUrl: "https://instagram.com/reels/abc",
            };
          }
          if (message.action === "closePatternPauseTab") {
            return { success: true, shouldClose: true };
          }
          return { success: false, error: "Unexpected action" };
        },
      },
    };
  });
}

test("pattern interruption explains the evidence and continues in one click", async ({
  page,
}) => {
  const messages = [];
  await installPatternPauseChromeMock(page, messages);
  await page.route("https://instagram.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "continued" });
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(patternPauseUrl());
  await expect.poll(() => page.evaluate(() => window.__patternPauseReady)).toBe(true);
  await expect(page.locator("#pauseTitle")).toHaveText(
    "Instagram showed up again.",
  );
  await expect(page.locator("#evidenceCopy")).toContainText(
    "opened 7 times in 24 minutes",
  );
  await expect(page.locator("#evidenceCopy")).toContainText(
    "4 visits were from a new tab",
  );
  await expect(page.locator("#ruleMode")).toHaveText(
    "Pattern pause · Today only",
  );
  await expect(page.locator("#siteFavicon")).toBeVisible();
  await expect(page.locator("#siteFavicon")).toHaveAttribute(
    "src",
    /assets\/site-icons\/instagram\.svg$/,
  );
  await expect(page.locator("#siteInitial")).toBeHidden();
  await expect(page.locator("#continueBtn")).toHaveText(/Continue to Instagram/);
  await expect(page.locator("#closeTabBtn")).toBeVisible();
  await expect(page.locator("#disableBtn")).toBeVisible();

  await page.locator("#continueBtn").click();
  await expect(page).toHaveURL("https://instagram.com/reels/abc");
  expect(messages.some((message) => message.action === "continuePatternPause")).toBe(
    true,
  );
});

test("pattern interruption remains usable at a narrow viewport", async ({ page }) => {
  const messages = [];
  await installPatternPauseChromeMock(page, messages);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(patternPauseUrl());
  await expect.poll(() => page.evaluate(() => window.__patternPauseReady)).toBe(true);
  await expect(page.locator("#pauseTitle")).toBeVisible();
  await expect(page.locator("#continueBtn")).toBeVisible();
  await expect(page.locator("#closeTabBtn")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
