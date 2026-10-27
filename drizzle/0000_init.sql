CREATE TABLE `briefs` (
	`company_id` integer PRIMARY KEY NOT NULL,
	`markdown` text NOT NULL,
	`content` text NOT NULL,
	`draft_message` text NOT NULL,
	`generated_at` text NOT NULL,
	`model` text NOT NULL,
	`reviewed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`domain` text NOT NULL,
	`segment` text NOT NULL,
	`employee_band` text DEFAULT 'unknown' NOT NULL,
	`size_source_url` text,
	`ats` text NOT NULL,
	`board_token` text NOT NULL,
	`status` text DEFAULT 'no_roles' NOT NULL,
	`lead_score` real,
	`tier` text,
	`score_breakdown` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_slug_unique` ON `companies` (`slug`);--> statement-breakpoint
CREATE TABLE `duties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`posting_id` text NOT NULL,
	`idx` integer NOT NULL,
	`text` text NOT NULL,
	`source_span` text NOT NULL,
	`span_start` integer,
	`span_end` integer,
	`label` text NOT NULL,
	`task_id` text,
	`not_covered_kind` text,
	`confidence` real NOT NULL,
	`rationale` text NOT NULL,
	`gap_theme_id` integer,
	FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `duties_posting` ON `duties` (`posting_id`);--> statement-breakpoint
CREATE TABLE `gap_themes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'Unreviewed' NOT NULL,
	`posting_count` integer DEFAULT 0 NOT NULL,
	`company_count` integer DEFAULT 0 NOT NULL,
	`hot_warm_share` real DEFAULT 0 NOT NULL,
	`hot_warm_companies` integer DEFAULT 0 NOT NULL,
	`example_quote` text,
	`example_duty_id` integer
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `postings` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` integer NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`url` text NOT NULL,
	`ats` text NOT NULL,
	`source_url` text NOT NULL,
	`raw_text` text NOT NULL,
	`text_hash` text NOT NULL,
	`posted_at` text,
	`fetched_at` text NOT NULL,
	`locations` text NOT NULL,
	`salaries` text NOT NULL,
	`salary_min` real,
	`salary_max` real,
	`currency` text,
	`salary_source` text,
	`title_list` text NOT NULL,
	`title_check` text,
	`extracted_at` text,
	`extraction` text,
	`agent_type` text,
	`is_first_eval_hire` integer,
	`overlap` real,
	`live_agent_strength` integer,
	`passed_gates` integer DEFAULT false NOT NULL,
	`fail_reason` text,
	`fail_detail` text,
	`duplicate_of` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `postings_company` ON `postings` (`company_id`);--> statement-breakpoint
CREATE TABLE `triggers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer,
	`kind` text NOT NULL,
	`points` integer NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`source` text NOT NULL,
	`posting_id` text,
	`fetched_at` text NOT NULL
);
