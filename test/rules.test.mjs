import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RE2 from "re2";

const rulesPath = resolve(import.meta.dirname, "..", "rules.json");
const rules = JSON.parse(readFileSync(rulesPath, "utf8"));

describe("rules.json", () => {
  it("has exactly one rule", () => {
    expect(rules).toHaveLength(1);
  });

  it("uses redirect action with regex substitution referencing \\1", () => {
    const rule = rules[0];
    expect(rule.action.type).toBe("redirect");
    expect(rule.action.redirect.regexSubstitution).toContain("\\1");
    expect(rule.action.redirect.regexSubstitution).toBe(
      "https://www.youtube.com/watch?v=\\1",
    );
  });

  it("scopes resourceTypes to main_frame and sub_frame", () => {
    expect(new Set(rules[0].condition.resourceTypes)).toEqual(
      new Set(["main_frame", "sub_frame"]),
    );
  });

  it("regex captures the short id and rewrites to /watch?v=<id>", () => {
    const pattern = rules[0].condition.regexFilter;
    const re = new RE2(pattern);
    const url = "https://www.youtube.com/shorts/dQw4w9WgXcQ";
    const m = re.exec(url);
    expect(m).not.toBeNull();
    const substituted = rules[0].action.redirect.regexSubstitution.replace(
      "\\1",
      m[1],
    );
    expect(substituted).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("does not match non-shorts YouTube URLs", () => {
    const re = new RE2(rules[0].condition.regexFilter);
    expect(re.exec("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(re.exec("https://www.youtube.com/")).toBeNull();
  });

  it("does not match shorts URLs with extra path segments", () => {
    const re = new RE2(rules[0].condition.regexFilter);
    expect(re.exec("https://www.youtube.com/shorts/abc/extra")).toBeNull();
  });

  it("does not use RE2-incompatible syntax (lookbehind)", () => {
    expect(rules[0].condition.regexFilter).not.toMatch(/\(\?<=|\(\?<!|\(\k</);
  });
});
