import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
