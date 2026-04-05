import tsParser from "@typescript-eslint/parser";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

const blankLinesRule = {
  "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0, maxBOF: 0 }],
};

const languageOptions = {
  globals: { ...globals.node, ...globals.browser },
};

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
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ...languageOptions,
      parser: tsParser,
    },
    rules: blankLinesRule,
  },
];
