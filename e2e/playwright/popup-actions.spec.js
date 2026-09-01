const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const WHOP_CHECKOUT_START_URL = 'https://api.saturnfocus.com/whop/start';
const WHOP_MANAGE_URL = 'https://whop.com/hub/memberships/';
const CHROME_WEBSTORE_REVIEW_URL = 'https://chromewebstore.google.com/detail/saturn-screen-time-manage/pecaajdaecdmikcgfdgldcofdebhfbgo/reviews';
const SURVEYMONKEY_FEEDBACK_URL = 'https://www.surveymonkey.com/r/QF2RJ58';

function popupUrl() {
    return `file:///${path.join(process.cwd(), 'popup.html').replace(/\\/g, '/')}`;
}

function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function dayKeyOffset(offset) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return dayKey(date);
}

function insightMockUsageData() {
    const today = dayKey();
    const yesterday = dayKeyOffset(1);
    const twoDaysAgo = dayKeyOffset(2);
    const threeDaysAgo = dayKeyOffset(3);
    const hour = new Date().getHours();
    const hourKey = String(hour).padStart(2, '0');

    return {
        uiSettings: {
            defaultLimitMinutes: 30,
            use24HourTime: false,
            limitNotificationsEnabled: true,
            personalInsightsEnabled: true,
            insightNotificationsEnabled: true,
            insightMaxNotificationsPerDay: 1,
            insightSensitivity: 'normal'
        },
        activeSession: {
            domain: 'youtube.com',
            startedAt: Date.now() - 40 * 60 * 1000,
            lastHeartbeatAt: Date.now()
        },
        statsToday: {
            'youtube.com': { timeMs: 50 * 60 * 1000, visits: 4 },
            'reddit.com': { timeMs: 22 * 60 * 1000, visits: 9 },
            'linkedin.com': { timeMs: 12 * 60 * 1000, visits: 1 }
        },
        allStatsToday: {
            'youtube.com': { timeMs: 50 * 60 * 1000, visits: 4 },
            'reddit.com': { timeMs: 22 * 60 * 1000, visits: 9 },
            'linkedin.com': { timeMs: 12 * 60 * 1000, visits: 1 }
        },
        statsHistory: {
            [yesterday]: {
                'youtube.com': { timeMs: 10 * 60 * 1000, visits: 1 },
                'linkedin.com': { timeMs: 12 * 60 * 1000, visits: 1 }
            },
            [twoDaysAgo]: {
                'youtube.com': { timeMs: 11 * 60 * 1000, visits: 1 },
                'linkedin.com': { timeMs: 12 * 60 * 1000, visits: 1 }
            },
            [threeDaysAgo]: {
                'youtube.com': { timeMs: 12 * 60 * 1000, visits: 1 }
            }
        },
        hourlyUsageHistory: {
            [today]: {
                '09': {
                    timeMs: 8 * 60 * 1000,
                    visits: 1,
                    domains: { 'linkedin.com': 8 * 60 * 1000 },
                    domainVisits: { 'linkedin.com': 1 }
                },
                [hourKey]: {
                    timeMs: 32 * 60 * 1000,
                    visits: 12,
                    domains: {
                        'youtube.com': 22 * 60 * 1000,
                        'reddit.com': 10 * 60 * 1000
                    },
                    domainVisits: {
                        'youtube.com': 3,
                        'reddit.com': 9
                    }
                }
            },
            [yesterday]: {
                '09': {
                    timeMs: 8 * 60 * 1000,
                    visits: 1,
                    domains: { 'linkedin.com': 8 * 60 * 1000 },
                    domainVisits: { 'linkedin.com': 1 }
                }
            },
            [twoDaysAgo]: {
                '09': {
                    timeMs: 8 * 60 * 1000,
                    visits: 1,
                    domains: { 'linkedin.com': 8 * 60 * 1000 },
                    domainVisits: { 'linkedin.com': 1 }
                }
            }
        },
        personalInsights: [],
        dismissedInsights: {},
        blockedDomains: {},
        snoozedDomains: {}
    };
}

