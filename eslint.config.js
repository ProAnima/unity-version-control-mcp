import js from "@eslint/js";

const nodeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  URL: "readonly"
};

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "*.tgz"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals
    },
    rules: {
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }],
      "no-constant-binary-expression": "error",
      "no-constructor-return": "error",
      "no-promise-executor-return": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unmodified-loop-condition": "error",
      "no-unreachable-loop": "error",
      "require-atomic-updates": "error"
    }
  }
];
