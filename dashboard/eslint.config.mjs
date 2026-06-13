// Flat-config ESLint setup for ESLint v9 + Next.js 16.
// `eslint-config-next@16` already ships a flat-config array, so we spread it
// in and layer our own overrides on top.
//
// Adding `core-web-vitals` pulls in the recommended a11y + perf rules; if it
// gets too noisy for the existing codebase, drop back to the base `next`
// config by importing from "eslint-config-next" instead.
import nextConfig from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  // Ignore generated + vendored output before anything else picks it up.
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "next-env.d.ts",
      "public/**",
      "scripts/**",
      "supabase/migrations/**",
      ".vercel/**",
    ],
  },

  // Base Next.js + Core Web Vitals rules (flat array).
  ...nextConfig,

  // Project-wide overrides. Keep these loose for the first pass — we want
  // `npm run lint` to actually run; tightening individual rules is a
  // separate sweep (tracked in CLAUDE.md backlog).
  {
    rules: {
      // React 19 + Next.js 16 server components don't need React in scope.
      "react/react-in-jsx-scope": "off",
      "react/no-unescaped-entities": "off",
      // React Compiler rules are useful migration signals, but the current
      // app has a large legacy backlog. Keep builds/lint actionable while we
      // burn these down incrementally instead of blocking every audit pass.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // We use lucide-react components; alt text is added at the icon level.
      "jsx-a11y/alt-text": "warn",
      // The base ESLint rule double-fires with the typescript-eslint
      // version, so just turn the JS one off and let TS handle it below.
      "no-unused-vars": "off",
    },
  },

  // TypeScript-only overrides. The `@typescript-eslint` plugin is loaded by
  // the `next/typescript` config from `eslint-config-next`, so these rules
  // must live in a TS-scoped object or ESLint can't resolve the plugin.
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    rules: {
      // The codebase intentionally uses `any` for loose Supabase join shapes;
      // a typed cleanup is tracked separately in the backlog.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
