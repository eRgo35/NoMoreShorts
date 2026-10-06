import { cpSync, mkdirSync, readdirSync, rmSync, statSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import archiver from "archiver";

const root = resolve(import.meta.dirname, "..");
const distRoot = resolve(root, "dist");

const manifest = JSON.parse(
  await (await import("node:fs/promises")).readFile(resolve(root, "manifest.json"), "utf8"),
);
const version = manifest.version;

const chromeDir = resolve(distRoot, "chrome");
const firefoxDir = resolve(distRoot, "firefox");
const zipName = `NoMoreShorts-v${version}.zip`;
const xpiName = `NoMoreShorts-v${version}.xpi`;
const zipPath = resolve(distRoot, zipName);
const xpiPath = resolve(distRoot, xpiName);

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(chromeDir, { recursive: true });
mkdirSync(firefoxDir, { recursive: true });

function copyBaseFiles(target) {
  for (const entry of ["manifest.json", "rules.json", "background.js", "content.js"]) {
    cpSync(resolve(root, entry), resolve(target, entry));
  }
  const iconsDst = resolve(target, "icons");
  mkdirSync(iconsDst, { recursive: true });
  for (const name of readdirSync(resolve(root, "icons"))) {
    if (name === "source.svg") continue;
    if (!name.endsWith(".png")) continue;
    cpSync(resolve(root, "icons", name), resolve(iconsDst, name));
  }
}

copyBaseFiles(chromeDir);
copyBaseFiles(firefoxDir);

// Strip Firefox-specific background from the Chrome build so the manifest is clean for
// chrome://extensions "Load unpacked" and future .crx packaging (no key needed today).
const chromeManifest = { ...manifest };
delete chromeManifest.browser_specific_settings;
await (await import("node:fs/promises")).writeFile(
  resolve(chromeDir, "manifest.json"),
  JSON.stringify(chromeManifest, null, 2) + "\n",
);

// For Firefox, ensure the top-level service_worker is gone so only the gecko.background
// event page definition remains. Some Firefox builds still accept service_worker, but
// removing it is the cleanest cross-version behavior with the gecko override in place.
const firefoxManifest = JSON.parse(JSON.stringify(manifest));
delete firefoxManifest.background;
await (await import("node:fs/promises")).writeFile(
  resolve(firefoxDir, "manifest.json"),
  JSON.stringify(firefoxManifest, null, 2) + "\n",
);

function packZip(target, sourceDir) {
  return new Promise((resolvePromise, reject) => {
    const output = createWriteStream(target);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolvePromise);
    archive.on("warning", (err) => {
      if (err.code === "ENOENT") console.warn(err);
      else reject(err);
    });
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

await packZip(zipPath, firefoxDir);
await packZip(xpiPath, firefoxDir);

console.log(`Chrome (unpacked): ${chromeDir}`);
console.log(`Firefox (unpacked): ${firefoxDir}`);
console.log(`Built ${zipPath} (${statSync(zipPath).size} bytes)`);
console.log(`Built ${xpiPath} (${statSync(xpiPath).size} bytes)`);