async function installPopupChromeMock(page, overrides = {}, runtimeOptions = {}) {
    const insightsSource = fs.readFileSync(path.join(process.cwd(), 'insights.js'), 'utf8');
    await page.addInitScript(({ today, overrides, insightsSource, runtimeOptions }) => {
        window.eval(insightsSource);
        const listeners = [];
        const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
        const data = {
            uiSettings: {
                defaultLimitMinutes: 30,
                use24HourTime: false,
                limitNotificationsEnabled: true,
                personalInsightsEnabled: true,
                patternPausesEnabled: true,
                insightNotificationsEnabled: true,
                insightMaxNotificationsPerDay: 1,
                insightSensitivity: 'normal'
            },
            onboardingState: { step: 0, completed: true, completedAt: Date.now(), version: 2 },
            blockedDomains: {},
            statsToday: {
                'alpha.com': { timeMs: 20 * 60 * 1000, visits: 4 },
                'beta.com': { timeMs: 10 * 60 * 1000, visits: 2 }
            },
            allStatsToday: {
                'alpha.com': { timeMs: 20 * 60 * 1000, visits: 4 },
                'beta.com': { timeMs: 10 * 60 * 1000, visits: 2 }
            },
            statsHistory: {},
            hourlyUsageHistory: {
                [today]: {
                    '09': {
                        timeMs: 10 * 60 * 1000,
                        visits: 1,
                        domains: { 'alpha.com': 10 * 60 * 1000 }
                    },
                    '10': {
                        timeMs: 20 * 60 * 1000,
                        visits: 1,
                        domains: { 'beta.com': 20 * 60 * 1000 }
                    }
                }
            },
            snoozeHistory: {},
            recentlyReset: {},
            snoozedDomains: {
                'www.alpha.com': { expiresAt: Date.now() + 10 * 60 * 1000, minutes: 5 }
            },
            personalInsights: [],
            dismissedInsights: {},
            behaviorHistory: {},
            patternPauseRules: {},
            patternPauseHistory: { events: [], byRule: {} },
            patternPauseDismissals: {},
            patternPauseFreeTrial: {},
            activeBlocks: [],
            scheduledBlocks: [],
            premiumState: { active: false, planName: 'Free' },
            immutableAdminOverrideEnabled: false
        };
        Object.assign(data, clone(overrides));

        const normalizeDomain = (input) => {
            const raw = String(input || '').trim().toLowerCase();
            try {
                return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
            } catch {
                return raw.replace(/^www\./, '').split('/')[0];
            }
        };
        const emitStorageChanges = (items) => {
            const clonedItems = clone(items) || {};
            const changes = {};
            for (const [key, newValue] of Object.entries(clonedItems)) {
                changes[key] = { oldValue: clone(data[key]), newValue: clone(newValue) };
                data[key] = newValue;
            }
            listeners.forEach((listener) => listener(changes, 'local'));
        };
        window.__popupData = data;
        window.__popupMessages = [];
        window.__popupOpenedTabs = [];
        window.__popupFlushCount = 0;
        window.chrome = {
            runtime: {
                id: 'mock-extension-id',
                getURL: (value) => value,
                sendMessage: async (message) => {
                    window.__popupMessages.push(message);
                    if (message?.action === 'flushActiveTimeNow') {
                        window.__popupFlushCount += 1;
                        if (data.flushMutatesStats) {
                            const statsToday = clone(data.statsToday || {});
                            const allStatsToday = clone(data.allStatsToday || {});
                            statsToday['alpha.com'] = {
                                ...(statsToday['alpha.com'] || {}),
                                timeMs: Number(statsToday['alpha.com']?.timeMs || 0) + 1000,
                                visits: Number(statsToday['alpha.com']?.visits || 0)
                            };
                            allStatsToday['alpha.com'] = {
                                ...(allStatsToday['alpha.com'] || {}),
                                timeMs: Number(allStatsToday['alpha.com']?.timeMs || 0) + 1000,
                                visits: Number(allStatsToday['alpha.com']?.visits || 0)
                            };
                            emitStorageChanges({ statsToday, allStatsToday });
                        }
                    }
                    if (message?.action === 'clearDomainSnooze') {
                        const normalized = normalizeDomain(message.domain);
                        if (data.failClearSnoozeMessage) {
                            return { success: false, error: 'clear failed' };
                        }
                        for (const key of Object.keys(data.snoozedDomains)) {
                            if (normalizeDomain(key) === normalized) delete data.snoozedDomains[key];
                        }
                    }
                    if (message?.action === 'toggleDomainLimitEnabled') {
                        const normalized = normalizeDomain(message.domain);
                        const keys = Object.keys(data.blockedDomains).filter((key) => normalizeDomain(key) === normalized);
                        for (const key of keys) data.blockedDomains[key].enabled = message.enabled !== false;
                        if (!keys.length) return { success: false, error: 'Domain not found.' };
                    }
                    if (message?.action === 'toggleScheduledBlockEnabled') {
                        const id = String(message.id || '');
                        const enabled = message.enabled !== false;
                        const index = (data.scheduledBlocks || []).findIndex((block) => block.id === id);
                        if (index < 0) return { success: false, error: 'Schedule not found.' };
                        data.scheduledBlocks[index] = { ...data.scheduledBlocks[index], enabled };
                        if (!enabled) {
                            data.activeBlocks = (data.activeBlocks || []).filter((block) => block.id !== id);
                        }
                    }
                    if (message?.action === 'generateInsights') {
                        const now = Number(message.now || Date.now());
                        const insights = window.StmInsights.analyzeUsagePatterns({
                            statsToday: data.statsToday || {},
                            allStatsToday: data.allStatsToday || data.statsToday || {},
                            statsHistory: data.statsHistory || {},
                            hourlyUsageHistory: data.hourlyUsageHistory || {},
                            blockedDomains: data.blockedDomains || {},
                            activeSession: data.activeSession || null,
                            settings: data.uiSettings || {},
                            now
                        });
                        emitStorageChanges({
                            personalInsights: insights,
                            dismissedInsights: data.dismissedInsights || {},
                            lastInsightAnalysisAt: now
                        });
                        return { success: true, insights: clone(insights) };
                    }
                    if (message?.action === 'dismissInsight') {
                        const id = String(message.id || '');
                        const dismissedInsights = { ...(data.dismissedInsights || {}), [id]: Date.now() };
                        const personalInsights = (data.personalInsights || []).filter((insight) => insight?.id !== id);
                        emitStorageChanges({ dismissedInsights, personalInsights });
                        return { success: true, id };
                    }
                    if (message?.action === 'enablePatternPause') {
                        const normalized = normalizeDomain(message.domain);
                        const now = Date.now();
                        const freeTrial = data.premiumState?.active !== true;
                        const rule = {
                            id: `pattern:${normalized}`,
                            domain: normalized,
                            enabled: true,
                            mode: message.mode === 'ongoing' ? 'ongoing' : 'today',
                            createdAt: now,
                            updatedAt: now,
                            expiresAt: message.mode === 'ongoing' ? 0 : now + 12 * 60 * 60 * 1000,
                            thresholdVisits: Number(message.thresholdVisits || 3),
                            windowMinutes: Number(message.windowMinutes || 30),
                            minSignals: 1,
                            cooldownMinutes: 5,
                            bypassMinutes: 10,
                            sourceInsightType: message.sourceInsightType || 'behavior_pattern',
                            lastTriggeredAt: 0,
                            lastOutcomeAt: 0
                        };
                        emitStorageChanges({
                            patternPauseRules: { ...(data.patternPauseRules || {}), [normalized]: rule },
                            patternPauseDismissals: {
                                ...(data.patternPauseDismissals || {}),
                                [normalized]: undefined
                            },
                            ...(freeTrial ? {
                                patternPauseFreeTrial: {
                                    ruleId: rule.id,
                                    domain: rule.domain,
                                    activatedAt: now,
                                    experiencedAt: 0,
                                    expiresAt: rule.expiresAt
                                }
                            } : {})
                        });
                        return { success: true, rule, freeTrial };
                    }
                    if (message?.action === 'updatePatternPauseRule') {
                        const normalized = normalizeDomain(message.domain);
                        const current = data.patternPauseRules?.[normalized];
                        if (!current) return { success: false, error: 'Pattern pause not found.' };
                        const rule = {
                            ...current,
                            ...(typeof message.enabled === 'boolean' ? { enabled: message.enabled } : {}),
                            ...(message.mode ? { mode: message.mode } : {}),
                            ...(message.thresholdVisits != null ? { thresholdVisits: Number(message.thresholdVisits) } : {}),
                            ...(message.windowMinutes != null ? { windowMinutes: Number(message.windowMinutes) } : {}),
                            updatedAt: Date.now()
                        };
                        emitStorageChanges({
                            patternPauseRules: { ...(data.patternPauseRules || {}), [normalized]: rule }
                        });
                        return { success: true, rule };
                    }
                    if (message?.action === 'dismissPatternPauseSuggestion') {
                        const normalized = normalizeDomain(message.domain);
                        emitStorageChanges({
                            patternPauseDismissals: {
                                ...(data.patternPauseDismissals || {}),
                                [normalized]: { dismissedAt: Date.now(), until: Date.now() + 12 * 60 * 60 * 1000 }
                            }
                        });
                        return { success: true };
                    }
                    if (message?.action === 'trackAnalyticsEvent') {
                        return { success: true, queued: true };
                    }
                    return { success: true };
                }
            },
            management: {
                getSelf: async () => ({
                    id: 'mock-extension-id',
                    installType: runtimeOptions.installType || 'development',
                    enabled: true,
                    type: 'extension'
                })
            },
            storage: {
                local: {
                    get: async (keys) => {
                        const result = {};
                        for (const key of keys) result[key] = clone(data[key]);
                        return result;
                    },
                    set: async (items) => emitStorageChanges(items),
                    remove: async (keys) => {
                        const list = Array.isArray(keys) ? keys : [keys];
                        const changes = {};
                        for (const key of list) {
                            changes[key] = { oldValue: clone(data[key]), newValue: undefined };
                            delete data[key];
                        }
                        listeners.forEach((listener) => listener(changes, 'local'));
                    }
                },
                onChanged: { addListener: (listener) => listeners.push(listener) }
            },
            tabs: {
                create: async (details) => {
                    window.__popupOpenedTabs.push(clone(details));
                    return { id: window.__popupOpenedTabs.length, ...details };
                }
            },
            alarms: { clear: async () => true }
        };
    }, { today: dayKey(), overrides, insightsSource, runtimeOptions });
}

test('storage updates from active website flush do not trap popup in a refresh loop', async ({ page }) => {
    await installPopupChromeMock(page, { flushMutatesStats: true });

    await page.goto(popupUrl());
    await expect(page.locator('#ranking')).toContainText('alpha.com');
    await page.waitForTimeout(250);

    await expect.poll(() => page.evaluate(() => window.__popupFlushCount)).toBe(1);
    await page.locator('label[for="tab2"]').click();
    await expect(page.locator('#tab2')).toBeChecked();
});

test('popup live refresh keeps flushing and repainting visible stats', async ({ page }) => {
    await installPopupChromeMock(page, { flushMutatesStats: true });

    await page.goto(popupUrl());
    await expect(page.locator('#ranking')).toContainText('alpha.com');
    await expect(page.locator('#todaySubtitle')).toContainText('30m');

    await expect.poll(() => page.evaluate(() => window.__popupFlushCount), { timeout: 3500 }).toBeGreaterThanOrEqual(3);
    await expect.poll(() => page.evaluate(() => window.__popupData.statsToday['alpha.com']?.timeMs), { timeout: 3500 })
        .toBeGreaterThanOrEqual((20 * 60 * 1000) + 3000);
    await expect(page.locator('#todaySubtitle')).toContainText('30m');
    await expect(page.locator('#todaySubtitle')).not.toHaveText('NaN');
});

test('popup live refresh updates total screen time chip across minute boundaries', async ({ page }) => {
    await installPopupChromeMock(page, {
        flushMutatesStats: true,
        statsToday: {
            'alpha.com': { timeMs: (29 * 60 * 1000) + 58000, visits: 4 },
            'beta.com': { timeMs: 0, visits: 0 }
        },
        allStatsToday: {
            'alpha.com': { timeMs: (29 * 60 * 1000) + 58000, visits: 4 },
            'beta.com': { timeMs: 0, visits: 0 }
        }
    });

    await page.goto(popupUrl());
    await expect(page.locator('#todaySubtitle')).toContainText('29m');

    await expect.poll(() => page.evaluate(() => window.__popupData.statsToday['alpha.com']?.timeMs), { timeout: 3500 })
        .toBeGreaterThanOrEqual(30 * 60 * 1000);
    await expect(page.locator('#todaySubtitle')).toContainText('30m');
});

test('popup snooze stat handles legacy per-domain history without NaN', async ({ page }) => {
    await installPopupChromeMock(page, {
        snoozeHistory: {
            [dayKey()]: {
                'alpha.com': 2,
                'beta.com': 1
            }
        }
    });

    await page.goto(popupUrl());
    await expect(page.locator('#todayPauseCount')).toHaveText('3');
    await expect(page.locator('#todayPauseCount')).not.toHaveText('NaN');
});

test('selected hourly bar survives live refresh repaint', async ({ page }) => {
    await installPopupChromeMock(page, { flushMutatesStats: true });

    await page.goto(popupUrl());
    await expect(page.locator('#ranking')).toContainText('alpha.com');
    await expect(page.locator('.hourly-slot.is-selected')).toHaveAttribute('data-hour', '10');

    await page.locator('.hourly-slot[data-hour="9"]').click();
    await expect(page.locator('.hourly-slot.is-selected')).toHaveAttribute('data-hour', '9');
    await expect(page.locator('#usageInsight')).toContainText('alpha.com');

    const flushCountAfterSelection = await page.evaluate(() => window.__popupFlushCount);
    await expect.poll(() => page.evaluate(() => window.__popupFlushCount), { timeout: 2500 })
        .toBeGreaterThan(flushCountAfterSelection);

    await expect(page.locator('.hourly-slot.is-selected')).toHaveAttribute('data-hour', '9');
    await expect(page.locator('#usageInsight')).toContainText('alpha.com');
});

