import type { OxfmtConfig } from "oxfmt";
import base from "@situ2001/code-quality/oxfmt";

export default {
  ...base,
  ignorePatterns: ["dist/**", "pnpm-lock.yaml"],
} satisfies OxfmtConfig;
