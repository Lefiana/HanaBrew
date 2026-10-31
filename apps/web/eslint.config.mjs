import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import root from "../../eslint.config.mjs";

export default [
  ...root,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