test('hourly usage bars scale against the full daily distribution', async ({ page }) => {
    const today = dayKey();
    const hourlyUsage = Object.fromEntries(
        Array.from({ length: 13 }, (_, hour) => [
            String(hour).padStart(2, '0'),
            {
                timeMs: 60 * 60 * 1000,
                visits: 1,
                domains: { 'focus.example': 60 * 60 * 1000 }
            }
        ])
    );
    hourlyUsage['21'] = {
        timeMs: 5 * 60 * 1000,
        visits: 1,
        domains: { 'focus.example': 5 * 60 * 1000 }
    };

    await installPopupChromeMock(page, {
        statsToday: { 'focus.example': { timeMs: (13 * 60 + 5) * 60 * 1000, visits: 14 } },
        allStatsToday: { 'focus.example': { timeMs: (13 * 60 + 5) * 60 * 1000, visits: 14 } },
        hourlyUsageHistory: { [today]: hourlyUsage }
    });

    await page.goto(popupUrl());

    await expect(page.locator('.hourly-slot[data-hour="0"]')).toHaveAttribute('data-height-pct', '31');
    await expect(page.locator('.hourly-slot[data-hour="21"]')).toHaveAttribute('data-height-pct', '6');
    await expect(page.locator('.hourly-slot[data-hour="15"]')).toHaveAttribute('data-height-pct', '0');
});

test('usage graph updates when the stats date range changes', async ({ page }) => {
    const today = dayKey();
    const yesterday = dayKeyOffset(1);

    await installPopupChromeMock(page, {
        statsHistory: {
            [yesterday]: { 'old.example': { timeMs: 45 * 60 * 1000, visits: 3 } }
        },
        hourlyUsageHistory: {
            [today]: {
                '10': {
                    timeMs: 20 * 60 * 1000,
                    visits: 1,
                    domains: { 'today.example': 20 * 60 * 1000 }
                }
            },
            [yesterday]: {
                '14': {
                    timeMs: 45 * 60 * 1000,
                    visits: 3,
                    domains: { 'old.example': 45 * 60 * 1000 }
                }
            }
        }
    });

    await page.goto(popupUrl());
    await expect(page.locator('.hourly-slot.is-selected')).toHaveAttribute('data-hour', '10');
    await expect(page.locator('#usageInsight')).toContainText('today.example');

    await page.locator('#statRange').selectOption('Yesterday');
    await expect(page.locator('.hourly-slot.is-selected')).toHaveAttribute('data-hour', '14');
    await expect(page.locator('#usageInsight')).toContainText('old.example');
});

test('popup dashboard actions add limits, end pauses, and switch hourly bars', async ({ page }) => {
    await installPopupChromeMock(page);
    await page.goto(popupUrl());
    await expect(page.locator('#ranking')).toContainText('alpha.com');

    await expect(page.locator('.hourly-slot.is-selected')).toHaveAttribute('data-hour', '10');
    await page.locator('.hourly-slot[data-hour="9"]').click();
    await expect(page.locator('.hourly-slot.is-selected')).toHaveAttribute('data-hour', '9');
    await expect(page.locator('#usageInsight')).toContainText('alpha.com');

    await page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]').click();
    await expect.poll(() => page.evaluate(() => window.__popupData.snoozedDomains['www.alpha.com'])).toBeUndefined();
    await expect.poll(() => page.evaluate(() => (
        window.__popupMessages.some((message) => message.action === 'clearDomainSnooze' && message.domain === 'alpha.com')
    ))).toBe(true);
    await expect(page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]')).toHaveCount(0);

    const alphaRankingRow = page.locator('#ranking .rank-row', { hasText: 'alpha.com' }).first();
    await alphaRankingRow.hover();
    await alphaRankingRow.locator('[data-action="quick-limit"][data-domain="alpha.com"]').click();
    await expect.poll(() => page.evaluate(() => window.__popupData.blockedDomains['alpha.com']?.limitSeconds)).toBe(1800);
    await expect(page.locator('#tab1')).toBeChecked();
    await expect(page.locator('#limitList')).toContainText('alpha.com');
});

