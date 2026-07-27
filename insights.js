(function attachInsightEngine(global) {
    "use strict";

    const MINUTE_MS = 60 * 1000;
    const DAY_MS = 24 * 60 * MINUTE_MS;
    const INSIGHT_MIN_ACTIVE_DAYS = 2;
    const INSIGHT_MIN_TOTAL_MS = 15 * MINUTE_MS;
    const INSIGHT_MIN_VISITS = 5;

    const DEFAULT_INSIGHT_SETTINGS = Object.freeze({
        personalInsightsEnabled: true,
        insightNotificationsEnabled: true,
        insightMaxNotificationsPerDay: 1,
        insightSensitivity: "normal"
    });

    const SENSITIVITY_THRESHOLDS = Object.freeze({
        low: Object.freeze({
            longSessionMs: 45 * MINUTE_MS,
            longSessionNotifyMs: 45 * MINUTE_MS,
            recurringDays: 4,
            recurringMinMs: 10 * MINUTE_MS,
            highVisitCount: 12,
            highVisitNotifyCount: 16,
            usageIncreaseRatio: 2.5,
            usageIncreaseMinMs: 45 * MINUTE_MS,
            usageIncreaseMinDeltaMs: 25 * MINUTE_MS,
            usageIncreaseAvgMinMs: 10 * MINUTE_MS,
            usageIncreaseMinHistoryDays: 3,
            limitSuggestionDays: 5,
            limitSuggestionTotalMs: 120 * MINUTE_MS,
            limitSuggestionVisits: 28,
            limitSuggestionNotifyTotalMs: 180 * MINUTE_MS,
            activeSessionStaleMs: 10 * MINUTE_MS
        }),
        normal: Object.freeze({
            longSessionMs: 30 * MINUTE_MS,
            longSessionNotifyMs: 35 * MINUTE_MS,
            recurringDays: 3,
            recurringMinMs: 5 * MINUTE_MS,
            highVisitCount: 8,
            highVisitNotifyCount: 12,
            usageIncreaseRatio: 1.75,
            usageIncreaseMinMs: 30 * MINUTE_MS,
            usageIncreaseMinDeltaMs: 15 * MINUTE_MS,
            usageIncreaseAvgMinMs: 5 * MINUTE_MS,
            usageIncreaseMinHistoryDays: 3,
            limitSuggestionDays: 3,
            limitSuggestionTotalMs: 60 * MINUTE_MS,
            limitSuggestionVisits: 15,
            limitSuggestionNotifyTotalMs: 100 * MINUTE_MS,
            activeSessionStaleMs: 10 * MINUTE_MS
        }),
        high: Object.freeze({
            longSessionMs: 20 * MINUTE_MS,
            longSessionNotifyMs: 30 * MINUTE_MS,
            recurringDays: 3,
            recurringMinMs: 2 * MINUTE_MS,
            highVisitCount: 5,
            highVisitNotifyCount: 9,
            usageIncreaseRatio: 1.4,
            usageIncreaseMinMs: 15 * MINUTE_MS,
            usageIncreaseMinDeltaMs: 8 * MINUTE_MS,
            usageIncreaseAvgMinMs: 3 * MINUTE_MS,
            usageIncreaseMinHistoryDays: 2,
            limitSuggestionDays: 2,
            limitSuggestionTotalMs: 30 * MINUTE_MS,
            limitSuggestionVisits: 8,
            limitSuggestionNotifyTotalMs: 75 * MINUTE_MS,
            activeSessionStaleMs: 10 * MINUTE_MS
        })
    });

    function normalizeDomain(input) {
        const raw = String(input || "").trim().toLowerCase();
        if (!raw) return "";

        try {
            const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
            return new URL(withProtocol).hostname.replace(/^www\./, "");
        } catch {
            return raw.replace(/^www\./, "").split("/")[0];
        }
    }

    function isValidDomain(domain) {
        const value = normalizeDomain(domain);
        if (!value || value.length > 255 || value.includes("..")) return false;
        if (!/^[a-z0-9.-]+$/.test(value)) return false;
        return value.split(".").every((part) => part && !part.startsWith("-") && !part.endsWith("-"));
    }

    function getDayKey(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    function dayKeyOffset(now, offset) {
        const date = new Date(now);
        date.setDate(date.getDate() - offset);
        return getDayKey(date);
    }

    function normalizeSensitivity(value) {
        const normalized = String(value || DEFAULT_INSIGHT_SETTINGS.insightSensitivity).toLowerCase();
        return Object.prototype.hasOwnProperty.call(SENSITIVITY_THRESHOLDS, normalized)
            ? normalized
            : DEFAULT_INSIGHT_SETTINGS.insightSensitivity;
    }

    function getInsightSettings(raw = {}) {
        const sensitivity = normalizeSensitivity(raw.insightSensitivity);
        const maxNotifications = Number(raw.insightMaxNotificationsPerDay);

        return {
            personalInsightsEnabled: raw.personalInsightsEnabled !== false,
            insightNotificationsEnabled: raw.insightNotificationsEnabled !== false,
            insightMaxNotificationsPerDay: Number.isFinite(maxNotifications)
                ? Math.max(0, Math.min(5, Math.round(maxNotifications)))
                : DEFAULT_INSIGHT_SETTINGS.insightMaxNotificationsPerDay,
            insightSensitivity: sensitivity
        };
    }

    function thresholdsFor(settings = {}) {
        return SENSITIVITY_THRESHOLDS[getInsightSettings(settings).insightSensitivity] || SENSITIVITY_THRESHOLDS.normal;
    }

    function entryTimeMs(entry = {}) {
        if (Number.isFinite(entry.timeMs)) return Math.max(0, Number(entry.timeMs));
        if (Number.isFinite(entry.timeSec)) return Math.max(0, Number(entry.timeSec) * 1000);
        return 0;
    }

    function entryVisits(entry = {}) {
        return Math.max(0, Number(entry.visits || 0));
    }

    function mergeDomainStats(target, rawDomain, entry = {}) {
        const domain = normalizeDomain(rawDomain);
        if (!isValidDomain(domain)) return target;

        target[domain] ||= { timeMs: 0, visits: 0 };
        target[domain].timeMs += entryTimeMs(entry);
        target[domain].visits += entryVisits(entry);
        return target;
    }

    function normalizeStats(stats = {}) {
        return Object.entries(stats || {}).reduce((result, [domain, entry]) => (
            mergeDomainStats(result, domain, entry)
        ), {});
    }

    function statsForOffset(input = {}, now = Date.now(), offset = 0) {
        if (offset === 0) return normalizeStats(input.allStatsToday || input.statsToday || {});
        const day = dayKeyOffset(now, offset);
        return normalizeStats((input.statsHistory || {})[day] || {});
    }

    function hourlyTotalsForDay(hourlyUsageHistory = {}, day) {
        return Object.values(hourlyUsageHistory?.[day] || {}).reduce((totals, bucket = {}) => {
            totals.timeMs += Math.max(0, Number(bucket.timeMs || 0));
            totals.visits += Math.max(0, Number(bucket.visits || 0));

            if (!Number(bucket.timeMs || 0)) {
                Object.values(bucket.domains || {}).forEach((ms) => {
                    totals.timeMs += Math.max(0, Number(ms || 0));
                });
            }
            if (!Number(bucket.visits || 0)) {
                Object.values(bucket.domainVisits || {}).forEach((visitCount) => {
                    totals.visits += Math.max(0, Number(visitCount || 0));
                });
            }

            return totals;
        }, { timeMs: 0, visits: 0 });
    }

    function behaviorTotalsForDay(behaviorHistory = {}, day) {
        const bucket = behaviorHistory?.[day] || {};
        const byType = bucket.byType || {};
        return Object.values(byType).reduce((sum, count) => sum + Math.max(0, Number(count || 0)), 0);
    }

    function insightDataReadiness(input = {}) {
        const now = Number(input.now || Date.now());
        const hourlyUsageHistory = input.hourlyUsageHistory || {};
        let activeDays = 0;
        let totalMs = 0;
        let visitCount = 0;

        for (let offset = 0; offset < 7; offset += 1) {
            const day = dayKeyOffset(now, offset);
            const stats = statsForOffset(input, now, offset);
            const statsTotals = Object.values(stats).reduce((totals, entry = {}) => {
                totals.timeMs += entryTimeMs(entry);
                totals.visits += entryVisits(entry);
                return totals;
            }, { timeMs: 0, visits: 0 });
            const hourlyTotals = hourlyTotalsForDay(hourlyUsageHistory, day);
            const behaviorCount = behaviorTotalsForDay(input.behaviorHistory || {}, day);
            const dayMs = Math.max(statsTotals.timeMs, hourlyTotals.timeMs);
            const dayVisits = Math.max(statsTotals.visits, hourlyTotals.visits);

            if (dayMs > 0 || dayVisits > 0 || behaviorCount > 0) activeDays += 1;
            totalMs += dayMs;
            visitCount += dayVisits + behaviorCount;
        }

        const hasEnoughVolume = totalMs >= INSIGHT_MIN_TOTAL_MS || visitCount >= INSIGHT_MIN_VISITS;
        return {
            ready: activeDays >= INSIGHT_MIN_ACTIVE_DAYS && hasEnoughVolume,
            activeDays,
            totalMs,
            visits: visitCount,
            requiredActiveDays: INSIGHT_MIN_ACTIVE_DAYS,
            requiredTotalMs: INSIGHT_MIN_TOTAL_MS,
            requiredVisits: INSIGHT_MIN_VISITS
        };
    }

    function normalizedBlockedDomains(blockedDomains = {}) {
        return new Set(
            Object.keys(blockedDomains || {})
                .map(normalizeDomain)
                .filter(isValidDomain)
        );
    }

    function formatMinutes(ms) {
        const minutes = Math.max(1, Math.round(Number(ms || 0) / MINUTE_MS));
        return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    }

    function formatIncreasePercent(value) {
        const ratio = Math.max(0, Number(value || 0));
        return `${Math.max(0, Math.round((ratio - 1) * 100))}%`;
    }

    function daypartForHour(hour) {
        const value = ((Number(hour) % 24) + 24) % 24;
        if (value >= 5 && value < 12) return "morning";
        if (value >= 12 && value < 17) return "afternoon";
        if (value >= 17 && value < 22) return "evening";
        return "late night";
    }

    function titleCase(value) {
        return String(value || "")
            .split(/[\s.-]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    function domainLabel(domain, options = {}) {
        const normalized = normalizeDomain(domain);
        const labels = {
            "youtube.com": "YouTube",
            "youtu.be": "YouTube",
            "reddit.com": "Reddit",
            "tiktok.com": "TikTok",
            "linkedin.com": "LinkedIn",
            "instagram.com": "Instagram",
            "facebook.com": "Facebook",
            "twitter.com": "Twitter",
            "x.com": "X",
            "netflix.com": "Netflix",
            "twitch.tv": "Twitch",
            "discord.com": "Discord",
            "gmail.com": "Gmail",
            "accounts.google.com": "Google Account",
            "analytics.google.com": "Google Analytics",
            "calendar.google.com": "Google Calendar",
            "chat.google.com": "Google Chat",
            "chrome.google.com": "Chrome Web Store",
            "classroom.google.com": "Google Classroom",
            "docs.google.com": "Google Docs",
            "drive.google.com": "Google Drive",
            "mail.google.com": "Gmail",
            "maps.google.com": "Google Maps",
            "meet.google.com": "Google Meet",
            "news.google.com": "Google News",
            "photos.google.com": "Google Photos",
            "translate.google.com": "Google Translate"
        };

        if (options.expanded) return normalized || "";
        if (labels[normalized]) return labels[normalized];

        const parts = normalized.split(".").filter(Boolean);
        if (!parts.length) return normalized;

        const last = parts[parts.length - 1] || "";
        const secondLast = parts[parts.length - 2] || "";
        const rootIndex = parts.length > 2 && last.length === 2 && secondLast.length <= 3
            ? parts.length - 3
            : Math.max(0, parts.length - 2);
        return titleCase(parts[rootIndex] || parts[0]);
    }

    function pluralize(value, singular, plural = `${singular}s`) {
        const count = Number(value || 0);
        return `${count} ${count === 1 ? singular : plural}`;
    }

    function daypartPlural(value) {
        const daypart = String(value || "").toLowerCase();
        if (daypart.includes("late")) return "late nights";
        if (daypart.includes("morning")) return "mornings";
        if (daypart.includes("afternoon")) return "afternoons";
        if (daypart.includes("evening")) return "evenings";
        return "";
    }

    function daypartAdjective(value) {
        const daypart = String(value || "").toLowerCase();
        if (daypart.includes("late")) return "Late-night";
        if (daypart.includes("morning")) return "Morning";
        if (daypart.includes("afternoon")) return "Afternoon";
        if (daypart.includes("evening")) return "Evening";
        return "";
    }

    function compactHourLabel(hour) {
        const value = ((Number(hour) % 24) + 24) % 24;
        if (value === 0) return "12am";
        if (value === 12) return "12pm";
        return value < 12 ? `${value}am` : `${value - 12}pm`;
    }

    function afterHourText(hour) {
        const value = ((Number(hour) % 24) + 24) % 24;
        if (value === 0) return "after midnight";
        if (value === 12) return "after noon";
        return `after ${compactHourLabel(value)}`;
    }

    function insightWindowPhrase(daypart, hour) {
        const value = String(daypart || "").toLowerCase();
        const hasHour = Number.isFinite(Number(hour));
        if (value.includes("morning")) return "before noon";
        if (value.includes("afternoon")) return "in the afternoon";
        if (value.includes("evening")) return hasHour ? afterHourText(hour) : "in the evening";
        if (value.includes("late")) return hasHour ? afterHourText(hour) : "late at night";
        return hasHour ? `around ${compactHourLabel(hour)}` : "";
    }

    function dayCountText(activeDays, windowDays = 7) {
        const active = Number(activeDays || 0);
        const window = Number(windowDays || 0);
        if (active <= 0) return "";
        if (window > 0) {
            return active >= window
                ? `each of the last ${window} days`
                : `${active} of the last ${window} days`;
        }
        return pluralize(active, "day");
    }

    function makeInsight(type, domain, title, message, options = {}) {
        const normalized = normalizeDomain(domain);
        const dateKey = options.dateKey || getDayKey(new Date(options.now || Date.now()));
        const contextKey = String(options.contextKey || dateKey).replace(/\s+/g, "-");

        return {
            id: `${type}:${normalized}:${contextKey}`,
            type,
            domain: normalized,
            title,
            message,
            action: options.action || "viewUsage",
            priority: Number(options.priority || 0),
            notify: Boolean(options.notify),
            timestamp: Number(options.now || Date.now()),
            dateKey,
            context: options.context || {}
        };
    }

    function domainUsageInHour(hourlyUsageHistory = {}, dayKey, hour) {
        const hourKey = String(hour).padStart(2, "0");
        const bucket = hourlyUsageHistory?.[dayKey]?.[hourKey] || {};
        const usage = {};

        Object.entries(bucket.domains || {}).forEach(([rawDomain, ms]) => {
            const domain = normalizeDomain(rawDomain);
            if (!isValidDomain(domain)) return;
            usage[domain] ||= { timeMs: 0, visits: 0 };
            usage[domain].timeMs += Math.max(0, Number(ms || 0));
        });

        Object.entries(bucket.domainVisits || {}).forEach(([rawDomain, visitCount]) => {
            const domain = normalizeDomain(rawDomain);
            if (!isValidDomain(domain)) return;
            usage[domain] ||= { timeMs: 0, visits: 0 };
            usage[domain].visits += Math.max(0, Number(visitCount || 0));
        });

        return usage;
    }

    function domainHourlyPattern(input = {}, domain, now = Date.now(), days = 7) {
        const normalized = normalizeDomain(domain);
        if (!isValidDomain(normalized)) return {};

        const history = input.hourlyUsageHistory || {};
        const hours = Array.from({ length: 24 }, () => ({
            activeDays: 0,
            totalMs: 0,
            visits: 0
        }));

        for (let offset = 0; offset < days; offset += 1) {
            const day = dayKeyOffset(now, offset);
            for (let hour = 0; hour < 24; hour += 1) {
                const entry = domainUsageInHour(history, day, hour)[normalized] || {};
                const timeMs = Math.max(0, Number(entry.timeMs || 0));
                const visitCount = Math.max(0, Number(entry.visits || 0));
                if (timeMs <= 0 && visitCount <= 0) continue;

                hours[hour].activeDays += 1;
                hours[hour].totalMs += timeMs;
                hours[hour].visits += visitCount;
            }
        }

        const best = hours
            .map((entry, hour) => ({ hour, ...entry }))
            .filter((entry) => entry.activeDays > 0)
            .sort((a, b) => (
                b.activeDays - a.activeDays
                || b.totalMs - a.totalMs
                || b.visits - a.visits
            ))[0];

        if (!best) return {};
        return {
            peakHour: best.hour,
            peakDaypart: daypartForHour(best.hour),
            peakActiveDays: best.activeDays,
            peakTotalMs: best.totalMs,
            peakVisits: best.visits
        };
    }

    function behaviorEventsForDay(behaviorHistory = {}, day) {
        const events = behaviorHistory?.[day]?.events;
        return Array.isArray(events) ? events : [];
    }

    function behaviorEventsForDomain(input = {}, domain, now = Date.now(), days = 7) {
        const normalized = normalizeDomain(domain);
        if (!isValidDomain(normalized)) return [];

        const result = [];
        for (let offset = 0; offset < days; offset += 1) {
            const day = dayKeyOffset(now, offset);
            behaviorEventsForDay(input.behaviorHistory || {}, day).forEach((event) => {
                if (normalizeDomain(event.domain) === normalized) result.push(event);
            });
        }
        return result;
    }

    function behaviorDomains(input = {}, now = Date.now(), days = 7) {
        const domains = new Set();
        for (let offset = 0; offset < days; offset += 1) {
            const day = dayKeyOffset(now, offset);
            const bucket = input.behaviorHistory?.[day] || {};
            Object.keys(bucket.byDomain || {}).forEach((domain) => {
                const normalized = normalizeDomain(domain);
                if (isValidDomain(normalized)) domains.add(normalized);
            });
            behaviorEventsForDay(input.behaviorHistory || {}, day).forEach((event) => {
                const normalized = normalizeDomain(event.domain);
                if (isValidDomain(normalized)) domains.add(normalized);
            });
        }
        return domains;
    }

    function countBehaviorEvents(events = [], types = []) {
        const allowed = new Set(types);
        return events.filter((event) => allowed.has(event.type)).length;
    }

    function sortedBehaviorEvents(input = {}, now = Date.now(), days = 1, types = []) {
        const allowed = types.length ? new Set(types) : null;
        const events = [];
        for (let offset = 0; offset < days; offset += 1) {
            const day = dayKeyOffset(now, offset);
            behaviorEventsForDay(input.behaviorHistory || {}, day).forEach((event) => {
                if (!allowed || allowed.has(event.type)) events.push(event);
            });
        }
        return events.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    }

    function isBlockedReturnEvent(event = {}) {
        return event.type === "blocked_page_view" || event.type === "block_redirect";
    }

    function blockedReturnEventsForDomain(input = {}, domain, now = Date.now(), days = 1) {
        return behaviorEventsForDomain(input, domain, now, days).filter(isBlockedReturnEvent);
    }

    function blockedReturnCountForDay(input = {}, day, domain = "") {
        const normalized = normalizeDomain(domain);
        return behaviorEventsForDay(input.behaviorHistory || {}, day)
            .filter((event) => isBlockedReturnEvent(event))
            .filter((event) => !normalized || normalizeDomain(event.domain) === normalized)
            .length;
    }

    function blockedReturnCountsByDomainForDay(input = {}, day) {
        const counts = {};
        behaviorEventsForDay(input.behaviorHistory || {}, day).forEach((event) => {
            if (!isBlockedReturnEvent(event)) return;
            const domain = normalizeDomain(event.domain);
            if (!isValidDomain(domain)) return;
            counts[domain] = Number(counts[domain] || 0) + 1;
        });
        return counts;
    }

    function addLongSessionInsight(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const session = input.activeSession || {};
        const domain = normalizeDomain(session.domain);
        const startedAt = Number(session.startedAt || session.startedAtMs || 0);
        const lastHeartbeatAt = Number(session.lastHeartbeatAt || 0);

        if (!isValidDomain(domain) || !startedAt || !lastHeartbeatAt) return;
        if (now - lastHeartbeatAt > thresholds.activeSessionStaleMs) return;

        const durationMs = Math.max(0, now - startedAt);
        if (durationMs < thresholds.longSessionMs) return;

        const duration = formatMinutes(durationMs);
        const hour = new Date(now).getHours();
        const label = domainLabel(domain);
        insights.push(makeInsight(
            "long_session",
            domain,
            `${label} is holding your attention right now`,
            `Active for ${duration} straight`,
            {
                now,
                dateKey,
                contextKey: dateKey,
                notify: durationMs >= thresholds.longSessionNotifyMs,
                priority: 90 + Math.min(40, Math.round(durationMs / (10 * MINUTE_MS))),
                context: {
                    durationMs,
                    hour,
                    daypart: daypartForHour(hour)
                }
            }
        ));
    }

    function addRecurringTimeBlockInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const history = input.hourlyUsageHistory || {};
        const todayKey = dayKeyOffset(now, 0);
        const seenDomainTypes = new Set();

        for (let hour = 0; hour < 24; hour += 1) {
            const todayUsage = domainUsageInHour(history, todayKey, hour);
            const candidates = Object.keys(todayUsage);

            for (const domain of candidates) {
                if (seenDomainTypes.has(domain)) continue;

                let consecutiveDays = 0;
                let totalMs = 0;
                let totalVisits = 0;

                for (let offset = 0; offset < thresholds.recurringDays; offset += 1) {
                    const dayUsage = domainUsageInHour(history, dayKeyOffset(now, offset), hour)[domain] || {};
                    const timeMs = Number(dayUsage.timeMs || 0);
                    const visits = Number(dayUsage.visits || 0);
                    if (timeMs < thresholds.recurringMinMs && visits <= 0) break;
                    consecutiveDays += 1;
                    totalMs += timeMs;
                    totalVisits += visits;
                }

                if (consecutiveDays < thresholds.recurringDays) continue;

                seenDomainTypes.add(domain);
                const daypart = daypartForHour(hour);
                const windowText = insightWindowPhrase(daypart, hour);
                const label = domainLabel(domain);
                insights.push(makeInsight(
                    "recurring_time_block",
                    domain,
                    `${label} often appears during your ${daypartPlural(daypart)}`,
                    `Active ${windowText} for ${consecutiveDays} straight days`,
                    {
                        now,
                        dateKey,
                        contextKey: `${dateKey}:${hour}`,
                        notify: true,
                        priority: 82 + consecutiveDays * 3 + Math.min(20, Math.round(totalMs / (15 * MINUTE_MS))),
                        context: {
                            hour,
                            consecutiveDays,
                            totalMs,
                            visits: totalVisits,
                            daypart
                        }
                    }
                ));
            }
        }
    }

    function addHighVisitFrequencyInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const hour = new Date(now).getHours();
        const usage = domainUsageInHour(input.hourlyUsageHistory || {}, dateKey, hour);

        Object.entries(usage).forEach(([domain, entry]) => {
            const visitCount = Number(entry.visits || 0);
            if (visitCount < thresholds.highVisitCount) return;

            const daypart = daypartForHour(hour);
            const label = domainLabel(domain);
            insights.push(makeInsight(
                "high_visit_frequency",
                domain,
                `${label} keeps showing up this ${daypart}`,
                `Opened ${pluralize(visitCount, "time")} this hour`,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:${hour}`,
                    notify: visitCount >= thresholds.highVisitNotifyCount,
                    priority: 66 + visitCount,
                    context: { hour, visits: visitCount, daypart }
                }
            ));
        });
    }

    function addUsageIncreaseInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const todayStats = statsForOffset(input, now, 0);

        Object.entries(todayStats).forEach(([domain, today]) => {
            const todayMs = entryTimeMs(today);
            if (todayMs < thresholds.usageIncreaseMinMs) return;

            const recent = [];
            for (let offset = 1; offset <= 7; offset += 1) {
                const stats = statsForOffset(input, now, offset);
                const dayMs = entryTimeMs(stats[domain] || {});
                if (dayMs > 0) recent.push(dayMs);
            }

            if (recent.length < thresholds.usageIncreaseMinHistoryDays) return;

            const averageMs = recent.reduce((sum, ms) => sum + ms, 0) / recent.length;
            const deltaMs = todayMs - averageMs;
            if (averageMs < thresholds.usageIncreaseAvgMinMs || deltaMs < thresholds.usageIncreaseMinDeltaMs) return;

            const ratio = todayMs / averageMs;
            if (ratio < thresholds.usageIncreaseRatio) return;

            const peakPattern = domainHourlyPattern(input, domain, now, 1);
            const daypart = peakPattern.peakDaypart || "";
            const adjective = daypartAdjective(daypart);
            const windowText = insightWindowPhrase(daypart, peakPattern.peakHour);
            const label = domainLabel(domain);
            insights.push(makeInsight(
                "usage_increase",
                domain,
                `${adjective ? `${adjective} ` : ""}${label} activity is increasing`,
                `Usage ${windowText ? `${windowText} ` : ""}rose ${formatIncreasePercent(ratio)} today`,
                {
                    now,
                    dateKey,
                    notify: true,
                    priority: 74 + Math.min(30, Math.round(ratio * 8)),
                    context: { todayMs, averageMs, ratio, ...peakPattern }
                }
            ));
        });
    }

    function addLimitSuggestionInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const blocked = normalizedBlockedDomains(input.blockedDomains || {});
        const domains = new Set();

        for (let offset = 0; offset < 7; offset += 1) {
            Object.keys(statsForOffset(input, now, offset)).forEach((domain) => domains.add(domain));
        }

        domains.forEach((domain) => {
            if (!isValidDomain(domain) || blocked.has(domain)) return;

            let activeDays = 0;
            let totalMs = 0;
            let totalVisits = 0;

            for (let offset = 0; offset < 7; offset += 1) {
                const entry = statsForOffset(input, now, offset)[domain] || {};
                const dayMs = entryTimeMs(entry);
                const dayVisits = entryVisits(entry);
                if (dayMs > 0 || dayVisits > 0) activeDays += 1;
                totalMs += dayMs;
                totalVisits += dayVisits;
            }

            if (activeDays < thresholds.limitSuggestionDays) return;
            if (totalMs < thresholds.limitSuggestionTotalMs && totalVisits < thresholds.limitSuggestionVisits) return;

            const peakPattern = domainHourlyPattern(input, domain, now, 7);
            const hasPeakPattern = peakPattern.peakDaypart && Number(peakPattern.peakActiveDays || activeDays) >= 2;
            const label = domainLabel(domain);
            const title = hasPeakPattern
                ? `${label} often appears during your ${daypartPlural(peakPattern.peakDaypart)}`
                : `${label} has become a regular stop this week`;
            const windowText = hasPeakPattern
                ? insightWindowPhrase(peakPattern.peakDaypart, peakPattern.peakHour)
                : "";
            const activeText = dayCountText(activeDays, 7);
            insights.push(makeInsight(
                "limit_suggestion",
                domain,
                title,
                `Active ${windowText ? `${windowText} ` : ""}on ${activeText}`,
                {
                    now,
                    dateKey,
                    action: "addLimit",
                    notify: totalMs >= thresholds.limitSuggestionNotifyTotalMs,
                    priority: 70 + activeDays * 4 + Math.min(25, Math.round(totalMs / (30 * MINUTE_MS))),
                    context: {
                        activeDays,
                        totalMs,
                        visits: totalVisits,
                        windowDays: 7,
                        ...peakPattern
                    }
                }
            ));
        });
    }

    function addBlockedReturnInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const todayDomains = behaviorDomains(input, now, 1);

        todayDomains.forEach((domain) => {
            const events = behaviorEventsForDomain(input, domain, now, 1);
            const blockCount = countBehaviorEvents(events, ["blocked_page_view", "block_redirect"]);
            if (blockCount < Math.max(2, Math.floor(thresholds.highVisitCount / 2))) return;

            const hours = events
                .filter((event) => event.type === "blocked_page_view" || event.type === "block_redirect")
                .map((event) => Number(event.hour))
                .filter((hour) => Number.isFinite(hour));
            const hour = hours.length
                ? hours.sort((a, b) => hours.filter((h) => h === b).length - hours.filter((h) => h === a).length)[0]
                : new Date(now).getHours();
            const label = domainLabel(domain);
            const windowText = insightWindowPhrase(daypartForHour(hour), hour);

            insights.push(makeInsight(
                "blocked_return_pattern",
                domain,
                `${label} triggered repeated redirects today`,
                `Saturn interrupted ${pluralize(blockCount, "return")} ${windowText || "today"}`,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:blocked`,
                    notify: blockCount >= thresholds.highVisitCount,
                    priority: 88 + Math.min(25, blockCount * 3),
                    context: {
                        count: blockCount,
                        hour,
                        daypart: daypartForHour(hour)
                    }
                }
            ));
        });
    }

    function addSnoozeLoopInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const todayDomains = behaviorDomains(input, now, 1);

        todayDomains.forEach((domain) => {
            const events = behaviorEventsForDomain(input, domain, now, 1);
            const snoozes = events.filter((event) => event.type === "snooze");
            if (snoozes.length < 2) return;

            const minutes = snoozes.reduce((sum, event) => sum + Math.max(0, Number(event.minutes || 0)), 0);
            const hour = Number(snoozes[snoozes.length - 1]?.hour ?? new Date(now).getHours());
            const label = domainLabel(domain);

            insights.push(makeInsight(
                "snooze_loop",
                domain,
                `${label} needed more than one pause today`,
                `${pluralize(snoozes.length, "snooze")} added ${pluralize(minutes, "minute")} of extra access`,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:snooze`,
                    notify: snoozes.length >= 3,
                    priority: 84 + Math.min(20, snoozes.length * 5) + (thresholds.highVisitCount <= 5 ? 4 : 0),
                    context: {
                        count: snoozes.length,
                        minutes,
                        hour,
                        daypart: daypartForHour(hour)
                    }
                }
            ));
        });
    }

    function addProtectionCompletedInsights(insights, input, settings, now, dateKey) {
        const todayDomains = behaviorDomains(input, now, 1);

        todayDomains.forEach((domain) => {
            const events = behaviorEventsForDomain(input, domain, now, 1);
            const completed = events
                .filter((event) => event.type === "scheduled_block_completed" && Number(event.estimatedMs || 0) > 0)
                .sort((a, b) => Number(b.estimatedMs || 0) - Number(a.estimatedMs || 0))[0];
            if (!completed) return;

            const estimatedMs = Number(completed.estimatedMs || 0);
            const hour = Number(completed.hour ?? new Date(now).getHours());
            const label = domainLabel(domain);
            insights.push(makeInsight(
                "protection_completed",
                domain,
                `${label} stayed protected through a scheduled block`,
                `${formatMinutes(estimatedMs)} reclaimed from that window`,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:protected`,
                    notify: false,
                    priority: 76 + Math.min(20, Math.round(estimatedMs / (30 * MINUTE_MS))),
                    context: {
                        estimatedMs,
                        hour,
                        daypart: daypartForHour(hour)
                    }
                }
            ));
        });
    }

    function addNavigationReturnInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const todayDomains = behaviorDomains(input, now, 1);
        const minQuickReturns = thresholds.highVisitCount <= 5 ? 1 : 2;

        todayDomains.forEach((domain) => {
            const events = behaviorEventsForDomain(input, domain, now, 1);
            const afterClose = countBehaviorEvents(events, ["return_after_close"]);
            const newTabNav = countBehaviorEvents(events, ["new_tab_quick_nav"]);
            const quickReturnCount = afterClose + newTabNav;
            if (quickReturnCount < minQuickReturns) return;

            const latest = events
                .filter((event) => event.type === "return_after_close" || event.type === "new_tab_quick_nav")
                .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))[0] || {};
            const hour = Number(latest.hour ?? new Date(now).getHours());
            const label = domainLabel(domain);
            const title = afterClose >= newTabNav
                ? `${label} keeps coming back after tabs close`
                : `${label} is showing up in fresh tabs`;
            const message = afterClose >= newTabNav
                ? `${pluralize(afterClose, "return")} after closing a tab today`
                : `${pluralize(newTabNav, "quick new-tab visit")} today`;

            insights.push(makeInsight(
                "quick_return_pattern",
                domain,
                title,
                message,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:quick-return`,
                    notify: quickReturnCount >= thresholds.highVisitCount,
                    priority: 86 + Math.min(24, quickReturnCount * 6),
                    context: {
                        count: quickReturnCount,
                        afterClose,
                        newTabNav,
                        hour,
                        daypart: daypartForHour(hour)
                    }
                }
            ));
        });
    }

    function addInterspersedVisitInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const events = sortedBehaviorEvents(input, now, 1, ["navigation_visit", "site_switch"])
            .filter((event) => isValidDomain(event.domain));
        if (events.length < 5) return;

        const byDomain = new Map();
        events.forEach((event, index) => {
            const domain = normalizeDomain(event.domain);
            if (!byDomain.has(domain)) {
                byDomain.set(domain, {
                    visits: 0,
                    interspersedReturns: 0,
                    otherDomains: new Set(),
                    lastIndex: -1,
                    lastSeenOther: false,
                    latestHour: Number(event.hour ?? new Date(now).getHours())
                });
            }
            const record = byDomain.get(domain);
            record.visits += event.type === "navigation_visit" ? 1 : 0;
            record.latestHour = Number(event.hour ?? record.latestHour);

            if (record.lastIndex >= 0 && record.lastSeenOther) {
                record.interspersedReturns += 1;
            }
            record.lastIndex = index;
            record.lastSeenOther = false;

            byDomain.forEach((otherRecord, otherDomain) => {
                if (otherDomain === domain || otherRecord.lastIndex < 0) return;
                otherRecord.lastSeenOther = true;
                otherRecord.otherDomains.add(domain);
            });
        });

        byDomain.forEach((record, domain) => {
            const minReturns = thresholds.highVisitCount <= 5 ? 2 : 3;
            if (record.interspersedReturns < minReturns) return;
            if (record.otherDomains.size < 2 && record.visits < thresholds.highVisitCount) return;

            const label = domainLabel(domain);
            const hour = Number(record.latestHour);
            insights.push(makeInsight(
                "interspersed_visit_pattern",
                domain,
                `${label} keeps reappearing between other sites`,
                `${pluralize(record.interspersedReturns, "return")} after visiting elsewhere today`,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:interspersed`,
                    notify: record.interspersedReturns >= thresholds.highVisitCount,
                    priority: 80 + Math.min(24, record.interspersedReturns * 5) + Math.min(8, record.otherDomains.size),
                    context: {
                        count: record.interspersedReturns,
                        visits: record.visits,
                        otherDomainCount: record.otherDomains.size,
                        hour,
                        daypart: daypartForHour(hour)
                    }
                }
            ));
        });
    }

    function addSubstitutionInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const events = sortedBehaviorEvents(input, now, 1, ["blocked_page_view", "block_redirect", "navigation_visit"]);
        const substitutions = new Map();
        const windowMs = 5 * MINUTE_MS;

        events.forEach((event, index) => {
            if (!isBlockedReturnEvent(event)) return;
            const blockedDomain = normalizeDomain(event.domain);
            const blockedAt = Number(event.timestamp || 0);
            if (!isValidDomain(blockedDomain) || !blockedAt) return;

            for (let nextIndex = index + 1; nextIndex < events.length; nextIndex += 1) {
                const next = events[nextIndex];
                const nextAt = Number(next.timestamp || 0);
                if (!nextAt || nextAt - blockedAt > windowMs) break;
                if (next.type !== "navigation_visit") continue;

                const substituteDomain = normalizeDomain(next.domain);
                if (!isValidDomain(substituteDomain) || substituteDomain === blockedDomain) continue;
                const key = `${blockedDomain}>${substituteDomain}`;
                const record = substitutions.get(key) || {
                    blockedDomain,
                    substituteDomain,
                    count: 0,
                    latestHour: Number(next.hour ?? new Date(now).getHours())
                };
                record.count += 1;
                record.latestHour = Number(next.hour ?? record.latestHour);
                substitutions.set(key, record);
                break;
            }
        });

        substitutions.forEach((record) => {
            const minCount = thresholds.highVisitCount <= 5 ? 2 : 3;
            if (record.count < minCount) return;

            insights.push(makeInsight(
                "substitution_pattern",
                record.substituteDomain,
                `After ${domainLabel(record.blockedDomain)} was blocked, ${domainLabel(record.substituteDomain)} became the next stop`,
                `Opened ${pluralize(record.count, "time")} within five minutes`,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:substitution:${record.blockedDomain}`,
                    notify: false,
                    priority: 118 + Math.min(20, record.count * 4),
                    context: {
                        blockedDomain: record.blockedDomain,
                        substituteDomain: record.substituteDomain,
                        count: record.count,
                        windowMinutes: 5,
                        hour: record.latestHour,
                        daypart: daypartForHour(record.latestHour)
                    }
                }
            ));
        });
    }

    function addBaselineImprovementInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const todayDomains = behaviorDomains(input, now, 1);

        todayDomains.forEach((domain) => {
            const todayCount = blockedReturnCountForDay(input, dateKey, domain);
            if (todayCount <= 0) return;

            const recent = [];
            for (let offset = 1; offset <= 7; offset += 1) {
                const count = blockedReturnCountForDay(input, dayKeyOffset(now, offset), domain);
                if (count > 0) recent.push(count);
            }
            if (recent.length < 3) return;

            const usualCount = Math.round(recent.reduce((sum, count) => sum + count, 0) / recent.length);
            if (usualCount < Math.max(4, thresholds.highVisitCount)) return;
            if (todayCount > Math.max(1, Math.floor(usualCount * 0.7))) return;

            insights.push(makeInsight(
                "baseline_improvement",
                domain,
                `${domainLabel(domain)} returns dropped below your usual pattern`,
                `Down from your usual ${usualCount} to ${todayCount} today`,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:improvement`,
                    notify: false,
                    priority: 130 + Math.min(18, usualCount - todayCount),
                    context: {
                        todayCount,
                        usualCount,
                        historyDays: recent.length
                    }
                }
            ));
        });
    }

    function addEscalationInsights(insights, input, settings, now, dateKey) {
        const thresholds = thresholdsFor(settings);
        const todayDomains = behaviorDomains(input, now, 1);
        const cutoffHour = 20;

        todayDomains.forEach((domain) => {
            const events = blockedReturnEventsForDomain(input, domain, now, 1)
                .filter((event) => event.source !== "scheduled");
            const total = events.length;
            if (total < Math.max(3, Math.floor(thresholds.highVisitCount / 2))) return;

            const lateCount = events.filter((event) => Number(event.hour) >= cutoffHour).length;
            if (lateCount <= total / 2) return;

            insights.push(makeInsight(
                "late_escalation",
                domain,
                `Most of today's ${domainLabel(domain)} attempts happened after ${compactHourLabel(cutoffHour)}`,
                `${pluralize(lateCount, "attempt")} after ${compactHourLabel(cutoffHour)} out of ${total} today`,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:late-escalation`,
                    notify: lateCount >= thresholds.highVisitCount,
                    priority: 115 + Math.min(18, lateCount * 3),
                    context: {
                        count: lateCount,
                        total,
                        cutoffHour,
                        hour: cutoffHour,
                        daypart: daypartForHour(cutoffHour)
                    }
                }
            ));
        });
    }

    function addInterventionEffectivenessInsights(insights, input, settings, now, dateKey) {
        const events = sortedBehaviorEvents(input, now, 1, ["blocked_page_view", "block_redirect"])
            .filter((event) => isValidDomain(event.domain));
        const scheduled = events.filter((event) => event.source === "scheduled");
        const limit = events.filter((event) => event.source !== "scheduled");
        if (scheduled.length < 2 || scheduled.length <= limit.length) return;

        const topScheduledDomain = Object.entries(scheduled.reduce((counts, event) => {
            const domain = normalizeDomain(event.domain);
            counts[domain] = Number(counts[domain] || 0) + 1;
            return counts;
        }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!isValidDomain(topScheduledDomain)) return;

        insights.push(makeInsight(
            "intervention_effectiveness",
            topScheduledDomain,
            "Scheduled blocks stopped more returns than your daily limits today",
            `${scheduled.length} scheduled returns stopped vs ${limit.length} daily-limit ${limit.length === 1 ? "return" : "returns"}`,
            {
                now,
                dateKey,
                contextKey: `${dateKey}:intervention-effectiveness`,
                notify: false,
                priority: 114 + Math.min(20, scheduled.length - limit.length),
                context: {
                    scheduledCount: scheduled.length,
                    limitCount: limit.length,
                    topDomain: topScheduledDomain
                }
            }
        ));
    }

    function addMultiDayReturnLeaderInsights(insights, input, settings, now, dateKey) {
        const wins = {};
        const windowDays = 5;

        for (let offset = 0; offset < windowDays; offset += 1) {
            const day = dayKeyOffset(now, offset);
            const top = Object.entries(blockedReturnCountsByDomainForDay(input, day))
                .sort((a, b) => b[1] - a[1])[0];
            if (!top || top[1] <= 0) continue;
            wins[top[0]] = Number(wins[top[0]] || 0) + 1;
        }

        Object.entries(wins).forEach(([domain, days]) => {
            if (days < 3) return;

            insights.push(makeInsight(
                "multi_day_return_leader",
                domain,
                `${domainLabel(domain)} has been your most frequent return for ${days} of the last ${windowDays} days`,
                `It led your blocked-return list on most recent active days`,
                {
                    now,
                    dateKey,
                    contextKey: `${dateKey}:multi-day-leader`,
                    notify: false,
                    priority: 132 + days * 4,
                    context: {
                        days,
                        windowDays
                    }
                }
            ));
        });
    }

    function dedupeInsights(insights) {
        const byDomain = new Map();

        insights.forEach((insight) => {
            if (!insight || !isValidDomain(insight.domain)) return;
            const existing = byDomain.get(insight.domain);
            if (!existing || Number(insight.priority || 0) > Number(existing.priority || 0)) {
                byDomain.set(insight.domain, insight);
            }
        });

        return Array.from(byDomain.values())
            .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || Number(b.timestamp || 0) - Number(a.timestamp || 0));
    }

    function disambiguateInsightLabels(insights) {
        const labelCounts = insights.reduce((counts, insight) => {
            const label = domainLabel(insight.domain);
            if (label) counts[label] = (counts[label] || 0) + 1;
            return counts;
        }, {});

        return insights.map((insight) => {
            const label = domainLabel(insight.domain);
            if (labelCounts[label] <= 1) return insight;

            const expanded = domainLabel(insight.domain, { expanded: true });
            if (!expanded || expanded === label) return insight;

            return {
                ...insight,
                title: String(insight.title || "").replace(label, expanded),
                message: String(insight.message || "").replace(label, expanded)
            };
        });
    }

    function analyzeUsagePatterns(input = {}) {
        const settings = getInsightSettings(input.settings || {});
        if (!settings.personalInsightsEnabled) return [];
        if (!insightDataReadiness(input).ready) return [];

        const now = Number(input.now || Date.now());
        const dateKey = dayKeyOffset(now, 0);
        const insights = [];

        addLongSessionInsight(insights, input, settings, now, dateKey);
        addBlockedReturnInsights(insights, input, settings, now, dateKey);
        addSnoozeLoopInsights(insights, input, settings, now, dateKey);
        addProtectionCompletedInsights(insights, input, settings, now, dateKey);
        addNavigationReturnInsights(insights, input, settings, now, dateKey);
        addInterspersedVisitInsights(insights, input, settings, now, dateKey);
        addSubstitutionInsights(insights, input, settings, now, dateKey);
        addBaselineImprovementInsights(insights, input, settings, now, dateKey);
        addEscalationInsights(insights, input, settings, now, dateKey);
        addInterventionEffectivenessInsights(insights, input, settings, now, dateKey);
        addMultiDayReturnLeaderInsights(insights, input, settings, now, dateKey);
        addRecurringTimeBlockInsights(insights, input, settings, now, dateKey);
        addHighVisitFrequencyInsights(insights, input, settings, now, dateKey);
        addUsageIncreaseInsights(insights, input, settings, now, dateKey);
        addLimitSuggestionInsights(insights, input, settings, now, dateKey);

        return disambiguateInsightLabels(dedupeInsights(insights));
    }

    global.StmInsights = {
        DEFAULT_INSIGHT_SETTINGS,
        SENSITIVITY_THRESHOLDS,
        analyzeUsagePatterns,
        insightDataReadiness,
        getInsightSettings,
        normalizeDomain,
        isValidDomain,
        getDayKey,
        DAY_MS
    };
})(typeof globalThis !== "undefined" ? globalThis : self);
