import tsParser from "@typescript-eslint/parser";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const blankLinesRule = {
  "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0, maxBOF: 0 }],
};

const languageOptions = {
  globals: { ...globals.node, ...globals.browser },
};

// typescript-eslint's "recommended" preset is a list of flat configs, not a
// single object: merge the rules of every entry (spreading
// `configs.recommended.rules` yields nothing, so no TS rule ran before).
const tsRecommendedRules = Object.assign(
  {},
  ...tseslint.configs.recommended.map((config) => config.rules ?? {}),
);

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/build/**"],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions,
    rules: blankLinesRule,
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ...languageOptions,
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      ...blankLinesRule,
      ...tsRecommendedRules,
      // A leading underscore marks an intentionally unused name: Express's
      // 4-argument error handler, fields dropped with rest destructuring,
      // positional parameters kept for the signature.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // ~3,600 existing `any`s, mostly in the gateway: reported as warnings so
      // they stay visible while they are typed package by package, without
      // blocking CI. Raise to "error" per package once it is clean.
      "@typescript-eslint/no-explicit-any": "warn",
      // A `let` read by a cleanup closure declared before its one assignment
      // can't become `const` (the closure would hit the temporal dead zone).
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
    },
  },
  {
    // Jest tests load modules inline after jest.resetModules()/jest.mock()
    // to get a fresh instance; that requires require().
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // The web app: enforce the Rules of Hooks and effect dependencies
    // (React 19's useEffectEvent is understood by eslint-plugin-react-hooks).
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
