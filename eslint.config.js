import globals from "globals";

export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        importScripts: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "warn",
      semi: ["error", "always"],
      quotes: ["error", "double", { avoidEscape: true }],
      "no-undef": "error",
    },
  },
  {
    ignores: ["build/", "node_modules/", ".git/", "eslint.config.js", "examples/"],
  },
];
