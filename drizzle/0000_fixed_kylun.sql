CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`document_type` text,
	`source_file` text,
	`source_locator` text,
	`space_type` text,
	`review_segment` text,
	`primary_object` text,
	`primary_object_group` text,
	`primary_issue_category` text,
	`issue_detail` text,
	`proposed_action` text,
	`final_decision` text,
	`overall_confidence` text,
	`human_review_status` text,
	`context_summary` text,
	`search_text` text,
	`dataset_version` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dataset_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_file` text NOT NULL,
	`case_count` integer NOT NULL,
	`relation_count` integer NOT NULL,
	`action_count` integer NOT NULL,
	`legal_mapping_count` integer NOT NULL,
	`guideline_mapping_count` integer NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `designer_responses` (
	`case_id` text PRIMARY KEY NOT NULL,
	`response` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT '재제출' NOT NULL,
	`actor` text DEFAULT '한빛건축 설계팀' NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expert_reviews` (
	`case_id` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text DEFAULT '교통전문가' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reflection_checks` (
	`case_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT '확인대기' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT 'LH 담당자' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timeline_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`case_id` text NOT NULL,
	`actor` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'done' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
