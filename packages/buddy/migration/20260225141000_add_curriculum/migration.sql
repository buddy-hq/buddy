CREATE TABLE `curriculum` (
  `project_id` text PRIMARY KEY,
  `markdown` text NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL
);
