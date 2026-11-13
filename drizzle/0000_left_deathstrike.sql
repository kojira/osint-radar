CREATE TABLE `signal_background_config` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signal_collection_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signal_collection_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`added` integer DEFAULT 0 NOT NULL,
	`details` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signal_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`data` text NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signal_observations_seen` ON `signal_observations` (`last_seen`);--> statement-breakpoint
CREATE INDEX `signal_observations_topic` ON `signal_observations` (`topic_id`);