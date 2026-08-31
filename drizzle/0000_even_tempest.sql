CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`slow_pace` integer DEFAULT false NOT NULL,
	`avoid_queues` integer DEFAULT false NOT NULL,
	`no_fish` integer DEFAULT false NOT NULL,
	`markets` integer DEFAULT false NOT NULL,
	`learned_cafe` text DEFAULT '[]' NOT NULL,
	`learned_evening` text DEFAULT '[]' NOT NULL,
	`learned_museum` text DEFAULT '[]' NOT NULL,
	`learned_restaurant` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
