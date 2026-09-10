import "./build.mjs";
import { mkdir, readdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { renderReleaseHTML, validateReleases } from './releases.mjs';
const releases = validateReleases(JSON.parse(await readFile('releases.json', 'utf8')));

const publicRoot = path.resolve("dist/netlify-public");
const pagesRoot = path.resolve("dist/netlify-pages");
for (const target of [publicRoot, pagesRoot]) {
  if (path.dirname(target) !== path.resolve("dist")) throw Error("Invalid build directory.");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
}
const privatePages = new Set(["index.html", "nfc.html", "import.html", "app.html", "reels.html", "welcome.html"]);
function portableText(content) {
  return content.replaceAll("/signin-with-chatgpt", "/sign-in").replaceAll("/signout-with-chatgpt", "/sign-out").replaceAll("Sign in with ChatGPT", "Sign in").replaceAll("same ChatGPT account", "same Spool Studio account");
}
async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || (prefix === "" && entry.name === "previews")) continue;
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) { await collect(path.join(directory, entry.name), relative); continue; }
    const destination = path.join(privatePages.has(relative) ? pagesRoot : publicRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    if (/\.(html|js)$/.test(entry.name)) {
      let content = portableText(await readFile(path.join(directory, entry.name), "utf8"));
      if (entry.name.endsWith('.html')) content = renderReleaseHTML(content, releases);
      if (privatePages.has(relative)) content = content.replace("</head>", "<!-- CLERK --></head>");
      if (relative === "privacy.html") content = content.replace("OpenAI Sites handles Sign in and provides a Site-specific account identifier. Spool Studio uses that identifier to retrieve and protect your records. It does not receive your ChatGPT password or request access to your chats or mailbox.", "Clerk handles account registration and sign-in. Spool Studio uses your Clerk account identifier to protect your records. Netlify hosts the app and its private Postgres inventory database. Spool Studio does not connect to your mailbox or receive your sign-in password.");
      if (relative === "privacy.html") content = content.replace("Spool Studio runs on OpenAI Sites using Cloudflare Workers and a D1 database.", "Spool Studio runs on Netlify Functions and Netlify Database (Postgres), with Clerk for authentication.").replace('https://openai.com/policies/eu-privacy-policy/', 'https://clerk.com/legal/privacy').replace('OpenAI’s Europe/UK privacy policy', 'Clerk’s privacy policy').replace('https://www.cloudflare.com/privacypolicy/', 'https://www.netlify.com/privacy/').replace('Cloudflare’s privacy policy', 'Netlify’s privacy policy').replace('There is currently no automatic expiry or self-service account deletion.', 'There is currently no automatic inventory expiry. Deleting a Clerk login does not automatically delete the separate inventory records; contact us to request removal of both.');
      await writeFile(destination, content);
    } else await cp(path.join(directory, entry.name), destination);
  }
}
await collect("out");
await cp("hosting/netlify/auth.html", path.join(pagesRoot, "auth.html"));
await cp("hosting/netlify/auth-client.js", path.join(publicRoot, "auth-client.js"));
const fingerprint = createHash("sha256");
async function hashDirectory(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await hashDirectory(filename);
    else {
      fingerprint.update(path.relative(process.cwd(), filename).replaceAll(path.sep, "/"));
      fingerprint.update(await readFile(filename));
    }
  }
}
for (const directory of [publicRoot, pagesRoot, "server", "netlify/functions"]) await hashDirectory(directory);
const version = fingerprint.digest("hex").slice(0, 12);
const appPage = path.join(pagesRoot, "app.html");
await writeFile(appPage, (await readFile(appPage, "utf8")).replace('name="app-release" content="development"', 'name="app-release" content="' + version + '"'));
await writeFile(path.join(publicRoot, "app-release.json"), JSON.stringify({ version, displayVersion: releases[0].version }));
console.log("Netlify assets prepared. Private pages remain function-only; no account data is bundled.");
