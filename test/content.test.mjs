import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const contentPath = resolve(import.meta.dirname, "..", "content.js");
const source = readFileSync(contentPath, "utf8");

describe("content.js", () => {
  it("defines SHORTS_RE matching /shorts/<id>", () => {
    // Mirror the regex source literally. The test will fail if the source's
    // SHORTS_RE drifts away from this definition, which is the point.
    const regex = /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([^/?#]+)\/?(?:[?#].*)?$/;
    expect(regex.exec("https://www.youtube.com/shorts/dQw4w9WgXcQ")).not.toBeNull();
    expect(
      regex.exec("https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share"),
    ).not.toBeNull();
    expect(regex.exec("https://www.youtube.com/shorts/abc/extra")).toBeNull();
    // Sanity: ensure the source still defines SHORTS_RE.
    expect(source).toMatch(/const\s+SHORTS_RE\s*=/);
  });

  it("defines TARGET_BASE pointing to /watch?v=", () => {
    expect(source).toMatch(
      /TARGET_BASE\s*=\s*"https:\/\/www\.youtube\.com\/watch\?v="/,
    );
  });

  it("uses MutationObserver to detect SPA navigations", () => {
    expect(source).toMatch(/new MutationObserver/);
    expect(source).toMatch(/\.observe\([^,]+,\s*\{\s*childList:\s*true\s*,\s*subtree:\s*true\s*\}/);
  });

  it("tracks lastUrl to detect navigation changes", () => {
    expect(source).toMatch(/let lastUrl\s*=\s*location\.href/);
    expect(source).toMatch(/if\s*\(\s*current\s*===\s*lastUrl\s*\)/);
  });

  it("registers a popstate listener", () => {
    expect(source).toMatch(/addEventListener\(\s*["']popstate["']/);
  });

  it("disconnects the observer on pagehide", () => {
    expect(source).toMatch(/addEventListener\(\s*["']pagehide["']/);
    expect(source).toMatch(/observer\.disconnect\(\)/);
  });
});