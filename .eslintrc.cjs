module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'backend/', 'mcpServer/', 'cypress/'],
  overrides: [
    {
      files: ['public/sw.js'],
      env: { browser: false, serviceworker: true, es2020: true },
    },
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    // Deshabilitado: el proyecto usa JS sin PropTypes explícitos
    'react/prop-types': 'off',
    // Deshabilitado: los contextos exportan múltiples cosas por diseño
    'react-refresh/only-export-components': 'off',
    'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrors: 'none' }],
  },
};