test('pattern pause moves from evidence to trigger tuning and outcome review', async ({ page }) => {
    const now = Date.now();
    const minute = 60 * 1000;
    const events = [
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 24 * minute },
        { type: 'new_tab_quick_nav', domain: 'instagram.com', timestamp: now - 24 * minute + 300 },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 22 * minute },
        { type: 'new_tab_quick_nav', domain: 'instagram.com', timestamp: now - 22 * minute + 300 },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 20 * minute },
        { type: 'new_tab_quick_nav', domain: 'instagram.com', timestamp: now - 20 * minute + 300 },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 18 * minute },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 16 * minute },
        { type: 'new_tab_quick_nav', domain: 'instagram.com', timestamp: now - 16 * minute + 300 },
        { type: 'navigation_visit', domain: 'docs.google.com', timestamp: now - 8 * minute },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 5 * minute },
        { type: 'navigation_visit', domain: 'notion.so', timestamp: now - 2 * minute },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now }
    ];
    await installPopupChromeMock(page, {
        premiumState: { active: true, planName: 'Pro' },
        behaviorHistory: {
            [dayKey(new Date(now))]: { count: events.length, events }
        }
    });

    await page.goto(popupUrl());
    await expect(page.locator('#patternPauseExperience')).toBeVisible();
    await expect(page.locator('#patternPauseSuggestionView')).toBeVisible();
    await expect(page.locator('#p1')).toHaveAttribute('data-summary-scenario', 'pattern-pause');
    await expect(page.locator('#p1 > .today-card')).toBeHidden();
    await expect(page.locator('#streakHeader')).toBeVisible();
    await expect(page.locator('#upgradeBtnHeader')).toBeVisible();
    await expect(page.locator('#p1 > .journey-card')).toBeVisible();
    await expect(page.locator('#patternSuggestionHeading')).toHaveText(
        'Add a gentle check-in before Instagram?'
    );
    await expect(page.locator('#patternVisitCount')).toHaveText('7 times');
    await expect(page.locator('#patternOriginStat')).toHaveAttribute('data-pattern-origin', 'new-tab');
    await expect(page.locator('#patternOriginCount')).toHaveText('4 visits');
    await expect(page.locator('#patternOriginCopy')).toHaveText('from a new tab');
    await expect(page.locator('#patternTimelineTrack .pattern-site-node')).toHaveCount(5);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-icon img')).toHaveCount(5);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-icon.has-favicon')).toHaveCount(5);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node small')).toHaveText([
        'instagram.com',
        'docs.google.com',
        'instagram.com',
        'notion.so',
        'instagram.com'
    ]);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-action > span')).toHaveText([
        'new tab',
        'switched',
        'existing tab',
        'switched',
        'existing tab'
    ]);
    const arrowGeometry = await page.evaluate(() => {
        const timeline = document.querySelector('.pattern-timeline');
        const targets = Array.from(
            timeline.querySelectorAll('.pattern-site-node.is-target .pattern-site-node-icon')
        );
        const arcs = Array.from(document.querySelectorAll('#patternReturnArcs .pattern-return-arc'));
        const timelineBox = timeline.getBoundingClientRect();
        return {
            targetCount: targets.length,
            arcCount: arcs.length,
            pairs: arcs.map((arc, index) => {
                const startIcon = targets[index].getBoundingClientRect();
                const endIcon = targets[index + 1].getBoundingClientRect();
                const startNode = targets[index].closest('.pattern-site-node').getBoundingClientRect();
                const arcBox = arc.getBoundingClientRect();
                return {
                    startCenter: startIcon.left + startIcon.width / 2,
                    endCenter: endIcon.left + endIcon.width / 2,
                    arcLeft: arcBox.left,
                    arcRight: arcBox.right,
                    arcTop: arcBox.top,
                    startNodeBottom: startNode.bottom,
                    contained: arcBox.left >= timelineBox.left && arcBox.right <= timelineBox.right
                };
            })
        };
    });
    expect(arrowGeometry.targetCount).toBe(3);
    expect(arrowGeometry.arcCount).toBe(2);
    arrowGeometry.pairs.forEach((pair) => {
        expect(Math.abs(pair.arcLeft - pair.startCenter)).toBeLessThan(2);
        expect(Math.abs(pair.arcRight - pair.endCenter)).toBeLessThan(2);
        expect(pair.arcTop).toBeGreaterThan(pair.startNodeBottom);
        expect(pair.contained).toBe(true);
    });

    const dashboardSlotGeometry = await page.evaluate(() => {
        const pattern = document.querySelector('#patternPauseExperience').getBoundingClientRect();
        const journey = document.querySelector('#p1 > .journey-card').getBoundingClientRect();
        const preservedCards = [
            '.journey-card',
            '.ranking-card',
            '.visits-card',
            '.usage-card'
        ];
        return {
            patternTop: pattern.top,
            patternBottom: pattern.bottom,
            journeyTop: journey.top,
            allPreserved: preservedCards.every((selector) =>
                getComputedStyle(document.querySelector(`#p1 > ${selector}`)).display !== 'none'
            )
        };
    });
    expect(dashboardSlotGeometry.patternTop).toBeGreaterThan(0);
    expect(dashboardSlotGeometry.journeyTop).toBeGreaterThanOrEqual(
        dashboardSlotGeometry.patternBottom + 9
    );
    expect(dashboardSlotGeometry.allPreserved).toBe(true);

    const integratedStyles = await page.evaluate(() => {
        const observation = document.querySelector('.pattern-observation-card');
        const suggestion = document.querySelector('.pattern-suggestion-panel');
        const heading = document.querySelector('.pattern-attention-heading h1');
        const subtitle = document.querySelector('.pattern-attention-heading p');
        const primary = document.querySelector('#enablePatternPauseBtn');
        const secondary = document.querySelector('#dismissPatternPauseBtn');
        return {
            observationRadius: getComputedStyle(observation).borderRadius,
            suggestionRadius: getComputedStyle(suggestion).borderRadius,
            suggestionBorderTop: getComputedStyle(suggestion).borderTopWidth,
            suggestionBackground: getComputedStyle(suggestion).backgroundImage,
            combinedCard: suggestion.parentElement === observation,
            disclaimerCount: document.querySelectorAll('.pattern-privacy-note').length,
            headingFont: getComputedStyle(heading).fontFamily,
            headingSize: getComputedStyle(heading).fontSize,
            subtitleColor: getComputedStyle(subtitle).color,
            primaryWidth: primary.getBoundingClientRect().width,
            primaryHeight: primary.getBoundingClientRect().height,
            primaryRadius: getComputedStyle(primary).borderRadius,
            secondaryWidth: secondary.getBoundingClientRect().width
        };
    });
    expect(integratedStyles.observationRadius).toBe('20px');
    expect(integratedStyles.suggestionRadius).toBe('0px');
    expect(integratedStyles.suggestionBorderTop).toBe('1px');
    expect(integratedStyles.suggestionBackground).toBe('none');
    expect(integratedStyles.combinedCard).toBe(true);
    expect(integratedStyles.disclaimerCount).toBe(0);
    expect(integratedStyles.headingFont).toContain('Inter');
    expect(integratedStyles.headingSize).toBe('22px');
    expect(integratedStyles.subtitleColor).toBe('rgb(143, 217, 227)');
    expect(integratedStyles.primaryWidth).toBe(120);
    expect(integratedStyles.primaryHeight).toBe(30);
    expect(integratedStyles.primaryRadius).toBe('9px');
    expect(integratedStyles.secondaryWidth).toBe(98);
    await expect(page.locator('#adjustPatternPauseBtn')).toHaveAttribute(
        'aria-label',
        'Adjust pattern trigger'
    );
    await expect(page.locator('#adjustPatternPauseBtn svg')).toHaveCount(1);
    const adjustButtonStyle = await page.locator('#adjustPatternPauseBtn').evaluate((button) => ({
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
        background: getComputedStyle(button).backgroundColor
    }));
    expect(adjustButtonStyle).toEqual({
        width: 30,
        height: 30,
        background: 'rgba(0, 0, 0, 0)'
    });

    await page.locator('#adjustPatternPauseBtn').click();
    await expect(page.locator('#patternTriggerOverlay')).toBeVisible();
    await page.locator('.pattern-trigger-option', {
        hasText: 'After 5 visits in 30 minutes'
    }).click();
    await page.locator('#savePatternTriggerBtn').click();
    await expect(page.locator('#patternPauseFeedback')).toBeEmpty();

    await page.locator('#enablePatternPauseBtn').click();
    await expect(page.locator('#patternPauseReviewView')).toBeVisible();
    await expect(page.locator('#p1')).toHaveAttribute('data-summary-scenario', 'pattern-pause-review');
    await expect(page.locator('#patternReviewTitle')).toHaveText(
        'Instagram pattern pause'
    );
    await expect(page.locator('#patternTriggerCopy')).toContainText(
        '5 repeated visits within 30 minutes'
    );
    await expect.poll(() => page.evaluate(() => (
        window.__popupData.patternPauseRules['instagram.com']?.thresholdVisits
    ))).toBe(5);

    await page.evaluate(async () => {
        const ruleId = window.__popupData.patternPauseRules['instagram.com'].id;
        const at = Date.now();
        await chrome.storage.local.set({
            patternPauseHistory: {
                byRule: {
                    [ruleId]: { shown: 3, continued: 2, closed: 1, lastAt: at }
                },
                events: [
                    { ruleId, domain: 'instagram.com', type: 'continued', timestamp: at - 120000 },
                    { ruleId, domain: 'instagram.com', type: 'closed', timestamp: at - 60000 },
                    { ruleId, domain: 'instagram.com', type: 'continued', timestamp: at }
                ]
            }
        });
    });
    await expect(page.locator('#patternShownCount')).toHaveText('3');
    await expect(page.locator('#patternContinuedCount')).toHaveText('2');
    await expect(page.locator('#patternClosedCount')).toHaveText('1');
    await expect(page.locator('#patternOutcomeRail')).toContainText('Closed tab');
    await expect(page.locator('#turnOffPatternPauseBtn')).toHaveCount(0);
    await expect(page.locator('#patternPauseToggle')).toHaveAttribute('aria-checked', 'true');

    await page.locator('#keepPatternPauseBtn').click();
    await expect(page.locator('#patternReviewStatus')).toContainText(
        'Continues until you turn it off'
    );
    await page.locator('#patternPauseToggle').click();
    await expect(page.locator('#patternPauseReviewView')).toBeVisible();
    await expect(page.locator('#patternPauseToggle')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#patternPauseToggle')).toHaveAttribute('aria-label', 'Turn Pattern Pause on');
    await expect(page.locator('#patternReviewStatus')).toContainText('Off');
    await expect(page.locator('#patternPauseFeedback')).toBeEmpty();

    await page.locator('#patternPauseToggle').click();
    await expect(page.locator('#patternPauseToggle')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#patternPauseToggle')).toHaveAttribute('aria-label', 'Turn Pattern Pause off');
    await expect(page.locator('#patternReviewStatus')).toContainText('Continues until you turn it off');
});

test('free users can activate one full Pattern Pause preview', async ({ page }) => {
    const now = Date.now();
    const minute = 60 * 1000;
    const events = [
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 10 * minute },
        { type: 'new_tab_quick_nav', domain: 'instagram.com', timestamp: now - 10 * minute + 300 },
        { type: 'navigation_visit', domain: 'docs.google.com', timestamp: now - 6 * minute },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 4 * minute },
        { type: 'new_tab_quick_nav', domain: 'instagram.com', timestamp: now - 4 * minute + 300 },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now }
    ];
    await installPopupChromeMock(page, {
        premiumState: { active: false, planName: 'Free' },
        behaviorHistory: {
            [dayKey(new Date(now))]: { count: events.length, events }
        }
    });

    await page.goto(popupUrl());

    await expect(page.locator('#patternPauseExperience')).toBeVisible();
    await expect(page.locator('#patternTimelineTrack')).toBeVisible();
    await expect(page.locator('#patternSuggestionCopy')).toContainText(
        'automatic habit check-in free'
    );
    await expect(page.locator('#enablePatternPauseBtn')).toHaveText('Try Pattern Pause free');
    await expect(page.locator('#patternTimelineTrack .is-locked')).toHaveCount(0);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-icon.has-favicon')).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => (
        window.__popupData.uiSettings.insightNotificationsEnabled
    ))).toBe(true);

    await page.locator('#enablePatternPauseBtn').click();

    await expect(page.locator('#patternPauseReviewView')).toBeVisible();
    await expect(page.locator('#patternReviewStatus')).toContainText('Free preview');
    await expect(page.locator('#keepPatternPauseBtn')).toContainText('Unlock future pattern pauses');
    await expect(page.locator('#turnOffPatternPauseBtn')).toHaveCount(0);
    await expect(page.locator('#patternPauseToggle')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#patternPauseFeedback')).toBeEmpty();
    await expect.poll(() => page.evaluate(() => window.__popupOpenedTabs)).toEqual([]);
    await expect.poll(() => page.evaluate(() => (
        window.__popupMessages.some((message) => message.action === 'enablePatternPause')
    ))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__popupData.patternPauseFreeTrial)).toEqual(
        expect.objectContaining({
            ruleId: 'pattern:instagram.com',
            domain: 'instagram.com',
            experiencedAt: 0
        })
    );
});

