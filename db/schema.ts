import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cases = sqliteTable("cases", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  documentType: text("document_type"),
  sourceFile: text("source_file"),
  sourceLocator: text("source_locator"),
  spaceType: text("space_type"),
  reviewSegment: text("review_segment"),
  primaryObject: text("primary_object"),
  primaryObjectGroup: text("primary_object_group"),
  primaryIssueCategory: text("primary_issue_category"),
  issueDetail: text("issue_detail"),
  proposedAction: text("proposed_action"),
  finalDecision: text("final_decision"),
  overallConfidence: text("overall_confidence"),
  humanReviewStatus: text("human_review_status"),
  contextSummary: text("context_summary"),
  searchText: text("search_text"),
  datasetVersion: text("dataset_version").notNull(),
});

export const datasetVersions = sqliteTable("dataset_versions", {
  id: text("id").primaryKey(),
  sourceFile: text("source_file").notNull(),
  caseCount: integer("case_count").notNull(),
  relationCount: integer("relation_count").notNull(),
  actionCount: integer("action_count").notNull(),
  legalMappingCount: integer("legal_mapping_count").notNull(),
  guidelineMappingCount: integer("guideline_mapping_count").notNull(),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const expertReviews = sqliteTable("expert_reviews", {
  caseId: text("case_id").primaryKey(),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
  actor: text("actor").notNull().default("교통전문가"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const designerResponses = sqliteTable("designer_responses", {
  caseId: text("case_id").primaryKey(),
  response: text("response").notNull(),
  reason: text("reason").notNull().default(""),
  attachments: text("attachments").notNull().default("[]"),
  status: text("status").notNull().default("재제출"),
  actor: text("actor").notNull().default("한빛건축 설계팀"),
  submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reflectionChecks = sqliteTable("reflection_checks", {
  caseId: text("case_id").primaryKey(),
  status: text("status").notNull().default("확인대기"),
  note: text("note").notNull().default(""),
  actor: text("actor").notNull().default("LH 담당자"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const timelineEvents = sqliteTable("timeline_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseId: text("case_id").notNull(),
  actor: text("actor").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  state: text("state").notNull().default("done"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workflowCases = sqliteTable("workflow_cases", {
  caseId: text("case_id").primaryKey(),
  status: text("status").notNull().default("EXPERT_REVIEW_REQUESTED"),
  reviewPackage: text("review_package").notNull().default("{}"),
  designerConfirmed: integer("designer_confirmed").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
