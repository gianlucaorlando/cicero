import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const userProfiles = sqliteTable('user_profiles', {
  userId: text('user_id').primaryKey(),
  slowPace: integer('slow_pace', { mode: 'boolean' }).notNull().default(false),
  avoidQueues: integer('avoid_queues', { mode: 'boolean' }).notNull().default(false),
  noFish: integer('no_fish', { mode: 'boolean' }).notNull().default(false),
  markets: integer('markets', { mode: 'boolean' }).notNull().default(false),
  learnedCafe: text('learned_cafe').notNull().default('[]'),
  learnedEvening: text('learned_evening').notNull().default('[]'),
  learnedMuseum: text('learned_museum').notNull().default('[]'),
  learnedRestaurant: text('learned_restaurant').notNull().default('[]'),
  learnedShopping: text('learned_shopping').notNull().default('[]'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const placeReviewCache = sqliteTable('place_review_cache', {
  placeId: text('place_id').primaryKey(),
  provider: text('provider').notNull(),
  payload: text('payload').notNull(),
  expiresAt: integer('expires_at').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const savedItineraries = sqliteTable('saved_itineraries', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  locationLabel: text('location_label').notNull(),
  originLat: real('origin_lat').notNull(),
  originLng: real('origin_lng').notNull(),
  stops: text('stops').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_saved_itineraries_user_updated_at').on(table.userId, table.updatedAt),
]);
