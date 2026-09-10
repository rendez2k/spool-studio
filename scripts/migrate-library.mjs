import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createClerkClient } from "@clerk/backend";
import { getDatabase } from "@netlify/database";
import { inspectMigration, migrateIntoEmptyAccount } from "../server/migration.mjs";

const { values } = parseArgs({ options: { snapshot: { type: "string" }, "target-user": { type: "string" }, "expected-email": { type: "string" }, apply: { type: "boolean", default: false }, "source-account": { type: "string" } } });
if (!values.snapshot) throw Error("Use --snapshot <private-file.json>. The default is an offline dry run.");
const inspection = inspectMigration(await readFile(values.snapshot, "utf8"));
console.log(JSON.stringify({ mode: values.apply ? "apply" : "dry-run", ...inspection.summary, sha256: inspection.hash }));
if (values.apply) {
  if (!values["target-user"] || !values["expected-email"] || values["source-account"] !== inspection.snapshot.source.accountKey) throw Error("Confirm the source account, target Clerk user and expected verified email explicitly.");
  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) throw Error("Use the destination's Clerk environment, never a source-site authentication header.");
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, publishableKey: process.env.CLERK_PUBLISHABLE_KEY });
  const user = await clerk.users.getUser(values["target-user"]);
  if (!user.emailAddresses.some(address => address.verification?.status === "verified" && address.emailAddress.toLowerCase() === values["expected-email"].toLowerCase())) throw Error("Destination identity could not be verified. Nothing was migrated.");
  const client = await getDatabase().pool.connect();
  try { console.log(JSON.stringify(await migrateIntoEmptyAccount(client, inspection, user.id))); }
  finally { client.release(); }
}
