import { build } from "esbuild";
import { readdir, readFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { writeFile } from "node:fs/promises";
import { renderReleaseHTML, validateReleases } from './releases.mjs';
const releases = validateReleases(JSON.parse(await readFile('releases.json', 'utf8')));

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json; charset=utf-8" };
const assets = {};
await mkdir('out/vendor/gmail', { recursive: true });
await build({ entryPoints: ['browser/gmail-html.mjs'], outfile: 'out/vendor/gmail/html-text.js', bundle: true, format: 'iife', globalName: 'SpoolGmailHtml', platform: 'browser', target: 'es2022', minify: true });
await cp('node_modules/parse5/LICENSE', 'out/vendor/gmail/parse5-LICENSE.txt');
await cp('node_modules/entities/LICENSE', 'out/vendor/gmail/entities-LICENSE.txt');
const barcodeDirectory = "out/vendor/barcode";
await mkdir(barcodeDirectory, { recursive: true });
await build({ stdin: { contents: "import { BrowserMultiFormatOneDReader } from '@zxing/browser'; import { BarcodeFormat, DecodeHintType } from '@zxing/library'; export function createReader(){ return new BrowserMultiFormatOneDReader(new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_8,BarcodeFormat.EAN_13,BarcodeFormat.UPC_A,BarcodeFormat.CODE_128,BarcodeFormat.CODE_39,BarcodeFormat.ITF]]])); }", resolveDir: process.cwd() }, outfile: barcodeDirectory + "/decoder.js", bundle: true, format: "iife", globalName: "SpoolBarcodeDecoder", platform: "browser", target: "es2022", minify: true });
for (const name of ["browser", "library"]) await cp("node_modules/@zxing/" + name + "/LICENSE", barcodeDirectory + "/" + name + "-LICENSE.txt");
types['.csv'] = 'text/csv; charset=utf-8';
const ocrDirectory = "out/vendor/ocr";
await mkdir(ocrDirectory, { recursive: true });
for (const name of ["tesseract.min.js", "worker.min.js"]) await cp("node_modules/tesseract.js/dist/" + name, ocrDirectory + "/" + name);
for (const name of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) await cp("node_modules/tesseract.js-core/" + name, ocrDirectory + "/" + name);
await cp("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", ocrDirectory + "/eng.traineddata.gz");
await cp("node_modules/tesseract.js/LICENSE.md", ocrDirectory + "/tesseract-LICENSE.txt");
await cp("node_modules/tesseract.js-core/LICENSE", ocrDirectory + "/core-LICENSE.txt");
async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const url = prefix + "/" + entry.name;
    if (url === "/previews") continue;
    if (entry.isDirectory()) await collect(file, url);
    else {
      const bytes = await readFile(file);
      const content = file.endsWith('.html') ? Buffer.from(renderReleaseHTML(bytes.toString('utf8'), releases)) : bytes;
      assets[url] = { data: content.toString("base64"), type: types[path.extname(file)] || (url.endsWith(".gz") ? "application/octet-stream" : "text/plain; charset=utf-8") };
    }
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