test('used Pattern Pause trial keeps evidence visible but locks detail and future activation', async ({ page }) => {
    const now = Date.now();
    const minute = 60 * 1000;
    const events = [
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 10 * minute },
        { type: 'new_tab_quick_nav', domain: 'instagram.com', timestamp: now - 10 * minute + 300 },
        { type: 'navigation_visit', domain: 'docs.google.com', timestamp: now - 6 * minute },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now - 4 * minute },
        { type: 'new_tab_quick_nav', domain: 'instagram.com', timestamp: now - 4 * minute + 300 },
        { type: 'navigation_visit', domain: 'instagram.com', timestamp: now }
    ];
    await installPopupChromeMock(page, {
        premiumState: { active: false, planName: 'Free' },
        patternPauseFreeTrial: {
            ruleId: 'pattern:reddit.com',
            domain: 'reddit.com',
            activatedAt: now - 24 * 60 * minute,
            experiencedAt: now - 23 * 60 * minute,
            expiresAt: now - 12 * 60 * minute
        },
        behaviorHistory: {
            [dayKey(new Date(now))]: { count: events.length, events }
        }
    });

    await page.goto(popupUrl());

    await expect(page.locator('#patternVisitCount')).not.toHaveText('0 times');
    await expect(page.locator('#patternSuggestionCopy')).toContainText('used your free Pattern Pause');
    await expect(page.locator('#patternSuggestionCopy')).toContainText('$10 one-time');
    await expect(page.locator('#patternTimelineAccessLabel')).toContainText('Pro preview');
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-icon.has-favicon')).toHaveCount(4);
    const firstIcon = page.locator('#patternTimelineTrack .pattern-site-node-icon').first();
    await expect.poll(() => firstIcon.evaluate((icon) => {
        const image = icon.querySelector('img');
        const fallback = icon.querySelector('.pattern-favicon-fallback');
        return {
            source: image?.getAttribute('src') || '',
            naturalWidth: image?.naturalWidth || 0,
            imageOpacity: image ? getComputedStyle(image).opacity : '',
            imageTransitionDuration: image ? getComputedStyle(image).transitionDuration : '',
            fallbackOpacity: fallback ? getComputedStyle(fallback).opacity : ''
        };
    })).toEqual({
        source: expect.stringMatching(/assets\/site-icons\/instagram\.svg$/),
        naturalWidth: expect.any(Number),
        imageOpacity: '1',
        imageTransitionDuration: '0s',
        fallbackOpacity: '0'
    });
    await expect(page.locator('#patternTimelineTrack .is-locked')).toHaveCount(2);
    await expect(page.locator('#adjustPatternPauseBtn')).toHaveAttribute('class', 'pattern-icon-btn');
    await expect(page.locator('#enablePatternPauseBtn')).toHaveText('Unlock with Pro');

    await page.locator('#enablePatternPauseBtn').click();

    const expectedCheckoutUrl = `${WHOP_CHECKOUT_START_URL}?ext=mock-extension-id`;
    await expect.poll(() => page.evaluate(() => window.__popupOpenedTabs.map((tab) => tab.url))).toEqual([
        expectedCheckoutUrl
    ]);
    await expect.poll(() => page.evaluate(() => (
        window.__popupMessages.some((message) => message.action === 'enablePatternPause')
    ))).toBe(false);
});

test('pattern summary compresses a homogeneous new-tab loop', async ({ page }) => {
    const now = Date.now();
    const minute = 60 * 1000;
    const events = [20, 16, 12, 8, 4, 1].flatMap((minutesAgo) => {
        const timestamp = now - minutesAgo * minute;
        return [
            { type: 'navigation_visit', domain: 'youtube.com', timestamp },
            { type: 'new_tab_quick_nav', domain: 'youtube.com', timestamp: timestamp + 300 }
        ];
    });
    await installPopupChromeMock(page, {
        behaviorHistory: {
            [dayKey(new Date(now))]: { count: events.length, events }
        }
    });

    await page.goto(popupUrl());
    await expect(page.locator('#patternSuggestionHeading')).toHaveText(
        'Add a gentle check-in before YouTube?'
    );
    await expect(page.locator('#patternVisitCount')).toHaveText('6 times');
    await expect(page.locator('#patternOriginStat')).toHaveAttribute('data-pattern-origin', 'new-tab');
    await expect(page.locator('#patternOriginCount')).toHaveText('6 visits');
    await expect(page.locator('#patternOriginCopy')).toHaveText('from a new tab');
    await expect(page.locator('#patternTimelineTrack .pattern-site-node')).toHaveCount(3);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node small')).toHaveText([
        'youtube.com',
        'youtube.com',
        'youtube.com'
    ]);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-action > span')).toHaveText([
        'new tab',
        'new tab',
        'new tab'
    ]);
    await expect(page.locator('#patternReturnArcs .pattern-return-arc')).toHaveCount(2);
});

test('pattern summary describes returns after closing a tab', async ({ page }) => {
    const now = Date.now();
    const minute = 60 * 1000;
    const events = [
        { type: 'navigation_visit', domain: 'reddit.com', timestamp: now - 18 * minute },
        { type: 'return_after_close', domain: 'reddit.com', timestamp: now - 18 * minute + 300 },
        { type: 'navigation_visit', domain: 'docs.google.com', timestamp: now - 12 * minute },
        { type: 'navigation_visit', domain: 'reddit.com', timestamp: now - 9 * minute },
        { type: 'return_after_close', domain: 'reddit.com', timestamp: now - 9 * minute + 300 },
        { type: 'navigation_visit', domain: 'mail.google.com', timestamp: now - 4 * minute },
        { type: 'navigation_visit', domain: 'reddit.com', timestamp: now - minute }
    ];
    await installPopupChromeMock(page, {
        behaviorHistory: {
            [dayKey(new Date(now))]: { count: events.length, events }
        }
    });

    await page.goto(popupUrl());
    await expect(page.locator('#patternSuggestionHeading')).toHaveText(
        'Add a gentle check-in before Reddit?'
    );
    await expect(page.locator('#patternOriginStat')).toHaveAttribute('data-pattern-origin', 'after-close');
    await expect(page.locator('#patternOriginCount')).toHaveText('2 visits');
    await expect(page.locator('#patternOriginCopy')).toHaveText('after closing a tab');
    await expect(page.locator('#patternTimelineTrack .pattern-site-node small')).toHaveText([
        'reddit.com',
        'docs.google.com',
        'reddit.com',
        'gmail.com',
        'reddit.com'
    ]);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-action > span')).toHaveText([
        'reopened',
        'switched',
        'reopened',
        'switched',
        'existing tab'
    ]);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-icon.has-favicon')).toHaveCount(5);
    await expect(page.locator('#patternTimelineTrack img[data-pattern-domain="reddit.com"]').first()).toHaveAttribute(
        'src',
        /assets\/site-icons\/reddit\.svg$/
    );
    await expect(page.locator('#patternReturnArcs .pattern-return-arc')).toHaveCount(2);
});

test('pattern summary describes interspersed visits from existing tabs', async ({ page }) => {
    const now = Date.now();
    const minute = 60 * 1000;
    const events = [
        { type: 'navigation_visit', domain: 'notion.so', timestamp: now - 24 * minute },
        { type: 'navigation_visit', domain: 'docs.google.com', timestamp: now - 20 * minute },
        { type: 'navigation_visit', domain: 'notion.so', timestamp: now - 16 * minute },
        { type: 'navigation_visit', domain: 'mail.google.com', timestamp: now - 12 * minute },
        { type: 'navigation_visit', domain: 'notion.so', timestamp: now - 8 * minute },
        { type: 'navigation_visit', domain: 'youtube.com', timestamp: now - 4 * minute },
        { type: 'navigation_visit', domain: 'notion.so', timestamp: now - minute }
    ];
    await installPopupChromeMock(page, {
        behaviorHistory: {
            [dayKey(new Date(now))]: { count: events.length, events }
        }
    });

    await page.goto(popupUrl());
    await expect(page.locator('#patternSuggestionHeading')).toHaveText(
        'Add a gentle check-in before Notion?'
    );
    await expect(page.locator('#patternOriginStat')).toHaveAttribute('data-pattern-origin', 'existing-tab');
    await expect(page.locator('#patternOriginCount')).toHaveText('4 visits');
    await expect(page.locator('#patternOriginCopy')).toHaveText('from existing tabs');
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-action > span')).toHaveText([
        'existing tab',
        'switched',
        'existing tab',
        'switched',
        'existing tab'
    ]);
    await expect(page.locator('#patternReturnArcs .pattern-return-arc')).toHaveCount(2);
});

