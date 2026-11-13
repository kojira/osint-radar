CREATE TABLE `signal_brief_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signal_brief_items` (
	`item_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`batch_id` text NOT NULL,
	`generated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signal_brief_items_generated` ON `signal_brief_items` (`generated_at`);--> statement-breakpoint
CREATE TABLE `signal_topic_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `signal_collection_runs` ADD `trigger` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `signal_collection_runs` ADD `automation_id` text;