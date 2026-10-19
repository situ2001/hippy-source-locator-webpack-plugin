import type { OxlintConfig } from "oxlint";
import base from "@situ2001/code-quality/oxlint";

export default {
  extends: [base],
  options: { typeAware: true },
  ignorePatterns: ["dist/**"],
} satisfies OxlintConfig;
