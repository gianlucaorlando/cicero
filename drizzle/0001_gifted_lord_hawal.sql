CREATE TABLE `place_review_cache` (
	`place_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