test('unpacked build previews dynamic Pattern Pause scenarios without mutating live data', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await installPopupChromeMock(page, {
        uiSettings: { patternPausesEnabled: false }
    });
    await page.setViewportSize({ width: 560, height: 570 });
    await page.goto(popupUrl());
    await expect(page).toHaveTitle(/Saturn/i);

    await page.locator('#settingsCogBtn').click();
    await expect(page.locator('#patternPreviewSettingsCard')).toBeVisible();
    await page.locator('#launchPatternPreviewBtn').click();

    await expect(page.locator('#patternPreviewToolbar')).toBeVisible();
    await expect(page.locator('#settingsOverlay')).toBeHidden();
    await expect(page.locator('#patternPreviewScenarioSelect')).toHaveValue('mixed');
    await expect(page.locator('#p1')).toHaveAttribute(
        'data-summary-scenario',
        'pattern-pause-preview-mixed'
    );
    await expect(page.locator('#patternVisitCount')).toHaveText('4 times');
    await expect(page.locator('#patternOriginStat')).toHaveAttribute('data-pattern-origin', 'new-tab');
    await expect(page.locator('#patternOriginCount')).toHaveText('2 visits');
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-action > span')).toHaveText([
        'existing tab',
        'switched',
        'reopened',
        'switched',
        'new tab'
    ]);
    const previewLayout = await page.evaluate(() => {
        const toolbar = document.querySelector('#patternPreviewToolbar').getBoundingClientRect();
        const card = document.querySelector('.pattern-observation-card').getBoundingClientRect();
        return {
            horizontalOverflow:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
            toolbarInsideViewport: toolbar.left >= 0 && toolbar.right <= window.innerWidth,
            cardInsideViewport: card.left >= 0 && card.right <= window.innerWidth,
            spacing: card.top - toolbar.bottom
        };
    });
    expect(previewLayout.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(previewLayout.toolbarInsideViewport).toBe(true);
    expect(previewLayout.cardInsideViewport).toBe(true);
    expect(previewLayout.spacing).toBeGreaterThanOrEqual(7);

    await page.locator('#patternPreviewScenarioSelect').selectOption('new-tab');
    await expect(page.locator('#p1')).toHaveAttribute(
        'data-summary-scenario',
        'pattern-pause-preview-new-tab'
    );
    await expect(page.locator('#patternSuggestionHeading')).toHaveText(
        'Add a gentle check-in before YouTube?'
    );
    await expect(page.locator('#patternVisitCount')).toHaveText('6 times');
    await expect(page.locator('#patternOriginCount')).toHaveText('6 visits');
    await expect(page.locator('#patternOriginCopy')).toHaveText('from a new tab');
    await expect(page.locator('#patternTimelineTrack .pattern-site-node')).toHaveCount(3);
    await expect(page.locator('#patternReturnArcs .pattern-return-arc')).toHaveCount(2);

    await page.locator('#patternPreviewScenarioSelect').selectOption('existing-tab');
    await expect(page.locator('#patternSuggestionHeading')).toHaveText(
        'Add a gentle check-in before Instagram?'
    );
    await expect(page.locator('#patternVisitCount')).toHaveText('4 times');
    await expect(page.locator('#patternOriginStat')).toHaveAttribute('data-pattern-origin', 'existing-tab');
    await expect(page.locator('#patternOriginCount')).toHaveText('4 visits');
    await expect(page.locator('#patternOriginCopy')).toHaveText('from existing tabs');

    await page.locator('#patternPreviewScenarioSelect').selectOption('single-return');
    await expect(page.locator('#p1')).toHaveAttribute(
        'data-summary-scenario',
        'pattern-pause-preview-single-return'
    );
    await expect(page.locator('#patternVisitCount')).toHaveText('4 times');
    await expect(page.locator('#patternTimelineTrack .pattern-site-node small')).toHaveText([
        'notion.so',
        'youtube.com',
        'instagram.com',
        'docs.google.com',
        'instagram.com'
    ]);
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-action > span')).toHaveText([
        'switched',
        'switched',
        'existing tab',
        'switched',
        'existing tab'
    ]);
    await expect(page.locator('#patternReturnArcs .pattern-return-arc')).toHaveCount(1);
    const timelineType = await page.evaluate(() => {
        const timeline = document.querySelector('.pattern-timeline');
        const icon = document.querySelector('.pattern-site-node-icon');
        const domain = document.querySelector('.pattern-site-node small');
        const action = document.querySelector('.pattern-site-node-action');
        const time = document.querySelector('.pattern-site-node time');
        return {
            timelineHeight: timeline.getBoundingClientRect().height,
            iconSize: icon.getBoundingClientRect().width,
            domainFontSize: parseFloat(getComputedStyle(domain).fontSize),
            actionFontSize: parseFloat(getComputedStyle(action).fontSize),
            timeFontSize: parseFloat(getComputedStyle(time).fontSize)
        };
    });
    expect(timelineType.timelineHeight).toBeGreaterThanOrEqual(142);
    expect(timelineType.iconSize).toBe(38);
    expect(timelineType.domainFontSize).toBeGreaterThanOrEqual(10);
    expect(timelineType.actionFontSize).toBeGreaterThanOrEqual(9.5);
    expect(timelineType.timeFontSize).toBeGreaterThanOrEqual(9);
    await page.locator('#patternPreviewScenarioSelect').selectOption('reopen');
    await expect(page.locator('#patternSuggestionHeading')).toHaveText(
        'Add a gentle check-in before Reddit?'
    );
    await expect(page.locator('#patternVisitCount')).toHaveText('3 times');
    await expect(page.locator('#patternOriginStat')).toHaveAttribute('data-pattern-origin', 'after-close');
    await expect(page.locator('#patternOriginCount')).toHaveText('3 visits');
    await expect(page.locator('#patternOriginCopy')).toHaveText('after closing a tab');
    await expect(page.locator('#patternTimelineTrack .pattern-site-node-action > span')).toHaveText([
        'reopened',
        'reopened',
        'reopened'
    ]);
    await expect(page.locator('#patternTimelineTrack img[data-pattern-domain="reddit.com"]').first()).toHaveAttribute(
        'src',
        /assets\/site-icons\/reddit\.svg$/
    );
    await expect(page.locator('#patternReturnArcs .pattern-return-arc')).toHaveCount(2);
    await page.locator('#enablePatternPauseBtn').click();
    await expect(page.locator('#patternPauseFeedback')).toContainText('no rule was created');
    await page.locator('#dismissPatternPauseBtn').click();
    await expect(page.locator('#patternPauseFeedback')).toContainText('compare another scenario');
    await expect.poll(() => page.evaluate(() => window.__popupMessages.filter(
        (message) => ['enablePatternPause', 'dismissPatternPauseSuggestion'].includes(message.action)
    ).length)).toBe(0);
    await expect.poll(() => page.evaluate(() => Object.keys(window.__popupData.patternPauseRules).length)).toBe(0);
    await expect.poll(() => page.evaluate(() => Object.keys(window.__popupData.patternPauseDismissals).length)).toBe(0);

    await page.locator('#exitPatternPreviewBtn').click();
    await expect(page.locator('#patternPreviewToolbar')).toBeHidden();
    await expect(page.locator('#p1')).toHaveAttribute('data-summary-scenario', 'daily');
    await expect(page.locator('#p1 > .today-card')).toBeVisible();
    expect(consoleErrors).toEqual([]);
});

test('published install hides and rejects developer scenario preview', async ({ page }) => {
    await installPopupChromeMock(page, {}, { installType: 'normal' });
    await page.goto(popupUrl());

    await page.locator('#settingsCogBtn').click();
    await expect(page.locator('#patternPreviewSettingsCard')).toBeHidden();
    await page.locator('#launchPatternPreviewBtn').evaluate((button) => button.click());
    await expect(page.locator('#patternPreviewToolbar')).toBeHidden();
    await expect(page.locator('#p1')).toHaveAttribute('data-summary-scenario', 'daily');
});

test('fresh install with no usage history does not show insights', async ({ page }) => {
    await installPopupChromeMock(page, {
        uiSettings: {
            defaultLimitMinutes: 30,
            use24HourTime: false,
            limitNotificationsEnabled: true,
            personalInsightsEnabled: true,
            insightNotificationsEnabled: true,
            insightMaxNotificationsPerDay: 1,
            insightSensitivity: 'normal'
        },
        blockedDomains: {},
        statsToday: {},
        allStatsToday: {},
        statsHistory: {},
        hourlyUsageHistory: {},
        snoozeHistory: {},
        snoozedDomains: {},
        personalInsights: [],
        dismissedInsights: {},
        activeSession: null,
        activeBlocks: [],
        scheduledBlocks: []
    });

    await page.goto(popupUrl());

    await expect.poll(() => page.evaluate(() => (
        window.__popupMessages.some((message) => message.action === 'generateInsights')
    ))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__popupData.personalInsights?.length || 0)).toBe(0);
    await expect(page.locator('#todayPullLabel')).toHaveText('Strongest pull');
    await expect(page.locator('#todayPullCopy')).toContainText('No strong pulls');
});

test('stored insights are hidden and untracked until enough usage history exists', async ({ page }) => {
    const today = dayKey();
    await installPopupChromeMock(page, {
        statsToday: {
            'youtube.com': { timeMs: 40 * 60 * 1000, visits: 2 }
        },
        allStatsToday: {
            'youtube.com': { timeMs: 40 * 60 * 1000, visits: 2 }
        },
        statsHistory: {},
        hourlyUsageHistory: {},
        personalInsights: [
            {
                id: `long_session:youtube.com:${today}`,
                type: 'long_session',
                domain: 'youtube.com',
                title: 'YouTube is holding your attention right now',
                message: 'Active for 40 minutes straight',
                action: 'viewUsage',
                priority: 100,
                timestamp: Date.now(),
                dateKey: today,
                context: { durationMs: 40 * 60 * 1000 }
            }
        ],
        dismissedInsights: {}
    });

    await page.goto(popupUrl());

    await expect.poll(() => page.evaluate(() => window.__popupData.personalInsights?.length || 0)).toBe(0);
    await expect(page.locator('#todayPullLabel')).toHaveText('Strongest pull');
    await expect(page.locator('#todayPullCopy')).not.toContainText('holding your attention');
    await expect.poll(() => page.evaluate(() => (
        window.__popupMessages.filter((message) => (
            message.action === 'trackAnalyticsEvent'
            && ['insight_presented', 'insight_viewed'].includes(message.eventName)
        )).length
    ))).toBe(0);
});

