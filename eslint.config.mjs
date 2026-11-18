// Flat ESLint configuration shared by every workspace package.
// Each package runs `eslint .` from its own directory; ESLint resolves this
// file by walking up to the repository root.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mjs"],
    languageOptions: {
      globals: {
        document: "readonly",
        process: "readonly",
        window: "readonly",
      },
    },
  },
);
