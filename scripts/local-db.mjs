import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

export function localDatabase(filename = ":memory:") {
  const database = new DatabaseSync(filename);
  database.exec("CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)");
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url)).filter(name => name.endsWith(".sql")).sort()) {
    if (database.prepare("SELECT name FROM local_migrations WHERE name = ?").get(name)) continue;
    database.exec(readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8"));
    database.prepare("INSERT INTO local_migrations (name) VALUES (?)").run(name);
  }
  return {
    async currentMilliseconds() { return Date.now(); },
    close() { database.close(); },
    prepare(sql) {
      return { bind(...values) {
        return {
          async first() { return database.prepare(sql).get(...values) || null; },
          async run() { const result = database.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
        };
      } };
    },
  };
}
