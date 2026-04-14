import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".next/**",
      ".source/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
];

config.push({
  files: [
    "src/app/dashboard/playground/page.tsx",
    "src/app/dashboard/screenshots/page.tsx",
  ],
  rules: {
    "@next/next/no-img-element": "off",
  },
});

export default config;
