import { createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import archiver from "archiver";

const root = resolve(import.meta.dirname, "..");
const distRoot = resolve(root, "dist");
const stageDir = resolve(distRoot, "contents");
const manifest = JSON.parse(
  await (await import("node:fs/promises")).readFile(resolve(root, "manifest.json"), "utf8"),
);
const version = manifest.version;
const zipName = `no-more-shorts-${version}.zip`;
const zipPath = resolve(distRoot, zipName);

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

const entries = ["manifest.json", "rules.json", "background.js"];
for (const entry of entries) {
  await (await import("node:fs/promises")).copyFile(
    resolve(root, entry),
    resolve(stageDir, entry),
  );
}

const iconsSrc = resolve(root, "icons");
const iconsDst = resolve(stageDir, "icons");
mkdirSync(iconsDst, { recursive: true });
for (const name of readdirSync(iconsSrc)) {
  if (name === "source.svg") continue;
  if (!name.endsWith(".png")) continue;
  await (await import("node:fs/promises")).copyFile(
    resolve(iconsSrc, name),
    resolve(iconsDst, name),
  );
}

await new Promise((resolvePromise, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolvePromise);
  archive.on("warning", (err) => {
    if (err.code === "ENOENT") console.warn(err);
    else reject(err);
  });
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(stageDir, false);
  archive.finalize();
});

const size = statSync(zipPath).size;
console.log(`Built ${zipPath} (${size} bytes)`);
