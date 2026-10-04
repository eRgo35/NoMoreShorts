import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const contentPath = resolve(import.meta.dirname, "..", "content.js");
const source = readFileSync(contentPath, "utf8");

describe("content.js", () => {
  it("defines SHORTS_RE matching /shorts/<id>", () => {
    expect(source).toMatch(/SHORTS_RE\s*=\s*\/[\^/][^\n]*?\/[a-z]*\s*;/);
    const m = source.match(/SHORTS_RE\s*=\s*(\/\^https[\s\S]*?\$\/[a-z]*)/);
    expect(m).not.toBeNull();
    const body = m[1].slice(1, m[1].lastIndexOf("/"));
    const regex = new RegExp(body);
    expect(regex.exec("https://www.youtube.com/shorts/dQw4w9WgXcQ")).not.toBeNull();
    expect(
      regex.exec("https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share"),
    ).not.toBeNull();
    expect(regex.exec("https://www.youtube.com/shorts/abc/extra")).toBeNull();
  });

  it("defines TARGET_BASE pointing to /watch?v=", () => {
    expect(source).toMatch(
      /TARGET_BASE\s*=\s*"https:\/\/www\.youtube\.com\/watch\?v="/,
    );
  });

  it("patches history.pushState", () => {
    expect(source).toMatch(/history\.pushState\s*=/);
  });

  it("patches history.replaceState", () => {
    expect(source).toMatch(/history\.replaceState\s*=/);
  });

  it("registers a popstate listener", () => {
    expect(source).toMatch(/addEventListener\(\s*["']popstate["']/);
  });
});
