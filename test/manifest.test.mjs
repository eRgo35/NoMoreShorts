import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(import.meta.dirname, "..", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

describe("manifest.json", () => {
  it("declares manifest_version 3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it("uses service_worker background", () => {
    expect(manifest.background.service_worker).toBe("background.js");
  });

  it("requests DNR permissions and host permissions", () => {
    expect(manifest.permissions).toContain("declarativeNetRequest");
    expect(manifest.permissions).toContain("declarativeNetRequestWithHostAccess");
    expect(manifest.host_permissions).toContain("*://*.youtube.com/*");
  });

  it("does not request MV2-era permissions", () => {
    expect(manifest.permissions).not.toContain("webRequest");
    expect(manifest.permissions).not.toContain("webRequestBlocking");
    expect(manifest.permissions).not.toContain("webNavigation");
    expect(manifest.permissions).not.toContain("*://*.youtube.com/*");
    expect(manifest.host_permissions ?? []).toEqual(["*://*.youtube.com/*"]);
  });

  it("declares DNR rule resources", () => {
    expect(manifest.declarative_net_request).toBeTruthy();
    const resources = manifest.declarative_net_request.rule_resources;
    expect(resources).toHaveLength(1);
    expect(resources[0].path).toBe("rules.json");
    expect(resources[0].enabled).toBe(true);
  });

  it("declares Firefox gecko id and min version", () => {
    expect(manifest.browser_specific_settings.gecko.id).toBe(
      "nomoreshorts@czyz.icu",
    );
    expect(manifest.browser_specific_settings.gecko.strict_min_version).toBe(
      "115.0a1",
    );
  });

  it("declares five icon sizes", () => {
    const sizes = Object.keys(manifest.icons);
    expect(new Set(sizes)).toEqual(new Set(["16", "32", "48", "96", "128"]));
  });
});
