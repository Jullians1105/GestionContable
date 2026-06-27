module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/controllers/fondo*.js',
    '!src/routes/fondo*.js',
    '!src/middleware/fondoAccess.js',
    '!src/services/pushService.js',
    '!src/services/recurringTaskService.js',
    '!src/services/reminderService.js',
  ],
  coverageThreshold: { global: { lines: 70, functions: 70 } },
  maxWorkers: 1,
};
