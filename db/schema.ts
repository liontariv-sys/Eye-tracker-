import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accessRequests = sqliteTable("access_requests", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  status: text("status", { enum: ["pending", "approved", "denied"] }).notNull().default("pending"),
  requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  decidedBy: text("decided_by"),
});

export const deviceAccessRequests = sqliteTable("device_access_requests", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status", { enum: ["pending", "approved", "denied"] }).notNull().default("pending"),
  requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  decidedBy: text("decided_by"),
});
