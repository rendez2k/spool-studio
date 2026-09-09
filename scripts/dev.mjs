import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { localDatabase } from "./local-db.mjs";

mkdirSync(".local", { recursive: true });
const database = localDatabase(".local/phone.sqlite");
const worker = (await import(pathToFileURL(path.resolve("dist/server/index.js")))).default;
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, "http://127.0.0.1:8766");
    if (incoming.headers.host !== "127.0.0.1:8766") { outgoing.writeHead(403); outgoing.end(); return; }
    const headers = new Headers(incoming.headers);
    headers.set("oai-authenticated-user-id", "local-preview-only");
    const request = new Request(url, { method: incoming.method, headers, body: ["GET", "HEAD"].includes(incoming.method) ? undefined : incoming, duplex: "half" });
    const response = await worker.fetch(request, { DB: database });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end("Local preview unavailable"); }
});
server.listen(8766, "127.0.0.1", () => console.log("Preview http://127.0.0.1:8766"));
