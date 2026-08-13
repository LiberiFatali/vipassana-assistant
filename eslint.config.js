import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/", ".vercel/", ".git/"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    files: ["public/**/*.{js,mjs}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