test('external upgrade and billing buttons open intended destinations', async ({ page }) => {
    await installPopupChromeMock(page, {
        blockedDomains: {
            'alpha.com': { enabled: true, limitSeconds: 60, tier: 'standard' },
            'beta.com': { enabled: true, limitSeconds: 60, tier: 'standard' },
            'gamma.com': { enabled: true, limitSeconds: 60, tier: 'standard' }
        },
        scheduledBlocks: [{
            id: 'schedule-alpha',
            domain: 'alpha.com',
            startTime: '09:00',
            endTime: '17:00',
            days: [1],
            enabled: true,
            tier: 'standard'
        }]
    });

    await page.goto(popupUrl());
    const expectedCheckoutUrl = `${WHOP_CHECKOUT_START_URL}?ext=mock-extension-id`;

    await page.locator('#upgradeBtnHeader').click();
    await page.locator('label[for="tab2"]').click();
    await expect(page.locator('#limitsPaywallCard')).toBeVisible();
    await page.locator('#upgradeBtnFromLimits').click();
    await page.locator('label[for="tab3"]').click();
    await expect(page.locator('#schedulePaywallCard')).toBeVisible();
    await page.locator('#upgradeBtnFromSchedule').click();
    await page.locator('label[for="tab4"]').click();
    await page.locator('#upgradeBtnFromProfile').click();
    await page.locator('#settingsCogBtn').click();
    await expect(page.locator('#settingsOverlay')).toHaveClass(/is-visible/);
    await page.locator('#upgradeBtnFromSettings').click();
    await page.locator('#manageWhopBtn').click();

    await expect.poll(() => page.evaluate(() => window.__popupOpenedTabs.map((tab) => tab.url))).toEqual([
        expectedCheckoutUrl,
        expectedCheckoutUrl,
        expectedCheckoutUrl,
        expectedCheckoutUrl,
        expectedCheckoutUrl,
        WHOP_MANAGE_URL
    ]);
});

test('feedback and Chrome review buttons open intended destinations', async ({ page }) => {
    await installPopupChromeMock(page);

    await page.goto(popupUrl());
    await page.evaluate(() => {
        const toast = document.getElementById('reviewPromptToast');
        toast.hidden = false;
        toast.classList.add('is-visible');
    });
    await page.locator('#giveFeedbackToastBtn').click();

    await page.evaluate(() => {
        const toast = document.getElementById('reviewPromptToast');
        toast.hidden = false;
        toast.classList.add('is-visible');
    });
    await page.locator('#leaveReviewToastBtn').click();

    await expect.poll(() => page.evaluate(() => window.__popupOpenedTabs.map((tab) => tab.url))).toEqual([
        SURVEYMONKEY_FEEDBACK_URL,
        CHROME_WEBSTORE_REVIEW_URL
    ]);
    await expect.poll(() => page.evaluate(() => Boolean(window.__popupData.reviewPromptState?.feedbackClickedAt))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(window.__popupData.reviewPromptState?.reviewedAt))).toBe(true);
});

test('journey card can be collapsed without using experience mode settings', async ({ page }) => {
    await installPopupChromeMock(page);

    await page.goto(popupUrl());
    await expect(page.locator('#experienceMode')).toHaveCount(0);
    await expect(page.locator('#journeyCard')).not.toHaveClass(/is-collapsed/);
    const expandedToggleBox = await page.locator('#journeyToggleBtn').boundingBox();

    await page.locator('#journeyToggleBtn').click();

    await expect(page.locator('#journeyCard')).toHaveClass(/is-collapsed/);
    await expect(page.locator('#journeyToggleBtn')).toHaveText('');
    await expect(page.locator('#journeyToggleBtn')).toHaveAttribute('aria-label', 'Show journey');
    await expect(page.locator('#journeyCollapsedTitle')).toBeVisible();
    await expect(page.locator('#journeyCollapsedTitle')).toHaveText('Journey');
    const collapsedToggleBox = await page.locator('#journeyToggleBtn').boundingBox();
    expect(collapsedToggleBox?.width).toBe(expandedToggleBox?.width);
    expect(collapsedToggleBox?.height).toBe(expandedToggleBox?.height);
    await expect.poll(() => page.evaluate(() => window.__popupData.uiSettings?.journeyCollapsed)).toBe(true);
});

test('journey percentage does not scroll when the displayed value is unchanged', async ({ page }) => {
    await installPopupChromeMock(page);

    await page.goto(popupUrl());
    await expect(page.locator('#journeyProgressPct')).toHaveAttribute('aria-label', '0%');

    await page.evaluate(() => {
        window.animateJourneyPercent(12, true);
    });
    await expect(page.locator('#journeyProgressPct')).toHaveClass(/is-scrolling/);

    await page.evaluate(() => {
        window.animateJourneyPercent(12, true);
    });
    await expect(page.locator('#journeyProgressPct')).not.toHaveClass(/is-scrolling/);
    await expect(page.locator('#journeyProgressPct')).toHaveAttribute('aria-label', '12%');
});

test('mock insight data populates the Today summary insight slot', async ({ page }) => {
    await installPopupChromeMock(page, insightMockUsageData());

    await page.goto(popupUrl());

    await expect(page.locator('#todayPullLabel')).toContainText(/Pattern insight|Today's progress/);
    await expect(page.locator('#todayPullCopy')).toContainText(/YouTube|Reddit|LinkedIn|impulses|reclaimed/);
    await expect(page.locator('#todayPullCopy')).not.toContainText('Preview insight');
    await expect.poll(() => page.evaluate(() => window.__popupData.personalInsights?.length || 0)).toBeGreaterThan(0);
});

test('limit list switches and remove buttons work from visible controls', async ({ page }) => {
    await installPopupChromeMock(page, {
        blockedDomains: {
            'alpha.com': { enabled: true, limitSeconds: 60, tier: 'standard' },
            'beta.com': { enabled: true, limitSeconds: 60, tier: 'standard' }
        },
        statsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 },
            'beta.com': { timeMs: 10 * 1000, visits: 1 }
        },
        allStatsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 },
            'beta.com': { timeMs: 10 * 1000, visits: 1 }
        },
        snoozedDomains: {}
    });

    await page.goto(popupUrl());
    await page.locator('label[for="tab2"]').click();

    const alphaRow = page.locator('#limitList .row-limit').filter({ hasText: 'alpha.com' });
    await expect(alphaRow.locator('[data-action="toggle-domain"]')).not.toBeDisabled();
    await expect(alphaRow.locator('[data-action="remove-domain"]')).toBeDisabled();

    await alphaRow.locator('.switch-slider').click();
    await expect.poll(() => page.evaluate(() => window.__popupData.blockedDomains['alpha.com']?.enabled)).toBe(false);
    await expect(alphaRow.locator('[data-action="remove-domain"]')).not.toBeDisabled();

    const betaRow = page.locator('#limitList .row-limit').filter({ hasText: 'beta.com' });
    await betaRow.locator('[data-action="remove-domain"]').click();
    await expect.poll(() => page.evaluate(() => window.__popupData.blockedDomains['beta.com'])).toBeUndefined();
});

test('visible Limits tab usage keeps ticking for the active limited site', async ({ page }) => {
    await installPopupChromeMock(page, {
        flushMutatesStats: true,
        blockedDomains: {
            'alpha.com': { enabled: true, limitSeconds: 3600, tier: 'standard' }
        },
        statsToday: {
            'alpha.com': { timeMs: 59 * 1000, visits: 1 }
        },
        allStatsToday: {
            'alpha.com': { timeMs: 59 * 1000, visits: 1 }
        },
        snoozedDomains: {}
    });

    await page.goto(popupUrl());
    await page.locator('label[for="tab2"]').click();
    const alphaRow = page.locator('#limitList .row-limit').filter({ hasText: 'alpha.com' });
    await alphaRow.evaluate((row) => {
        row.dataset.renderIdentity = 'alpha-row';
    });
    const chip = alphaRow.locator('.limit-used-chip');
    const initialChipText = await chip.textContent();
    expect(initialChipText).toContain('Today');

    await expect.poll(() => page.evaluate(() => window.__popupData.statsToday['alpha.com']?.timeMs), { timeout: 3500 })
        .toBeGreaterThanOrEqual(62 * 1000);
    await expect.poll(async () => chip.textContent(), { timeout: 3500 }).not.toBe(initialChipText);
    await expect(chip).toContainText('Today 1m');
    await expect(alphaRow).toHaveAttribute('data-render-identity', 'alpha-row');
});

test('reset limit usage clears dashboard reached state and Limits today usage', async ({ page }) => {
    await installPopupChromeMock(page, {
        blockedDomains: {
            'alpha.com': { enabled: true, limitSeconds: 60, tier: 'standard' }
        },
        statsToday: {
            'www.alpha.com': { timeMs: 90 * 1000, visits: 3 }
        },
        allStatsToday: {
            'www.alpha.com': { timeMs: 90 * 1000, visits: 3 }
        },
        snoozedDomains: {},
        recentlyReset: {}
    });

    await page.goto(popupUrl());
    await expect(page.locator('#activeList')).toContainText('Daily limit reached');
    await page.locator('label[for="tab2"]').click();

    const alphaRow = page.locator('#limitList .row-limit').filter({ hasText: 'alpha.com' });
    await expect(alphaRow).toContainText('Today 1m 30s');
    await expect(alphaRow.locator('[data-action="remove-domain"]')).toBeDisabled();

    await page.evaluate(() => {
        chrome.storage.local.set({
            statsToday: {},
            allStatsToday: {},
            recentlyReset: { 'alpha.com': Date.now() }
        });
    });

    await expect(alphaRow).toContainText('Today 0s');
    await expect(alphaRow.locator('[data-action="remove-domain"]')).not.toBeDisabled();
    await page.locator('label[for="tab1"]').click();
    await expect(page.locator('#activeList')).not.toContainText('Daily limit reached');
});

