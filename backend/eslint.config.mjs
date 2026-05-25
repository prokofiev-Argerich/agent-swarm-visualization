import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // React 19 experimental rule — flags standard data-fetch patterns (fetch in effect -> setState).
      // Downgraded to warning until React ecosystem stabilizes or we migrate to a data-fetching library.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
