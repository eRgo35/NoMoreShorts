import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const sizes = [16, 32, 48, 96, 128];
const root = resolve(import.meta.dirname, "..");
const svgPath = resolve(root, "icons/source.svg");

if (!existsSync(svgPath)) {
  console.error(`Missing ${svgPath}`);
  process.exit(1);
}

try {
  execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" });
} catch {
  console.error("rsvg-convert not found. Install librsvg2-bin (apt) or librsvg (brew).");
  process.exit(1);
}

for (const size of sizes) {
  const out = resolve(root, `icons/icon-${size}.png`);
  execFileSync("rsvg-convert", [
    "-w", String(size),
    "-h", String(size),
    "-f", "png",
    "-o", out,
    svgPath,
  ]);
  console.log(`wrote ${out}`);
}

// Sanity: each PNG must be non-empty
for (const size of sizes) {
  const buf = readFileSync(resolve(root, `icons/icon-${size}.png`));
  if (buf.length < 100) {
    console.error(`icons/icon-${size}.png suspiciously small (${buf.length} bytes)`);
    process.exit(1);
  }
}
