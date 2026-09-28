import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  sheetUrl: text("sheet_url").notNull().default(""),
  subscribersSheetUrl: text("subscribers_sheet_url").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  defaultSendTime: text("default_send_time").notNull().default("09:00"),
  sendDays: text("send_days").notNull().default("1,2,3,4,5"),
  fromName: text("from_name").notNull().default("뉴스레터"),
  testEmail: text("test_email").notNull().default(""),
  baseUrl: text("base_url").notNull().default(""),
  lastQueueSentDate: text("last_queue_sent_date"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }),
});

export const contents = pgTable("contents", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  rowNumber: integer("row_number").notNull().default(0),
  subject: text("subject").notNull(),
  body: text("body").notNull().default(""),
  link: text("link").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  recipients: text("recipients").notNull().default(""),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  rawSchedule: text("raw_schedule").notNull().default(""),
  active: boolean("active").notNull().default(true),
  inSheet: boolean("in_sheet").notNull().default(true),
  // pending | sending | sent | failed
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentCount: integer("sent_count").notNull().default(0),
  failCount: integer("fail_count").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  active: boolean("active").notNull().default(true),
  source: text("source").notNull().default("manual"),
  token: text("token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sendLogs = pgTable("send_logs", {
  id: serial("id").primaryKey(),
  contentId: integer("content_id"),
  subject: text("subject").notNull().default(""),
  email: text("email").notNull(),
  status: text("status").notNull(), // sent | failed | test
  provider: text("provider").notNull().default(""),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settings.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
