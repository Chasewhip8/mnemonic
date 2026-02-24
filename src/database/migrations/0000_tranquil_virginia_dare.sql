CREATE TABLE `learnings` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`learning` text NOT NULL,
	`reason` text,
	`confidence` real DEFAULT 1,
	`source` text,
	`scope` text NOT NULL,
	`embedding` F32_BLOB(384),
	`created_at` text NOT NULL,
	`last_recalled_at` text,
	`recall_count` integer DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_learnings_trigger` ON `learnings` (`trigger`);--> statement-breakpoint
CREATE INDEX `idx_learnings_confidence` ON `learnings` (`confidence`);--> statement-breakpoint
CREATE INDEX `idx_learnings_created_at` ON `learnings` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_learnings_scope` ON `learnings` (`scope`);--> statement-breakpoint
CREATE INDEX `idx_learnings_last_recalled_at` ON `learnings` (`last_recalled_at`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`name` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`scope` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_secrets_scope` ON `secrets` (`scope`);