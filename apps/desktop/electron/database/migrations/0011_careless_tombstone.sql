PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_measures` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_beat` integer NOT NULL,
	`rehearsal_mark` text,
	`notes` text,
	`is_ghost` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`start_beat`) REFERENCES `beats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "measures_is_ghost_check" CHECK(is_ghost IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_measures`("id", "start_beat", "rehearsal_mark", "notes", "created_at", "updated_at") SELECT "id", "start_beat", "rehearsal_mark", "notes", "created_at", "updated_at" FROM `measures`;--> statement-breakpoint
DROP TABLE `measures`;--> statement-breakpoint
ALTER TABLE `__new_measures` RENAME TO `measures`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
