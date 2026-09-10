import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const phoneBatches = sqliteTable("phone_batches", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull(),
  payload: text("payload").notNull(),
  requestId: text("request_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const libraries = sqliteTable("libraries", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull(),
  payload: text("payload").notNull(),
  requestId: text("request_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const serviceLimits = sqliteTable("service_limits", {
  name: text("name").primaryKey(),
  revision: integer("revision").notNull(),
  payload: text("payload").notNull(),
});
