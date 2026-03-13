# Seminar-Project
Screen time management chrome extension

## UI Overhaul Smoke Checklist

- Open popup and verify all tabs render: Dashboard, Limits, Schedule, Settings.
- Add limit with explicit minutes and with blank minutes (should use default from Settings).
- Toggle 24-hour mode, save settings, close/reopen popup, and confirm preference persists.
- Create scheduled blocks in both formats:
	- 12-hour mode: 9:00 AM to 5:00 PM
	- 24-hour mode: 09:00 to 17:00
- Verify ranking cards show 3 rows with no clipping and dedicated progress line under each row.
- Verify block-list rows show progress only when a valid limit exists; rows without limit show no progress bar.
- Keep popup open for 30+ seconds while an active block runs and confirm countdown updates each second.
- Make a change in another popup tab action (add/remove/reset) and confirm UI updates without manual refresh.
