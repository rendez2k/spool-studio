import { build } from "esbuild";
import { readdir, readFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { writeFile } from "node:fs/promises";

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json; charset=utf-8" };
const assets = {};
async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const url = prefix + "/" + entry.name;
    if (url === "/previews") continue;
    if (entry.isDirectory()) await collect(file, url);
    else assets[url] = { data: (await readFile(file)).toString("base64"), type: types[path.extname(file)] || "text/plain; charset=utf-8" };
  }
}
const icon = await readFile("out/icons/filament.svg");
for (const size of [32, 180, 192, 512]) {
  const png = new Resvg(icon, { fitTo: { mode: "width", value: size } }).render().asPng();
  await writeFile("out/icons/filament-" + size + ".png", png);
}
await collect("out");
await build({
  entryPoints: ["server/worker.mjs"], outfile: "dist/server/index.js", bundle: true, format: "esm", platform: "browser", target: "es2022",
  plugins: [{ name: "filament-assets", setup(builder) {
    builder.onResolve({ filter: /^filament-assets$/ }, () => ({ path: "assets", namespace: "filament" }));
    builder.onLoad({ filter: /.*/, namespace: "filament" }, () => ({ contents: "export default " + JSON.stringify(assets), loader: "js" }));
  } }],
});
await mkdir("dist/.openai", { recursive: true });
try {
  await cp(".openai/hosting.json", "dist/.openai/hosting.json");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await cp("drizzle", "dist/.openai/drizzle", { recursive: true });
