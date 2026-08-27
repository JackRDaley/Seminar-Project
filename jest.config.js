module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js', '**/?(*.)+(spec|test).js'],
    collectCoverageFrom: [
        'background.js',
        'blocked.js',
        'gdpr-utils.js',
        'shared-extension-utils.js',
        '!node_modules/**'
    ],
    // popup.js is a browser entrypoint covered by the Playwright suite.
    coverageThreshold: {
        global: {
            branches: 40,
            functions: 40,
            lines: 40,
            statements: 40
        }
    },
    moduleNameMapper: {
        '^chrome\\..*': '<rootDir>/test_fixtures/chrome.js',
        '^globalThis.*': '<rootDir>/test_fixtures/globalThis.js'
    },
    setupFiles: ['<rootDir>/tests/setup.js'],
    transform: {},
    testTimeout: 10000
    ,
    testPathIgnorePatterns: ['/e2e/', '/server/', '/worker/']
};
