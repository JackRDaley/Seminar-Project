const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e/website',
  timeout: 30000,
  workers: 1,
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