test('limit form rejects daily limits above one day', async ({ page }) => {
    await installPopupChromeMock(page);

    await page.goto(popupUrl());
    await page.locator('label[for="tab2"]').click();
    await page.locator('#domainInput').fill('https://www.example.com/watch?v=1');
    await page.locator('#limitInput').fill('1441');
    await page.locator('#addForm button[type="submit"]').click();

    await expect(page.locator('#addFormMsg')).toContainText('Enter a daily limit from 1 to 1440 minutes.');
    await expect.poll(() => page.evaluate(() => window.__popupData.blockedDomains['example.com'])).toBeUndefined();
    await expect(page.locator('#limitList')).not.toContainText('example.com');
});

test('schedule form rejects invalid time input before saving', async ({ page }) => {
    await installPopupChromeMock(page);

    await page.goto(popupUrl());
    await page.locator('label[for="tab3"]').click();
    await page.locator('#scheduledDomain').fill('reddit.com');
    await page.locator('#startTime').fill('tomorrow');
    await page.locator('#endTime').fill('banana');
    await page.locator('#scheduledDays .day-bubble').first().click();
    await page.locator('#scheduledSubmitBtn').click();

    await expect(page.locator('#scheduledFormMsg')).toContainText('Enter valid start and end times.');
    await expect.poll(() => page.evaluate(() => (
        window.__popupMessages.some((message) => message.action === 'addScheduledBlock')
    ))).toBe(false);
});

test('active scheduled sessions become cancellable after pausing', async ({ page }) => {
    const schedule = {
        id: 'schedule-youtube',
        domain: 'youtube.com',
        startTime: '00:00',
        endTime: '23:59',
        days: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
        tier: 'standard'
    };

    await installPopupChromeMock(page, {
        scheduledBlocks: [schedule],
        activeBlocks: [{ ...schedule, startedAt: Date.now(), breakMs: 0 }]
    });

    await page.goto(popupUrl());
    await page.locator('label[for="tab3"]').click();

    const scheduleRow = page.locator('#scheduledList .row').filter({ hasText: 'youtube.com' });
    await expect(scheduleRow.locator('[data-action="remove-schedule"]')).toBeDisabled();

    await scheduleRow.locator('.switch-slider').click();
    await expect.poll(() => page.evaluate(() => window.__popupData.scheduledBlocks[0]?.enabled)).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__popupData.activeBlocks.length)).toBe(0);
    await expect(scheduleRow.locator('[data-action="remove-schedule"]')).not.toBeDisabled();

    await scheduleRow.locator('[data-action="remove-schedule"]').click();
    await expect.poll(() => page.evaluate(() => window.__popupData.scheduledBlocks.length)).toBe(0);
});

test('editing a paused schedule keeps it paused', async ({ page }) => {
    const schedule = {
        id: 'paused-schedule',
        domain: 'focus.com',
        startTime: '09:00',
        endTime: '17:00',
        days: [1, 2, 3, 4, 5],
        enabled: false,
        tier: 'standard'
    };
    await installPopupChromeMock(page, { scheduledBlocks: [schedule] });

    await page.goto(popupUrl());
    await page.locator('label[for="tab3"]').click();
    const scheduleRow = page.locator('#scheduledList .row').filter({ hasText: 'focus.com' });
    await scheduleRow.locator('[data-action="edit-schedule"]').click();
    await page.locator('#scheduledSubmitBtn').click();

    await expect.poll(() => page.evaluate(() => (
        window.__popupMessages.findLast((message) => message.action === 'updateScheduledBlock')
    ))).toEqual(expect.objectContaining({
        block: expect.objectContaining({ id: 'paused-schedule', enabled: false })
    }));
});

test('schedule form starts with no days selected', async ({ page }) => {
    await installPopupChromeMock(page);

    await page.goto(popupUrl());
    await page.locator('label[for="tab3"]').click();

    await expect(page.locator('#scheduledDays .day-bubble.is-selected')).toHaveCount(0);
    await page.locator('#scheduledDays .day-bubble').first().click();
    await expect(page.locator('#scheduledDays .day-bubble.is-selected')).toHaveCount(1);
});

test('paused legacy www limit keys still allow end pause, toggle, and remove', async ({ page }) => {
    await installPopupChromeMock(page, {
        blockedDomains: {
            'www.alpha.com': { enabled: true, limitSeconds: 60, tier: 'standard' }
        },
        statsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 }
        },
        allStatsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 }
        },
        snoozedDomains: {
            'www.alpha.com': { expiresAt: Date.now() + 10 * 60 * 1000, minutes: 5 }
        }
    });

    await page.goto(popupUrl());

    await page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]').click();
    await expect.poll(() => page.evaluate(() => window.__popupData.snoozedDomains['www.alpha.com'])).toBeUndefined();

    await page.locator('label[for="tab2"]').click();
    const alphaRow = page.locator('#limitList .row-limit').filter({ hasText: 'www.alpha.com' });

    await alphaRow.locator('.switch-slider').click();
    await expect.poll(() => page.evaluate(() => window.__popupData.blockedDomains['www.alpha.com']?.enabled)).toBe(false);

    await alphaRow.locator('[data-action="remove-domain"]').click();
    await expect.poll(() => page.evaluate(() => window.__popupData.blockedDomains['www.alpha.com'])).toBeUndefined();
});

test('end pause works when the pause appears while popup is already open', async ({ page }) => {
    await installPopupChromeMock(page, {
        blockedDomains: {
            'alpha.com': { enabled: true, limitSeconds: 60, tier: 'standard' }
        },
        statsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 }
        },
        allStatsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 }
        },
        snoozedDomains: {}
    });

    await page.goto(popupUrl());
    await expect(page.locator('#activeList')).toContainText('Daily limit reached');

    await page.evaluate(() => window.chrome.storage.local.set({
        snoozedDomains: {
            'www.alpha.com': { expiresAt: Date.now() + 10 * 60 * 1000, minutes: 5 }
        }
    }));

    await expect(page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]')).toHaveCount(1);
    await page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]').click();

    await expect.poll(() => page.evaluate(() => window.__popupData.snoozedDomains['www.alpha.com'])).toBeUndefined();
    await expect(page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]')).toHaveCount(0);
    await expect(page.locator('#activeList')).toContainText('Daily limit reached');
});

test('popup normalizes www-prefixed pause entries before rendering active blocks', async ({ page }) => {
    await installPopupChromeMock(page, {
        blockedDomains: {
            'alpha.com': { enabled: true, limitSeconds: 60, tier: 'standard' }
        },
        statsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 }
        },
        allStatsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 }
        },
        snoozedDomains: {
            'www.alpha.com': { expiresAt: Date.now() + 10 * 60 * 1000, minutes: 5 }
        }
    });

    await page.goto(popupUrl());
    await expect(page.locator('#activeList')).toContainText('alpha.com');
    await expect(page.locator('#activeList')).not.toContainText('Daily limit reached');
    await expect(page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]')).toHaveCount(1);

    await page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]').click();

    await expect.poll(() => page.evaluate(() => window.__popupData.snoozedDomains['www.alpha.com'])).toBeUndefined();
    await expect(page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]')).toHaveCount(0);
    await expect(page.locator('#activeList')).toContainText('Daily limit reached');
});

test('end pause updates the popup even when background response fails', async ({ page }) => {
    await installPopupChromeMock(page, {
        failClearSnoozeMessage: true,
        blockedDomains: {
            'alpha.com': { enabled: true, limitSeconds: 60, tier: 'standard' }
        },
        statsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 }
        },
        allStatsToday: {
            'alpha.com': { timeMs: 60 * 1000, visits: 1 }
        },
        snoozedDomains: {
            'www.alpha.com': { expiresAt: Date.now() + 10 * 60 * 1000, minutes: 5 }
        }
    });

    await page.goto(popupUrl());
    await page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]').click();

    await expect.poll(() => page.evaluate(() => window.__popupData.snoozedDomains['www.alpha.com'])).toBeUndefined();
    await expect(page.locator('[data-action="clear-snooze"][data-domain="alpha.com"]')).toHaveCount(0);
});

test('popup data-action controls are represented in the delegated handler', () => {
    const popupJs = fs.readFileSync(path.join(process.cwd(), 'popup.js'), 'utf8');
    const popupHtml = fs.readFileSync(path.join(process.cwd(), 'popup.html'), 'utf8');
    const source = `${popupJs}\n${popupHtml}`;

    const actions = new Set();
    for (const match of source.matchAll(/data-action="([^"$]+)"/g)) {
        actions.add(match[1]);
    }
    for (const match of popupJs.matchAll(/actionChip\([^,]+,\s*"([^"]+)"/g)) {
        actions.add(match[1]);
    }

    const handled = new Set(Array.from(popupJs.matchAll(/action === "([^"]+)"/g), (match) => match[1]));
    const missing = Array.from(actions).filter((action) => !handled.has(action)).sort();
    expect(missing).toEqual([]);
});
