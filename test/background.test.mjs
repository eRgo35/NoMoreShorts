import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bgPath = resolve(import.meta.dirname, "..", "background.js");
const bgSource = readFileSync(bgPath, "utf8");

describe("background.js", () => {
  it("registers a dynamic fallback rule with id 100", () => {
    expect(bgSource).toMatch(/FALLBACK_RULE_ID\s*=\s*100/);
  });

  it("uses regexSubstitution referring to capture group 1", () => {
    expect(bgSource).toMatch(/regexSubstitution[^"]*"https:\/\/www\.youtube\.com\/watch\?v=\\\\1"/);
  });

  it("skips re-registration if rule id already present", () => {
    expect(bgSource).toMatch(/existing\.some\(\(r\) => r\.id === FALLBACK_RULE_ID\)/);
  });

  it("registers listener on runtime.onInstalled via chrome or browser global", () => {
    expect(bgSource).toMatch(/chrome\.runtime\.onInstalled|browser\.runtime\.onInstalled/);
  });

  it("falls back to console.error on registration failure", () => {
    expect(bgSource).toMatch(/console\.error/);
  });
});
