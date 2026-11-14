-- Schema-only snapshot of the anthropology backend, 2026-11-14.
-- Restore ONLY into a fresh Supabase project. No users or research data included.
-- This snapshot represents the current schema: do not replay historical migrations afterward.
BEGIN;
SET LOCAL check_function_bodies = false;
SET LOCAL search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TYPE public."app_role" AS ENUM ('user', 'admin');
CREATE TYPE public."delimitation_item_kind" AS ENUM ('include', 'exclude');
CREATE TYPE public."project_role" AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "full_name" text,
  "role" text DEFAULT 'user'::app_role NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "username" text NOT NULL,
  "email" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_activity_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "event_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

CREATE TABLE public."project_analysis_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "event_type" text NOT NULL,
  "event_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

CREATE TABLE public."project_codes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "parent_code_id" uuid,
  "name" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "definition" text DEFAULT ''::text NOT NULL,
  "inclusion_criteria" text DEFAULT ''::text NOT NULL,
  "exclusion_criteria" text DEFAULT ''::text NOT NULL,
  "color" text DEFAULT '#0f766e'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_delimitation" (
  "project_id" uuid NOT NULL,
  "topic" text DEFAULT ''::text NOT NULL,
  "context_place" text DEFAULT ''::text NOT NULL,
  "population" text DEFAULT ''::text NOT NULL,
  "time_period" text DEFAULT ''::text NOT NULL,
  "resources" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_delimitation_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "kind" delimitation_item_kind NOT NULL,
  "text" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "position" bigint
);

CREATE TABLE public."project_delimitation_version_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "text" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."project_delimitation_versions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "label" text,
  "snapshot_topic" text,
  "snapshot_context_place" text,
  "snapshot_population" text,
  "snapshot_time_period" text,
  "snapshot_resources" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "trigger_type" text DEFAULT 'manual'::text NOT NULL,
  "content_hash" text
);

CREATE TABLE public."project_document_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "document_id" uuid,
  "segment_id" uuid,
  "event_type" text NOT NULL,
  "event_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."project_document_segments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "start_char" integer NOT NULL,
  "end_char" integer NOT NULL,
  "selected_text" text NOT NULL,
  "label" text DEFAULT ''::text NOT NULL,
  "note" text DEFAULT ''::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_document_sources" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_document_versions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "label" text,
  "snapshot_title" text NOT NULL,
  "snapshot_content" text DEFAULT ''::text NOT NULL,
  "snapshot_document_type" text DEFAULT 'interview'::text NOT NULL,
  "snapshot_source_id" uuid,
  "snapshot_participant_id" uuid,
  "snapshot_interview_date" date,
  "snapshot_field_date" date,
  "snapshot_location" text DEFAULT ''::text NOT NULL,
  "snapshot_language" text DEFAULT 'es'::text NOT NULL,
  "snapshot_notes" text DEFAULT ''::text NOT NULL,
  "snapshot_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "snapshot_status" text DEFAULT 'draft'::text NOT NULL,
  "snapshot_character_count" integer DEFAULT 0 NOT NULL,
  "snapshot_word_count" integer DEFAULT 0 NOT NULL,
  "snapshot_revision" bigint DEFAULT 0 NOT NULL,
  "trigger_type" text DEFAULT 'manual'::text NOT NULL,
  "content_hash" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."project_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "title" text NOT NULL,
  "content" text DEFAULT ''::text NOT NULL,
  "document_type" text DEFAULT 'interview'::text NOT NULL,
  "source_id" uuid,
  "participant_id" uuid,
  "interview_date" date,
  "field_date" date,
  "location" text DEFAULT ''::text NOT NULL,
  "language" text DEFAULT 'es'::text NOT NULL,
  "notes" text DEFAULT ''::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "character_count" integer DEFAULT 0 NOT NULL,
  "word_count" integer DEFAULT 0 NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_insight_links" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "insight_id" uuid NOT NULL,
  "link_type" text NOT NULL,
  "document_id" uuid,
  "segment_id" uuid,
  "code_id" uuid,
  "memo_id" uuid,
  "participant_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

CREATE TABLE public."project_insights" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "title" text NOT NULL,
  "summary" text DEFAULT ''::text NOT NULL,
  "interpretation" text DEFAULT ''::text NOT NULL,
  "insight_type" text DEFAULT 'pattern'::text NOT NULL,
  "confidence" text DEFAULT 'medium'::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_invitations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" project_role NOT NULL,
  "token" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "accepted_by" uuid,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

CREATE TABLE public."project_members" (
  "project_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" project_role DEFAULT 'viewer'::project_role NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."project_memo_links" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "memo_id" uuid NOT NULL,
  "link_type" text NOT NULL,
  "document_id" uuid,
  "segment_id" uuid,
  "code_id" uuid,
  "participant_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

CREATE TABLE public."project_memos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT ''::text NOT NULL,
  "memo_type" text DEFAULT 'analytic'::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_participants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "alias" text NOT NULL,
  "display_name" text,
  "notes" text DEFAULT ''::text NOT NULL,
  "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid,
  "revision" bigint DEFAULT 0 NOT NULL
);

CREATE TABLE public."project_presence" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "presence_state" text DEFAULT 'viewing'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."project_research_design" (
  "project_id" uuid NOT NULL,
  "research_question" text DEFAULT ''::text NOT NULL,
  "general_objective" text DEFAULT ''::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_research_design_version_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL,
  "text" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "workflow_order" bigint
);

CREATE TABLE public."project_research_design_versions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "label" text,
  "snapshot_research_question" text DEFAULT ''::text NOT NULL,
  "snapshot_general_objective" text DEFAULT ''::text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "trigger_type" text DEFAULT 'manual'::text NOT NULL,
  "content_hash" text
);

CREATE TABLE public."project_sample_collection_techniques" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "technique_code" text,
  "custom_label" text,
  "is_custom" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "workflow_order" bigint
);

CREATE TABLE public."project_sample_config" (
  "project_id" uuid NOT NULL,
  "main_approach_code" text,
  "scope_code" text,
  "field_phase" text DEFAULT ''::text NOT NULL,
  "target_sample_size" integer,
  "sample_size_rationale" text DEFAULT ''::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_sample_config_version_techniques" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL,
  "technique_code" text,
  "custom_label" text,
  "is_custom" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "workflow_order" bigint
);

CREATE TABLE public."project_sample_config_versions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "label" text,
  "snapshot_main_approach_code" text,
  "snapshot_scope_code" text,
  "snapshot_field_phase" text DEFAULT ''::text NOT NULL,
  "snapshot_target_sample_size" integer,
  "snapshot_sample_size_rationale" text DEFAULT ''::text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "trigger_type" text DEFAULT 'manual'::text NOT NULL,
  "content_hash" text
);

CREATE TABLE public."project_segment_codes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "segment_id" uuid NOT NULL,
  "code_id" uuid NOT NULL,
  "analytic_note" text DEFAULT ''::text NOT NULL,
  "is_quote" boolean DEFAULT false NOT NULL,
  "quote_label" text DEFAULT ''::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."project_specific_objectives" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "text" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "workflow_order" bigint
);

CREATE TABLE public."projects" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "owner_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE public."sample_collection_technique_options" (
  "code" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."sample_main_approach_options" (
  "code" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."sample_scope_options" (
  "code" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'employee'::text])));
ALTER TABLE public."project_analysis_events" ADD CONSTRAINT "project_analysis_events_entity_type_check" CHECK ((entity_type = ANY (ARRAY['code'::text, 'segment_code'::text, 'memo'::text, 'memo_link'::text, 'insight'::text, 'insight_link'::text])));
ALTER TABLE public."project_analysis_events" ADD CONSTRAINT "project_analysis_events_event_payload_check" CHECK ((jsonb_typeof(event_payload) = 'object'::text));
ALTER TABLE public."project_analysis_events" ADD CONSTRAINT "project_analysis_events_event_type_check" CHECK ((btrim(event_type) <> ''::text));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_color_check" CHECK ((char_length(color) <= 30));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_definition_check" CHECK ((char_length(definition) <= 20000));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_description_check" CHECK ((char_length(description) <= 10000));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_exclusion_criteria_check" CHECK ((char_length(exclusion_criteria) <= 20000));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_inclusion_criteria_check" CHECK ((char_length(inclusion_criteria) <= 20000));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_name_check" CHECK ((btrim(name) <> ''::text));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_no_self_parent" CHECK (((parent_code_id IS NULL) OR (parent_code_id <> id)));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_position_check" CHECK (("position" >= 0));
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_revision_check" CHECK ((revision >= 0));
ALTER TABLE public."project_delimitation_items" ADD CONSTRAINT "delimitation_item_position_nonnegative" CHECK (("position" >= 0));
ALTER TABLE public."project_delimitation_version_items" ADD CONSTRAINT "project_delimitation_version_items_kind_check" CHECK ((kind = ANY (ARRAY['include'::text, 'exclude'::text])));
ALTER TABLE public."project_delimitation_versions" ADD CONSTRAINT "project_delimitation_versions_trigger_type_check" CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'auto_checkpoint'::text, 'restore_backup'::text])));
ALTER TABLE public."project_document_events" ADD CONSTRAINT "project_document_events_event_type_check" CHECK ((event_type = ANY (ARRAY['document_created'::text, 'document_updated'::text, 'document_soft_deleted'::text, 'document_restored'::text, 'document_duplicated'::text, 'document_version_created'::text, 'document_version_restored'::text, 'segment_created'::text, 'segment_updated'::text, 'segment_deleted'::text, 'source_created'::text, 'source_updated'::text, 'participant_created'::text, 'participant_updated'::text])));
ALTER TABLE public."project_document_events" ADD CONSTRAINT "project_document_events_payload_object" CHECK ((jsonb_typeof(event_payload) = 'object'::text));
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_check" CHECK ((end_char > start_char));
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_label_length" CHECK ((char_length(label) <= 180));
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_note_length" CHECK ((char_length(note) <= 20000));
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_revision_check" CHECK ((revision >= 0));
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_selected_text_length" CHECK ((char_length(selected_text) <= 50000));
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_selected_text_not_blank" CHECK ((btrim(selected_text) <> ''::text));
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_start_char_check" CHECK ((start_char >= 0));
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_code_length" CHECK ((char_length(code) <= 80));
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_code_not_blank" CHECK ((btrim(code) <> ''::text));
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_description_length" CHECK ((char_length(description) <= 5000));
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_label_length" CHECK ((char_length(label) <= 160));
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_label_not_blank" CHECK ((btrim(label) <> ''::text));
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_position_check" CHECK (("position" >= 0));
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_content_length" CHECK ((char_length(snapshot_content) <= 1000000));
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_metadata_object" CHECK ((jsonb_typeof(snapshot_metadata) = 'object'::text));
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_title_length" CHECK ((char_length(snapshot_title) <= 250));
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_title_not_blank" CHECK ((btrim(snapshot_title) <> ''::text));
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_trigger_type_check" CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'auto_checkpoint'::text, 'before_restore'::text, 'restore_backup'::text])));
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_version_number_check" CHECK ((version_number > 0));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_character_count_check" CHECK ((character_count >= 0));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_content_length" CHECK ((char_length(content) <= 1000000));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_document_type_check" CHECK ((document_type = ANY (ARRAY['interview'::text, 'focus_group'::text, 'field_note'::text, 'observation'::text, 'diary'::text, 'archival_document'::text, 'open_text'::text, 'other'::text])));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_language_length" CHECK (((char_length(language) >= 2) AND (char_length(language) <= 20)));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_location_length" CHECK ((char_length(location) <= 250));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_metadata_object" CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_notes_length" CHECK ((char_length(notes) <= 20000));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_revision_check" CHECK ((revision >= 0));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'transcribed'::text, 'cleaned'::text, 'reviewed'::text, 'ready_for_coding'::text, 'archived'::text])));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_title_length" CHECK ((char_length(title) <= 250));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_title_not_blank" CHECK ((btrim(title) <> ''::text));
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_word_count_check" CHECK ((word_count >= 0));
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_exact_target_check" CHECK ((((link_type = 'document'::text) AND (document_id IS NOT NULL) AND (segment_id IS NULL) AND (code_id IS NULL) AND (memo_id IS NULL) AND (participant_id IS NULL)) OR ((link_type = 'segment'::text) AND (document_id IS NULL) AND (segment_id IS NOT NULL) AND (code_id IS NULL) AND (memo_id IS NULL) AND (participant_id IS NULL)) OR ((link_type = 'code'::text) AND (document_id IS NULL) AND (segment_id IS NULL) AND (code_id IS NOT NULL) AND (memo_id IS NULL) AND (participant_id IS NULL)) OR ((link_type = 'memo'::text) AND (document_id IS NULL) AND (segment_id IS NULL) AND (code_id IS NULL) AND (memo_id IS NOT NULL) AND (participant_id IS NULL)) OR ((link_type = 'participant'::text) AND (document_id IS NULL) AND (segment_id IS NULL) AND (code_id IS NULL) AND (memo_id IS NULL) AND (participant_id IS NOT NULL))));
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_link_type_check" CHECK ((link_type = ANY (ARRAY['document'::text, 'segment'::text, 'code'::text, 'memo'::text, 'participant'::text])));
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_confidence_check" CHECK ((confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_insight_type_check" CHECK ((insight_type = ANY (ARRAY['pattern'::text, 'contrast'::text, 'tension'::text, 'exception'::text, 'question'::text, 'recommendation'::text, 'other'::text])));
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_interpretation_check" CHECK ((char_length(interpretation) <= 200000));
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_revision_check" CHECK ((revision >= 0));
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'confirmed'::text, 'archived'::text])));
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_summary_check" CHECK ((char_length(summary) <= 50000));
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_title_check" CHECK ((btrim(title) <> ''::text));
ALTER TABLE public."project_invitations" ADD CONSTRAINT "project_invitations_shareable_role" CHECK ((role = ANY (ARRAY['editor'::project_role, 'viewer'::project_role])));
ALTER TABLE public."project_invitations" ADD CONSTRAINT "project_invitations_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])));
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_exact_target_check" CHECK ((((link_type = 'document'::text) AND (document_id IS NOT NULL) AND (segment_id IS NULL) AND (code_id IS NULL) AND (participant_id IS NULL)) OR ((link_type = 'segment'::text) AND (document_id IS NULL) AND (segment_id IS NOT NULL) AND (code_id IS NULL) AND (participant_id IS NULL)) OR ((link_type = 'code'::text) AND (document_id IS NULL) AND (segment_id IS NULL) AND (code_id IS NOT NULL) AND (participant_id IS NULL)) OR ((link_type = 'participant'::text) AND (document_id IS NULL) AND (segment_id IS NULL) AND (code_id IS NULL) AND (participant_id IS NOT NULL))));
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_link_type_check" CHECK ((link_type = ANY (ARRAY['document'::text, 'segment'::text, 'code'::text, 'participant'::text])));
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_body_check" CHECK ((char_length(body) <= 200000));
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_memo_type_check" CHECK ((memo_type = ANY (ARRAY['analytic'::text, 'methodological'::text, 'reflexive'::text, 'field'::text, 'theoretical'::text])));
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_revision_check" CHECK ((revision >= 0));
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'confirmed'::text, 'archived'::text])));
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_title_check" CHECK ((btrim(title) <> ''::text));
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_alias_length" CHECK ((char_length(alias) <= 120));
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_alias_not_blank" CHECK ((btrim(alias) <> ''::text));
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_attributes_object" CHECK ((jsonb_typeof(attributes) = 'object'::text));
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_display_name_length" CHECK (((display_name IS NULL) OR (char_length(display_name) <= 180)));
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_notes_length" CHECK ((char_length(notes) <= 10000));
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_revision_safe_integer" CHECK (((revision >= 0) AND (revision <= '9007199254740991'::bigint)));
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'withdrawn'::text, 'archived'::text])));
ALTER TABLE public."project_presence" ADD CONSTRAINT "project_presence_presence_state_check" CHECK ((presence_state = ANY (ARRAY['viewing'::text, 'editing'::text, 'idle'::text])));
ALTER TABLE public."project_presence" ADD CONSTRAINT "project_presence_resource_type_check" CHECK ((resource_type = ANY (ARRAY['project'::text, 'document'::text])));
ALTER TABLE public."project_research_design" ADD CONSTRAINT "project_research_design_general_objective_len_check" CHECK ((char_length(general_objective) <= 5000));
ALTER TABLE public."project_research_design" ADD CONSTRAINT "project_research_design_question_len_check" CHECK ((char_length(research_question) <= 5000));
ALTER TABLE public."project_research_design_version_items" ADD CONSTRAINT "project_research_design_version_items_position_check" CHECK (("position" >= 0));
ALTER TABLE public."project_research_design_version_items" ADD CONSTRAINT "project_research_design_version_items_text_nonempty_check" CHECK ((btrim(text) <> ''::text));
ALTER TABLE public."project_research_design_version_items" ADD CONSTRAINT "project_research_design_version_items_workflow_order_check" CHECK ((workflow_order >= 0));
ALTER TABLE public."project_research_design_versions" ADD CONSTRAINT "project_research_design_versions_trigger_type_check" CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'auto_checkpoint'::text, 'restore_backup'::text])));
ALTER TABLE public."project_sample_collection_techniques" ADD CONSTRAINT "project_sample_collection_techniques_position_check" CHECK (("position" >= 0));
ALTER TABLE public."project_sample_collection_techniques" ADD CONSTRAINT "project_sample_collection_techniques_workflow_order_check" CHECK ((workflow_order >= 0));
ALTER TABLE public."project_sample_collection_techniques" ADD CONSTRAINT "sample_techniques_custom_vs_standard_chk" CHECK ((((is_custom = false) AND (technique_code IS NOT NULL) AND ((custom_label IS NULL) OR (btrim(custom_label) = ''::text))) OR ((is_custom = true) AND (technique_code IS NULL) AND (custom_label IS NOT NULL) AND (btrim(custom_label) <> ''::text))));
ALTER TABLE public."project_sample_config" ADD CONSTRAINT "project_sample_config_field_phase_check" CHECK ((char_length(field_phase) <= 5000));
ALTER TABLE public."project_sample_config" ADD CONSTRAINT "project_sample_config_sample_size_rationale_check" CHECK ((char_length(sample_size_rationale) <= 5000));
ALTER TABLE public."project_sample_config" ADD CONSTRAINT "project_sample_config_target_sample_size_check" CHECK (((target_sample_size IS NULL) OR (target_sample_size > 0)));
ALTER TABLE public."project_sample_config_version_techniques" ADD CONSTRAINT "project_sample_config_version_techniques_position_check" CHECK (("position" >= 0));
ALTER TABLE public."project_sample_config_version_techniques" ADD CONSTRAINT "project_sample_config_version_techniques_workflow_order_check" CHECK ((workflow_order >= 0));
ALTER TABLE public."project_sample_config_version_techniques" ADD CONSTRAINT "sample_version_techniques_custom_vs_standard_chk" CHECK ((((is_custom = false) AND (technique_code IS NOT NULL) AND ((custom_label IS NULL) OR (btrim(custom_label) = ''::text))) OR ((is_custom = true) AND (technique_code IS NULL) AND (custom_label IS NOT NULL) AND (btrim(custom_label) <> ''::text))));
ALTER TABLE public."project_sample_config_versions" ADD CONSTRAINT "project_sample_config_versions_trigger_type_check" CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'auto_checkpoint'::text, 'restore_backup'::text])));
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_analytic_note_check" CHECK ((char_length(analytic_note) <= 20000));
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_quote_label_check" CHECK ((char_length(quote_label) <= 180));
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_revision_check" CHECK ((revision >= 0));
ALTER TABLE public."project_specific_objectives" ADD CONSTRAINT "project_specific_objectives_position_check" CHECK (("position" >= 0));
ALTER TABLE public."project_specific_objectives" ADD CONSTRAINT "project_specific_objectives_text_len_check" CHECK ((char_length(text) <= 3000));
ALTER TABLE public."project_specific_objectives" ADD CONSTRAINT "project_specific_objectives_text_nonempty_check" CHECK ((btrim(text) <> ''::text));
ALTER TABLE public."project_specific_objectives" ADD CONSTRAINT "project_specific_objectives_workflow_order_check" CHECK ((workflow_order >= 0));
ALTER TABLE public."sample_collection_technique_options" ADD CONSTRAINT "sample_collection_technique_options_position_check" CHECK (("position" >= 0));
ALTER TABLE public."sample_main_approach_options" ADD CONSTRAINT "sample_main_approach_options_position_check" CHECK (("position" >= 0));
ALTER TABLE public."sample_scope_options" ADD CONSTRAINT "sample_scope_options_position_check" CHECK (("position" >= 0));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_activity_events" ADD CONSTRAINT "project_activity_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_analysis_events" ADD CONSTRAINT "project_analysis_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_delimitation" ADD CONSTRAINT "project_delimitation_pkey" PRIMARY KEY (project_id);
ALTER TABLE public."project_delimitation_items" ADD CONSTRAINT "project_delimitation_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_delimitation_version_items" ADD CONSTRAINT "project_delimitation_version_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_delimitation_versions" ADD CONSTRAINT "project_delimitation_versions_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_document_events" ADD CONSTRAINT "project_document_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_invitations" ADD CONSTRAINT "project_invitations_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_members" ADD CONSTRAINT "project_members_pkey" PRIMARY KEY (project_id, user_id);
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_presence" ADD CONSTRAINT "project_presence_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_research_design" ADD CONSTRAINT "project_research_design_pkey" PRIMARY KEY (project_id);
ALTER TABLE public."project_research_design_version_items" ADD CONSTRAINT "project_research_design_version_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_research_design_versions" ADD CONSTRAINT "project_research_design_versions_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_sample_collection_techniques" ADD CONSTRAINT "project_sample_collection_techniques_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_sample_config" ADD CONSTRAINT "project_sample_config_pkey" PRIMARY KEY (project_id);
ALTER TABLE public."project_sample_config_version_techniques" ADD CONSTRAINT "project_sample_config_version_techniques_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_sample_config_versions" ADD CONSTRAINT "project_sample_config_versions_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_specific_objectives" ADD CONSTRAINT "project_specific_objectives_pkey" PRIMARY KEY (id);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_pkey" PRIMARY KEY (id);
ALTER TABLE public."sample_collection_technique_options" ADD CONSTRAINT "sample_collection_technique_options_pkey" PRIMARY KEY (code);
ALTER TABLE public."sample_main_approach_options" ADD CONSTRAINT "sample_main_approach_options_pkey" PRIMARY KEY (code);
ALTER TABLE public."sample_scope_options" ADD CONSTRAINT "sample_scope_options_pkey" PRIMARY KEY (code);
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_id_project_id_key" UNIQUE (id, project_id);
ALTER TABLE public."project_delimitation_versions" ADD CONSTRAINT "project_delimitation_versions_project_id_version_number_key" UNIQUE (project_id, version_number);
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_id_project_id_key" UNIQUE (id, project_id);
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_project_id_id_key" UNIQUE (project_id, id);
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_document_number_uidx" UNIQUE (document_id, version_number);
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_id_project_id_key" UNIQUE (id, project_id);
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_project_id_id_key" UNIQUE (project_id, id);
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_id_project_id_key" UNIQUE (id, project_id);
ALTER TABLE public."project_invitations" ADD CONSTRAINT "project_invitations_token_key" UNIQUE (token);
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_id_project_id_key" UNIQUE (id, project_id);
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_id_project_id_key" UNIQUE (id, project_id);
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_project_id_id_key" UNIQUE (project_id, id);
ALTER TABLE public."project_presence" ADD CONSTRAINT "project_presence_project_id_user_id_resource_type_resource__key" UNIQUE (project_id, user_id, resource_type, resource_id);
ALTER TABLE public."project_research_design_versions" ADD CONSTRAINT "project_research_design_versions_project_version_unique" UNIQUE (project_id, version_number);
ALTER TABLE public."project_sample_config_versions" ADD CONSTRAINT "project_sample_config_versions_project_version_uniq" UNIQUE (project_id, version_number);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_activity_events" ADD CONSTRAINT "project_activity_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."project_activity_events" ADD CONSTRAINT "project_activity_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_analysis_events" ADD CONSTRAINT "project_analysis_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_analysis_events" ADD CONSTRAINT "project_analysis_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_parent_same_project_fkey" FOREIGN KEY (parent_code_id, project_id) REFERENCES project_codes(id, project_id) ON DELETE RESTRICT;
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_codes" ADD CONSTRAINT "project_codes_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_delimitation" ADD CONSTRAINT "project_delimitation_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_delimitation" ADD CONSTRAINT "project_delimitation_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_delimitation" ADD CONSTRAINT "project_delimitation_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_delimitation_items" ADD CONSTRAINT "project_delimitation_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_delimitation_items" ADD CONSTRAINT "project_delimitation_items_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_delimitation_items" ADD CONSTRAINT "project_delimitation_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_delimitation_version_items" ADD CONSTRAINT "project_delimitation_version_items_version_id_fkey" FOREIGN KEY (version_id) REFERENCES project_delimitation_versions(id) ON DELETE CASCADE;
ALTER TABLE public."project_delimitation_versions" ADD CONSTRAINT "project_delimitation_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_delimitation_versions" ADD CONSTRAINT "project_delimitation_versions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_document_events" ADD CONSTRAINT "project_document_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_document_events" ADD CONSTRAINT "project_document_events_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE;
ALTER TABLE public."project_document_events" ADD CONSTRAINT "project_document_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_document_events" ADD CONSTRAINT "project_document_events_segment_id_fkey" FOREIGN KEY (segment_id) REFERENCES project_document_segments(id) ON DELETE SET NULL;
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_document_fkey" FOREIGN KEY (project_id, document_id) REFERENCES project_documents(project_id, id) ON DELETE CASCADE;
ALTER TABLE public."project_document_segments" ADD CONSTRAINT "project_document_segments_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_document_sources" ADD CONSTRAINT "project_document_sources_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_document_versions" ADD CONSTRAINT "project_document_versions_document_fkey" FOREIGN KEY (project_id, document_id) REFERENCES project_documents(project_id, id) ON DELETE CASCADE;
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_participant_id_fkey" FOREIGN KEY (participant_id) REFERENCES project_participants(id) ON DELETE SET NULL;
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_source_id_fkey" FOREIGN KEY (source_id) REFERENCES project_document_sources(id) ON DELETE SET NULL;
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_code_same_project_fkey" FOREIGN KEY (code_id, project_id) REFERENCES project_codes(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_document_same_project_fkey" FOREIGN KEY (document_id, project_id) REFERENCES project_documents(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_insight_same_project_fkey" FOREIGN KEY (insight_id, project_id) REFERENCES project_insights(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_memo_same_project_fkey" FOREIGN KEY (memo_id, project_id) REFERENCES project_memos(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_participant_same_project_fkey" FOREIGN KEY (participant_id, project_id) REFERENCES project_participants(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_insight_links" ADD CONSTRAINT "project_insight_links_segment_same_project_fkey" FOREIGN KEY (segment_id, project_id) REFERENCES project_document_segments(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_insights" ADD CONSTRAINT "project_insights_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_invitations" ADD CONSTRAINT "project_invitations_accepted_by_fkey" FOREIGN KEY (accepted_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."project_invitations" ADD CONSTRAINT "project_invitations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."project_invitations" ADD CONSTRAINT "project_invitations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_code_same_project_fkey" FOREIGN KEY (code_id, project_id) REFERENCES project_codes(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_document_same_project_fkey" FOREIGN KEY (document_id, project_id) REFERENCES project_documents(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_memo_same_project_fkey" FOREIGN KEY (memo_id, project_id) REFERENCES project_memos(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_participant_same_project_fkey" FOREIGN KEY (participant_id, project_id) REFERENCES project_participants(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_memo_links" ADD CONSTRAINT "project_memo_links_segment_same_project_fkey" FOREIGN KEY (segment_id, project_id) REFERENCES project_document_segments(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_memos" ADD CONSTRAINT "project_memos_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_participants" ADD CONSTRAINT "project_participants_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_presence" ADD CONSTRAINT "project_presence_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_presence" ADD CONSTRAINT "project_presence_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."project_research_design" ADD CONSTRAINT "project_research_design_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_research_design" ADD CONSTRAINT "project_research_design_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_research_design" ADD CONSTRAINT "project_research_design_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_research_design_version_items" ADD CONSTRAINT "project_research_design_version_items_version_id_fkey" FOREIGN KEY (version_id) REFERENCES project_research_design_versions(id) ON DELETE CASCADE;
ALTER TABLE public."project_research_design_versions" ADD CONSTRAINT "project_research_design_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_research_design_versions" ADD CONSTRAINT "project_research_design_versions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_sample_collection_techniques" ADD CONSTRAINT "project_sample_collection_techniques_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_sample_collection_techniques" ADD CONSTRAINT "project_sample_collection_techniques_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_sample_collection_techniques" ADD CONSTRAINT "project_sample_collection_techniques_technique_code_fkey" FOREIGN KEY (technique_code) REFERENCES sample_collection_technique_options(code);
ALTER TABLE public."project_sample_collection_techniques" ADD CONSTRAINT "project_sample_collection_techniques_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_sample_config" ADD CONSTRAINT "project_sample_config_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_sample_config" ADD CONSTRAINT "project_sample_config_main_approach_code_fkey" FOREIGN KEY (main_approach_code) REFERENCES sample_main_approach_options(code);
ALTER TABLE public."project_sample_config" ADD CONSTRAINT "project_sample_config_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_sample_config" ADD CONSTRAINT "project_sample_config_scope_code_fkey" FOREIGN KEY (scope_code) REFERENCES sample_scope_options(code);
ALTER TABLE public."project_sample_config" ADD CONSTRAINT "project_sample_config_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_sample_config_version_techniques" ADD CONSTRAINT "project_sample_config_version_techniques_version_id_fkey" FOREIGN KEY (version_id) REFERENCES project_sample_config_versions(id) ON DELETE CASCADE;
ALTER TABLE public."project_sample_config_versions" ADD CONSTRAINT "project_sample_config_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_sample_config_versions" ADD CONSTRAINT "project_sample_config_versions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_code_same_project_fkey" FOREIGN KEY (code_id, project_id) REFERENCES project_codes(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_segment_same_project_fkey" FOREIGN KEY (segment_id, project_id) REFERENCES project_document_segments(id, project_id) ON DELETE CASCADE;
ALTER TABLE public."project_segment_codes" ADD CONSTRAINT "project_segment_codes_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."project_specific_objectives" ADD CONSTRAINT "project_specific_objectives_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_specific_objectives" ADD CONSTRAINT "project_specific_objectives_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_specific_objectives" ADD CONSTRAINT "project_specific_objectives_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.accept_project_invitation_atomic(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invitation public.project_invitations%rowtype;
  member public.project_members%rowtype;
  caller_id uuid := auth.uid();
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into invitation
  from public.project_invitations i
  where i.token = p_token
  for update;

  if not found then
    raise exception 'PROJECT_INVITATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if invitation.status = 'accepted' then
    raise exception 'PROJECT_INVITATION_ALREADY_ACCEPTED' using errcode = 'P0001';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'PROJECT_INVITATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'PROJECT_INVITATION_EXPIRED' using errcode = 'P0001';
  end if;
  if jwt_email = '' or jwt_email <> lower(invitation.email) then
    raise exception 'PROJECT_INVITATION_EMAIL_MISMATCH' using errcode = 'P0001';
  end if;

  begin
    insert into public.project_members (project_id, user_id, role)
    values (invitation.project_id, caller_id, invitation.role)
    returning * into member;
  exception when unique_violation then
    raise exception 'PROJECT_MEMBER_ALREADY_EXISTS' using errcode = 'P0001';
  end;

  update public.project_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = caller_id
  where id = invitation.id and status = 'pending'
  returning * into invitation;

  return jsonb_build_object(
    'invitation', to_jsonb(invitation),
    'member', to_jsonb(member)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_project_owner_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner'::public.project_role)
  on conflict (project_id, user_id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.analysis_has_project_role(pid uuid, allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = pid
      and pm.user_id = (select auth.uid())
      and pm.role::text = any(allowed_roles)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.analysis_is_project_member(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = pid
      and pm.user_id = (select auth.uid())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.approx_word_count(p_text text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  cleaned text;
begin
  cleaned := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));

  if cleaned = '' then
    return 0;
  end if;

  return array_length(regexp_split_to_array(cleaned, ' '), 1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.coordinate_workflow_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE project uuid; row_data jsonb; spec jsonb;
BEGIN
  spec := public.workflow_spec(TG_ARGV[0]);
  -- Never wait while an ordinary UPDATE/DELETE already holds a tuple lock.
  -- A busy writer is rejected atomically; callers map this marker to a safe 409, without retry.
  FOR row_data IN SELECT value FROM jsonb_array_elements(
    CASE TG_OP WHEN 'INSERT' THEN jsonb_build_array(to_jsonb(NEW))
      WHEN 'DELETE' THEN jsonb_build_array(to_jsonb(OLD))
      ELSE jsonb_build_array(to_jsonb(OLD), to_jsonb(NEW)) END)
  LOOP
    IF TG_ARGV[1] = 'version_id' THEN
      EXECUTE format('SELECT project_id FROM public.%I WHERE id=$1', spec->>'versions')
        INTO project USING (row_data->>'version_id')::uuid;
    ELSE project := (row_data->>'project_id')::uuid;
    END IF;
    IF project IS NOT NULL AND NOT pg_try_advisory_xact_lock(public.workflow_lock_key(TG_ARGV[0], project)) THEN
      RAISE EXCEPTION 'WORKFLOW_WRITE_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF TG_TABLE_NAME = 'project_delimitation_items' AND TG_OP = 'INSERT' THEN
    IF NEW.position IS NULL THEN
      SELECT coalesce(max(position), -1) + 1 INTO NEW.position FROM public.project_delimitation_items WHERE project_id = NEW.project_id;
    END IF;
  END IF;
  IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('project_specific_objectives','project_research_design_version_items','project_sample_collection_techniques','project_sample_config_version_techniques') THEN
    IF NEW.workflow_order IS NULL THEN
      -- This allocator runs under the project lock already acquired above. Ordinary
      -- inserts append after legacy/copied rows even when numeric positions tie.
      EXECUTE format('SELECT coalesce(max(workflow_order),-1)+1 FROM public.%I WHERE %I=$1',TG_TABLE_NAME,TG_ARGV[1]) INTO NEW.workflow_order USING (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.create_project_code_safe(p_project_id uuid, p_name_b64 text, p_description_b64 text, p_definition_b64 text, p_inclusion_b64 text, p_exclusion_b64 text, p_parent_code_id uuid, p_color text, p_position integer, p_metadata jsonb)
 RETURNS SETOF project_codes
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  insert into public.project_codes (
    project_id, name, description, definition, inclusion_criteria,
    exclusion_criteria, parent_code_id, color, position, metadata,
    created_by, updated_by
  ) values (
    p_project_id,
    convert_from(decode(p_name_b64, 'base64'), 'utf8'),
    convert_from(decode(p_description_b64, 'base64'), 'utf8'),
    convert_from(decode(p_definition_b64, 'base64'), 'utf8'),
    convert_from(decode(p_inclusion_b64, 'base64'), 'utf8'),
    convert_from(decode(p_exclusion_b64, 'base64'), 'utf8'),
    p_parent_code_id, p_color, p_position, coalesce(p_metadata, '{}'::jsonb),
    auth.uid(), auth.uid()
  )
  returning *;
$function$
;

CREATE OR REPLACE FUNCTION public.create_project_sample_config_snapshot(p_project_id uuid, p_label text DEFAULT NULL::text, p_trigger_type text DEFAULT 'manual'::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_version_id uuid;
  v_next_version integer;
  v_main_approach_code text;
  v_scope_code text;
  v_field_phase text := '';
  v_target_sample_size integer;
  v_sample_size_rationale text := '';
  v_content_hash text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_trigger_type not in ('manual', 'auto_checkpoint', 'restore_backup') then
    raise exception 'Invalid trigger_type';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role::text in ('owner', 'editor')
  ) then
    raise exception 'Not allowed';
  end if;

  select
    c.main_approach_code,
    c.scope_code,
    c.field_phase,
    c.target_sample_size,
    c.sample_size_rationale
  into
    v_main_approach_code,
    v_scope_code,
    v_field_phase,
    v_target_sample_size,
    v_sample_size_rationale
  from public.project_sample_config c
  where c.project_id = p_project_id;

  v_next_version := coalesce(
    (
      select max(v.version_number) + 1
      from public.project_sample_config_versions v
      where v.project_id = p_project_id
    ),
    1
  );

  v_content_hash := md5(
    coalesce(v_main_approach_code, '') || '|' ||
    coalesce(v_scope_code, '') || '|' ||
    coalesce(v_field_phase, '') || '|' ||
    coalesce(v_target_sample_size::text, '') || '|' ||
    coalesce(v_sample_size_rationale, '') || '|' ||
    coalesce(
      (
        select string_agg(
          coalesce(t.technique_code, '') || ':' ||
          coalesce(t.custom_label, '') || ':' ||
          t.is_custom::text || ':' ||
          t.position::text,
          '||'
          order by t.position, t.created_at
        )
        from public.project_sample_collection_techniques t
        where t.project_id = p_project_id
      ),
      ''
    )
  );

  insert into public.project_sample_config_versions (
    project_id,
    version_number,
    label,
    snapshot_main_approach_code,
    snapshot_scope_code,
    snapshot_field_phase,
    snapshot_target_sample_size,
    snapshot_sample_size_rationale,
    created_by,
    trigger_type,
    content_hash
  )
  values (
    p_project_id,
    v_next_version,
    p_label,
    v_main_approach_code,
    v_scope_code,
    coalesce(v_field_phase, ''),
    v_target_sample_size,
    coalesce(v_sample_size_rationale, ''),
    auth.uid(),
    p_trigger_type,
    v_content_hash
  )
  returning id into v_version_id;

  insert into public.project_sample_config_version_techniques (
    version_id,
    technique_code,
    custom_label,
    is_custom,
    position
  )
  select
    v_version_id,
    t.technique_code,
    t.custom_label,
    t.is_custom,
    t.position
  from public.project_sample_collection_techniques t
  where t.project_id = p_project_id
  order by t.position, t.created_at;

  return v_version_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.debug_request_context()
 RETURNS jsonb
 LANGUAGE sql
AS $function$
  select jsonb_build_object(
    'uid', auth.uid(),
    'role', auth.role(),
    'jwt_claims', current_setting('request.jwt.claims', true)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.find_project_code_by_name_safe(p_project_id uuid, p_name_b64 text, p_exclude_code_id uuid)
 RETURNS SETOF project_codes
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select c.*
  from public.project_codes c
  where c.project_id = p_project_id
    and c.name = convert_from(decode(p_name_b64, 'base64'), 'utf8')
    and c.deleted_at is null
    and (p_exclude_code_id is null or c.id <> p_exclude_code_id)
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_project_analysis_overview(input_project_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with document_counts as (
    select count(*)::bigint as documents_count
    from public.project_documents
    where project_id = input_project_id and deleted_at is null
  ),
  segment_counts as (
    select count(*)::bigint as segments_count,
      count(*) filter (where not exists (
        select 1 from public.project_segment_codes sc
        where sc.project_id = input_project_id
          and sc.segment_id = s.id
          and sc.deleted_at is null
      ))::bigint as uncoded_segments_count
    from public.project_document_segments s
    where s.project_id = input_project_id and s.deleted_at is null
  ),
  code_counts as (
    select count(*)::bigint as codes_count
    from public.project_codes
    where project_id = input_project_id and deleted_at is null
  ),
  segment_code_counts as (
    select count(distinct segment_id)::bigint as coded_segments_count,
      count(distinct segment_id) filter (where is_quote = true)::bigint as quotes_count
    from public.project_segment_codes
    where project_id = input_project_id and deleted_at is null
  ),
  memo_counts as (
    select count(*)::bigint as memos_count
    from public.project_memos
    where project_id = input_project_id and deleted_at is null
  ),
  insight_counts as (
    select count(*)::bigint as insights_count
    from public.project_insights
    where project_id = input_project_id and deleted_at is null
  )
  select jsonb_build_object(
    'project_id', input_project_id,
    'documents_count', coalesce(document_counts.documents_count, 0),
    'segments_count', coalesce(segment_counts.segments_count, 0),
    'codes_count', coalesce(code_counts.codes_count, 0),
    'coded_segments_count', coalesce(segment_code_counts.coded_segments_count, 0),
    'quotes_count', coalesce(segment_code_counts.quotes_count, 0),
    'memos_count', coalesce(memo_counts.memos_count, 0),
    'insights_count', coalesce(insight_counts.insights_count, 0),
    'uncoded_segments_count', coalesce(segment_counts.uncoded_segments_count, 0)
  )
  from document_counts, segment_counts, code_counts,
    segment_code_counts, memo_counts, insight_counts;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_code_soft_delete_dependencies()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    if exists (
      select 1 from public.project_codes child
      where child.project_id = old.project_id
        and child.parent_code_id = old.id
        and child.deleted_at is null
    ) then
      raise exception 'CODE_HAS_ACTIVE_CHILDREN' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.project_segment_codes assignment
      where assignment.project_id = old.project_id
        and assignment.code_id = old.id
        and assignment.deleted_at is null
    ) then
      raise exception 'CODE_HAS_ACTIVE_ASSIGNMENTS' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_document_content_with_segments()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.content is distinct from old.content
     and exists (
       select 1
       from public.project_document_segments s
       where s.project_id = old.project_id
         and s.document_id = old.id
         and s.deleted_at is null
     ) then
    raise exception 'DOCUMENT_HAS_ACTIVE_SEGMENTS' using errcode = 'P0001';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  profile_email text;
  profile_username text;
begin
  profile_email := coalesce(new.email, 'user-' || new.id::text || '@local.invalid');
  profile_username := regexp_replace(split_part(profile_email, '@', 1), '[^a-zA-Z0-9_]+', '_', 'g')
    || '_' || left(replace(new.id::text, '-', ''), 8);

  insert into public.profiles (id, full_name, role, username, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), profile_email),
    'employee',
    profile_username,
    profile_email
  )
  on conflict (id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_project_role(pid uuid, roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = pid
      and pm.user_id = (select auth.uid())
      and pm.role::text = any(roles)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_project_member(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = pid
      and pm.user_id = (select auth.uid())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_project_owner(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select public.has_project_role(pid, array['owner']);
$function$
;

CREATE OR REPLACE FUNCTION public.is_project_owner_or_editor(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select public.has_project_role(pid, array['owner', 'editor']);
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.role is distinct from old.role then
    raise exception 'role change is not allowed';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_project_code_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cycle_found boolean;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('project_codes:' || new.project_id::text, 0)
  );

  if new.parent_code_id is null then
    return new;
  end if;

  if new.parent_code_id = new.id then
    raise exception 'CODE_PARENT_CYCLE' using errcode = 'P0001';
  end if;

  with recursive ancestors(id) as (
    select new.parent_code_id
    union all
    select code.parent_code_id
    from public.project_codes code
    join ancestors parent on parent.id = code.id
    where code.project_id = new.project_id
      and code.parent_code_id is not null
  )
  select exists(select 1 from ancestors where id = new.id)
  into cycle_found;

  if cycle_found then
    raise exception 'CODE_PARENT_CYCLE' using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.project_has_member_email_safe(p_project_id uuid, p_email_b64 text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_email text := lower(convert_from(decode(p_email_b64, 'base64'), 'utf8'));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.project_members owner_member
    where owner_member.project_id = p_project_id
      and owner_member.user_id = auth.uid()
      and owner_member.role = 'owner'
  ) then
    raise exception 'PROJECT_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.project_members member
    join public.profiles profile on profile.id = member.user_id
    where member.project_id = p_project_id
      and lower(profile.email) = normalized_email
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.project_member_profiles_safe(p_project_id uuid, p_user_ids uuid[])
 RETURNS TABLE(id uuid, full_name text, email text, username text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.app_profile_role() is null or not exists (
    select 1 from public.project_members caller
    where caller.project_id = p_project_id and caller.user_id = auth.uid()
  ) then
    raise exception 'PROJECT_MEMBER_REQUIRED' using errcode = '42501';
  end if;

  return query
    select profile.id, profile.full_name::text, profile.email::text, profile.username::text
    from public.project_members member
    join public.profiles profile on profile.id = member.user_id
    where member.project_id = p_project_id
      and member.user_id = any(p_user_ids);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.project_role(pid uuid)
 RETURNS project_role
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select pm.role
  from public.project_members pm
  where pm.project_id = pid
    and pm.user_id = (select auth.uid())
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_duplicate_workflow_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  duplicate_found boolean;
begin
  if new.content_hash is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(TG_TABLE_NAME || ':' || new.project_id::text, 0)
  );

  execute format(
    'select exists (select 1 from public.%I where project_id = $1 and content_hash = $2)',
    TG_TABLE_NAME
  )
  into duplicate_found
  using new.project_id, new.content_hash;

  if duplicate_found then
    raise exception 'DUPLICATE_SNAPSHOT' using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_project_member_atomic(p_project_id uuid, p_user_id uuid, p_actor_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role public.project_role;
  v_target_role public.project_role;
  v_deleted integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF p_actor_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT role INTO v_actor_role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = v_actor;
  IF v_actor_role IS NULL OR (v_actor <> p_user_id AND v_actor_role <> 'owner') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_actor = p_user_id AND v_actor_role = 'owner' THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_SELF';
  END IF;

  SELECT role INTO v_target_role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'PROJECT_MEMBER_NOT_FOUND';
  END IF;
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'PROJECT_MEMBER_OWNER_PROTECTED';
  END IF;

  INSERT INTO public.project_activity_events(project_id, event_type, event_payload, created_by)
  VALUES (p_project_id, 'member_removed', jsonb_build_object('user_id', p_user_id), v_actor);

  DELETE FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_user_id AND role <> 'owner';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    -- A concurrent removal/promotion or RLS denial must not leave a false event.
    RAISE EXCEPTION 'PROJECT_MEMBER_NOT_FOUND';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_workflow_version(p_workflow text, p_project_id uuid, p_version_id uuid, p_actor_id uuid, p_expected_revision bigint, p_create_backup boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE spec jsonb := public.workflow_spec(p_workflow); target jsonb; parent jsonb; children jsonb; backup jsonb;
 snapshot jsonb; payload jsonb; field text; columns text; assignments text; child_columns text; expected bigint;
BEGIN
  IF auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid() OR NOT public.has_project_role(p_project_id,ARRAY['owner','editor']) THEN RAISE EXCEPTION 'WORKFLOW_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(public.workflow_lock_key(p_workflow,p_project_id));
  target := public.workflow_version_data(p_workflow,p_project_id,p_version_id);
  IF target IS NULL THEN RAISE EXCEPTION 'WORKFLOW_VERSION_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE project_id=$1 FOR UPDATE',spec->>'parent') INTO parent USING p_project_id;
  expected := coalesce((parent->>'revision')::bigint,0);
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision<>expected THEN RAISE EXCEPTION 'WORKFLOW_REVISION_CONFLICT' USING ERRCODE='P0001', DETAIL=coalesce(parent::text,'null'); END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(c)-''workflow_order'' ORDER BY position NULLS FIRST,(to_jsonb(c)->>''workflow_order'')::bigint NULLS FIRST,created_at,id),''[]'') FROM public.%I c WHERE project_id=$1',spec->>'child') INTO children USING p_project_id;
  IF p_workflow='delimitation' THEN
    -- Version positions describe the exact current read order, including legacy NULL-position rows.
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('position',ord-1) ORDER BY ord),'[]') INTO children FROM jsonb_array_elements(children) WITH ORDINALITY AS t(item,ord);
  END IF;
  snapshot := spec->'defaults';
  FOR field IN SELECT jsonb_array_elements_text(spec->'fields') LOOP snapshot := snapshot || jsonb_build_object(field,coalesce(nullif(parent->field,'null'::jsonb),spec->'defaults'->field)); END LOOP;
  IF p_create_backup AND (p_workflow='delimitation' OR children<>'[]'::jsonb OR public.workflow_identity(p_workflow,snapshot,'[]')<>public.workflow_identity(p_workflow,spec->'defaults','[]')) THEN
    backup := public.save_workflow_snapshot(p_workflow,p_project_id,p_actor_id,snapshot,children,
      CASE WHEN p_workflow='delimitation' THEN 'Auto backup before restoring v' ELSE 'Backup before restoring v' END || (target->'version'->>'version_number'),'restore_backup',NULL);
  END IF;
  SELECT string_agg(quote_ident(f),','),string_agg(format('%I=excluded.%I',f,f),',') INTO columns,assignments FROM jsonb_array_elements_text(spec->'fields') f;
  payload := target->'snapshot' || jsonb_build_object('project_id',p_project_id,'revision',expected+1,'created_by',p_actor_id,'updated_by',p_actor_id);
  -- Sample's existing BEFORE UPDATE audit trigger assigns OLD.revision+1, not NEW.revision+1.
  EXECUTE format('INSERT INTO public.%1$I(project_id,%2$s,revision,created_by,updated_by) SELECT project_id,%2$s,revision,created_by,updated_by FROM jsonb_populate_record(NULL::public.%1$I,$1) ON CONFLICT(project_id) DO UPDATE SET %3$s,revision=excluded.revision,updated_by=excluded.updated_by RETURNING to_jsonb(%1$I)',spec->>'parent',columns,assignments) INTO parent USING payload;
  EXECUTE format('DELETE FROM public.%I WHERE project_id=$1',spec->>'child') USING p_project_id;
  SELECT string_agg(quote_ident(f),',') INTO child_columns FROM jsonb_array_elements_text(spec->'child_fields') f;
  payload := target->'children';
  IF p_workflow<>'delimitation' THEN
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('workflow_order',ord-1) ORDER BY ord),'[]') INTO payload FROM jsonb_array_elements(payload) WITH ORDINALITY AS t(item,ord);
  END IF;
  EXECUTE format('INSERT INTO public.%1$I(project_id,%2$s,created_by,updated_by) SELECT $1,%2$s,$2,$2 FROM jsonb_populate_recordset(NULL::public.%1$I,$3)',spec->>'child',child_columns) USING p_project_id,p_actor_id,payload;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(c)-''workflow_order'' ORDER BY position NULLS FIRST,(to_jsonb(c)->>''workflow_order'')::bigint NULLS FIRST,created_at,id),''[]'') FROM public.%I c WHERE project_id=$1',spec->>'child') INTO children USING p_project_id;
  RETURN jsonb_build_object('target',target,'backup',backup,'parent',parent,'children',children,'backup_created',coalesce((backup->>'created')::boolean,false));
END $function$
;

CREATE OR REPLACE FUNCTION public.save_workflow_snapshot(p_workflow text, p_project_id uuid, p_actor_id uuid, p_snapshot jsonb, p_children jsonb, p_label text DEFAULT NULL::text, p_trigger_type text DEFAULT 'manual'::text, p_content_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE spec jsonb := public.workflow_spec(p_workflow); candidate record; detail jsonb; identity jsonb;
 version jsonb; version_id uuid; next_number int; columns text; values_sql text; child_columns text; payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid() OR NOT public.has_project_role(p_project_id,ARRAY['owner','editor']) THEN RAISE EXCEPTION 'WORKFLOW_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(public.workflow_lock_key(p_workflow,p_project_id));
  -- Persist array ordinality separately; numeric positions and digest identity are unchanged.
  IF p_workflow<>'delimitation' THEN
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('workflow_order',ord-1) ORDER BY ord),'[]') INTO p_children FROM jsonb_array_elements(p_children) WITH ORDINALITY AS t(item,ord);
  END IF;
  identity := public.workflow_identity(p_workflow,p_snapshot,p_children);
  FOR candidate IN EXECUTE format('SELECT id FROM public.%I WHERE project_id=$1 ORDER BY version_number DESC',spec->>'versions') USING p_project_id LOOP
    detail := public.workflow_version_data(p_workflow,p_project_id,candidate.id);
    IF public.workflow_identity(p_workflow,detail->'snapshot',detail->'children') = identity THEN
      RETURN detail || jsonb_build_object('created',false);
    END IF;
  END LOOP;
  EXECUTE format('SELECT coalesce(max(version_number),0)+1 FROM public.%I WHERE project_id=$1',spec->>'versions') INTO next_number USING p_project_id;
  SELECT string_agg(quote_ident('snapshot_'||field),','),string_agg('r.'||quote_ident('snapshot_'||field),',') INTO columns,values_sql FROM jsonb_array_elements_text(spec->'fields') field;
  SELECT jsonb_object_agg('snapshot_'||key,value) INTO payload FROM jsonb_each(p_snapshot);
  payload := payload || jsonb_build_object('project_id',p_project_id,'version_number',next_number,'created_by',p_actor_id,'label',p_label,'trigger_type',p_trigger_type,'content_hash',CASE WHEN p_trigger_type='restore_backup' THEN NULL ELSE p_content_hash END);
  EXECUTE format('INSERT INTO public.%1$I(project_id,version_number,created_by,label,trigger_type,content_hash,%2$s) SELECT r.project_id,r.version_number,r.created_by,r.label,r.trigger_type,r.content_hash,%3$s FROM jsonb_populate_record(NULL::public.%1$I,$1) r RETURNING to_jsonb(%1$I)',spec->>'versions',columns,values_sql) INTO version USING payload;
  version_id := (version->>'id')::uuid;
  SELECT string_agg(quote_ident(field),',') INTO child_columns FROM jsonb_array_elements_text(spec->'child_fields') field;
  EXECUTE format('INSERT INTO public.%1$I(version_id,%2$s) SELECT $1,%2$s FROM jsonb_populate_recordset(NULL::public.%1$I,$2)',spec->>'items',child_columns) USING version_id,p_children;
  RETURN public.workflow_version_data(p_workflow,p_project_id,version_id) || jsonb_build_object('created',true);
END $function$
;

CREATE OR REPLACE FUNCTION public.search_project_codes_safe(p_project_id uuid, p_search_b64 text, p_include_deleted boolean, p_parent_code_id uuid, p_limit integer, p_offset integer)
 RETURNS SETOF project_codes
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  search_text text := convert_from(decode(p_search_b64, 'base64'), 'utf8');
  escaped_pattern text;
begin
  escaped_pattern := '%' || replace(replace(replace(search_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select c.*
  from public.project_codes c
  where c.project_id = p_project_id
    and (p_include_deleted or c.deleted_at is null)
    and (p_parent_code_id is null or c.parent_code_id = p_parent_code_id)
    and (
      c.name ilike escaped_pattern escape '\'
      or c.description ilike escaped_pattern escape '\'
      or c.definition ilike escaped_pattern escape '\'
    )
  order by c.position asc, c.name asc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_default_document_sources_after_project_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  perform public.seed_default_document_sources_for_project(new.id, new.owner_id);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_default_document_sources_for_project(pid uuid, user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  actor_id uuid;
begin
  actor_id := coalesce(user_id, auth.uid());

  insert into public.project_document_sources (
    project_id,
    code,
    label,
    description,
    is_default,
    position,
    created_by,
    updated_by
  )
  values
    (
      pid,
      'interview',
      'Entrevista',
      'Transcripción de entrevista individual.',
      true,
      10,
      actor_id,
      actor_id
    ),
    (
      pid,
      'focus_group',
      'Grupo focal',
      'Transcripción de grupo focal o conversación grupal.',
      true,
      20,
      actor_id,
      actor_id
    ),
    (
      pid,
      'field_note',
      'Nota de campo',
      'Notas tomadas durante trabajo de campo.',
      true,
      30,
      actor_id,
      actor_id
    ),
    (
      pid,
      'observation',
      'Observación',
      'Registro de observación participante o no participante.',
      true,
      40,
      actor_id,
      actor_id
    ),
    (
      pid,
      'diary',
      'Diario',
      'Diario reflexivo, bitácora o registro personal de campo.',
      true,
      50,
      actor_id,
      actor_id
    ),
    (
      pid,
      'archival_document',
      'Documento de archivo',
      'Documento histórico, institucional o material secundario.',
      true,
      60,
      actor_id,
      actor_id
    ),
    (
      pid,
      'open_text',
      'Texto abierto',
      'Texto cualitativo general pegado manualmente.',
      true,
      70,
      actor_id,
      actor_id
    ),
    (
      pid,
      'other',
      'Otro',
      'Fuente cualitativa no clasificada en las categorías anteriores.',
      true,
      80,
      actor_id,
      actor_id
    )
  on conflict (project_id, (lower(code))) where deleted_at is null
  do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_created_by_field()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_project_document_derived_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
    new.revision := coalesce(new.revision, 0);
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);

    if (
      new.title is distinct from old.title
      or new.content is distinct from old.content
      or new.document_type is distinct from old.document_type
      or new.source_id is distinct from old.source_id
      or new.participant_id is distinct from old.participant_id
      or new.interview_date is distinct from old.interview_date
      or new.field_date is distinct from old.field_date
      or new.location is distinct from old.location
      or new.language is distinct from old.language
      or new.notes is distinct from old.notes
      or new.metadata is distinct from old.metadata
      or new.status is distinct from old.status
      or new.deleted_at is distinct from old.deleted_at
    ) then
      new.revision := coalesce(old.revision, 0) + 1;
    end if;
  end if;

  new.character_count := char_length(coalesce(new.content, ''));
  new.word_count := public.approx_word_count(new.content);

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_project_document_segment_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
    new.revision := coalesce(new.revision, 0);
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);

    if (
      new.start_char is distinct from old.start_char
      or new.end_char is distinct from old.end_char
      or new.selected_text is distinct from old.selected_text
      or new.label is distinct from old.label
      or new.note is distinct from old.note
      or new.deleted_at is distinct from old.deleted_at
    ) then
      new.revision := coalesce(old.revision, 0) + 1;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_project_document_version_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  next_version_number integer;
begin
  new.created_at := coalesce(new.created_at, now());
  new.created_by := coalesce(new.created_by, auth.uid());

  if new.version_number is null then
    select coalesce(max(v.version_number), 0) + 1
    into next_version_number
    from public.project_document_versions v
    where v.document_id = new.document_id;

    new.version_number := next_version_number;
  end if;

  new.snapshot_character_count := char_length(coalesce(new.snapshot_content, ''));
  new.snapshot_word_count := public.approx_word_count(new.snapshot_content);

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_project_participant_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 0;
  ELSE
    -- Derive only from persisted OLD; caller-supplied NEW.revision is ignored.
    -- Includes direct allowed UPDATEs and soft deletes. The existing audit
    -- trigger updates audit fields only, so neither trigger increments twice.
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_project_row_audit_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin new.updated_at=now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_and_revision()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  new.revision = coalesce(old.revision, 0) + 1;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_sample_set_audit_fields_and_revision()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.created_at is null then
      new.created_at := now();
    end if;

    if new.updated_at is null then
      new.updated_at := now();
    end if;

    if new.created_by is null and auth.uid() is not null then
      new.created_by := auth.uid();
    end if;

    if new.updated_by is null and auth.uid() is not null then
      new.updated_by := auth.uid();
    end if;

    if new.revision is null then
      new.revision := 0;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.revision := coalesce(old.revision, 0) + 1;

    if auth.uid() is not null then
      new.updated_by := auth.uid();
    else
      new.updated_by := old.updated_by;
    end if;

    new.created_at := old.created_at;
    new.created_by := old.created_by;

    return new;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.utf16_normalized_length(input_text text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE STRICT
AS $function$
declare
  normalized text := regexp_replace(input_text, E'\r\n?', E'\n', 'g');
  character text;
  index_value integer;
  units integer := 0;
begin
  for index_value in 1..char_length(normalized) loop
    character := substr(normalized, index_value, 1);
    units := units + case
      when octet_length(convert_to(character, 'UTF8')) = 4 then 2
      else 1
    end;
  end loop;

  return units;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.utf16_normalized_slice(input_text text, start_unit integer, end_unit integer)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
AS $function$
declare
  normalized text := regexp_replace(input_text, E'\r\n?', E'\n', 'g');
  character text;
  index_value integer;
  cursor_unit integer := 0;
  character_units integer;
  output_text text := '';
begin
  if start_unit < 0 or end_unit < start_unit then
    return null;
  end if;

  for index_value in 1..char_length(normalized) loop
    character := substr(normalized, index_value, 1);
    character_units := case
      when octet_length(convert_to(character, 'UTF8')) = 4 then 2
      else 1
    end;

    if cursor_unit >= start_unit and cursor_unit + character_units <= end_unit then
      output_text := output_text || character;
    elsif cursor_unit < end_unit and cursor_unit + character_units > end_unit then
      return null;
    end if;

    cursor_unit := cursor_unit + character_units;
  end loop;

  if cursor_unit < end_unit then
    return null;
  end if;

  return output_text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_project_document_references()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if new.source_id is not null then
    if not exists (
      select 1
      from public.project_document_sources s
      where s.id = new.source_id
        and s.project_id = new.project_id
        and s.deleted_at is null
        and s.is_active = true
    ) then
      raise exception 'Invalid document source for this project';
    end if;
  end if;

  if new.participant_id is not null then
    if not exists (
      select 1
      from public.project_participants p
      where p.id = new.participant_id
        and p.project_id = new.project_id
        and p.deleted_at is null
    ) then
      raise exception 'Invalid participant for this project';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_project_document_segment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  document_content text;
  normalized_selected text;
  normalized_length integer;
  selected_slice text;
begin
  select d.content
  into document_content
  from public.project_documents d
  where d.id = new.document_id
    and d.project_id = new.project_id
    and d.deleted_at is null;

  if document_content is null then
    raise exception 'Document does not exist or is deleted';
  end if;

  normalized_length := public.utf16_normalized_length(document_content);
  if new.start_char < 0 or new.end_char < new.start_char
     or new.end_char > normalized_length then
    raise exception 'Segment range is outside document content';
  end if;

  normalized_selected := regexp_replace(new.selected_text, E'\r\n?', E'\n', 'g');
  selected_slice := public.utf16_normalized_slice(
    document_content, new.start_char, new.end_char
  );

  if selected_slice is null or selected_slice <> normalized_selected then
    raise exception 'Selected text does not match document content range';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.workflow_identity(workflow text, snapshot jsonb, children jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE spec jsonb := public.workflow_spec(workflow); result jsonb := '{}'::jsonb; field text; items jsonb;
BEGIN
  FOR field IN SELECT jsonb_array_elements_text(spec->'fields') LOOP
    IF field IN ('main_approach_code','scope_code','target_sample_size') THEN
      result := result || jsonb_build_object(field, snapshot->field);
    ELSE
      result := result || jsonb_build_object(field, public.workflow_trim(CASE WHEN workflow='delimitation' THEN replace(snapshot->>field,E'\r\n',E'\n') ELSE snapshot->>field END));
    END IF;
  END LOOP;
  IF workflow='delimitation' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'text',text) ORDER BY kind COLLATE "C",text COLLATE "C"),'[]') INTO items
    FROM (SELECT item->>'kind' kind, public.workflow_trim(replace(item->>'text',E'\r\n',E'\n')) text FROM jsonb_array_elements(children) item) normalized WHERE text<>'';
  ELSIF workflow='research-design' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('text',public.workflow_trim(item->>'text'),'position',item->'position') ORDER BY (item->>'position')::int,ord),'[]') INTO items
    FROM jsonb_array_elements(children) WITH ORDINALITY AS t(item,ord);
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('technique_code',item->'technique_code','custom_label',nullif(public.workflow_trim(item->>'custom_label'),''),'is_custom',item->'is_custom','position',item->'position') ORDER BY (item->>'position')::int,ord),'[]') INTO items
    FROM jsonb_array_elements(children) WITH ORDINALITY AS t(item,ord);
  END IF;
  RETURN result || jsonb_build_object('children',items);
END $function$
;

CREATE OR REPLACE FUNCTION public.workflow_lock_key(workflow text, project uuid)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT hashtextextended('workflow:' || workflow || ':' || project::text, 0)
$function$
;

CREATE OR REPLACE FUNCTION public.workflow_spec(workflow text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  CASE workflow
  WHEN 'delimitation' THEN RETURN '{"parent":"project_delimitation","child":"project_delimitation_items","versions":"project_delimitation_versions","items":"project_delimitation_version_items","fields":["topic","context_place","population","time_period","resources"],"child_fields":["kind","text","position"],"defaults":{"topic":"","context_place":"","population":"","time_period":"","resources":""}}'::jsonb;
  WHEN 'research-design' THEN RETURN '{"parent":"project_research_design","child":"project_specific_objectives","versions":"project_research_design_versions","items":"project_research_design_version_items","fields":["research_question","general_objective"],"child_fields":["text","position","workflow_order"],"defaults":{"research_question":"","general_objective":""}}'::jsonb;
  WHEN 'sample-config' THEN RETURN '{"parent":"project_sample_config","child":"project_sample_collection_techniques","versions":"project_sample_config_versions","items":"project_sample_config_version_techniques","fields":["main_approach_code","scope_code","field_phase","target_sample_size","sample_size_rationale"],"child_fields":["technique_code","custom_label","is_custom","position","workflow_order"],"defaults":{"main_approach_code":null,"scope_code":null,"field_phase":"","target_sample_size":null,"sample_size_rationale":""}}'::jsonb;
  ELSE RAISE EXCEPTION 'INVALID_WORKFLOW' USING ERRCODE = '22023';
  END CASE;
END $function$
;

CREATE OR REPLACE FUNCTION public.workflow_trim(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT btrim(coalesce(value,''), chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$function$
;

CREATE OR REPLACE FUNCTION public.workflow_version_data(workflow text, project uuid, version uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE spec jsonb := public.workflow_spec(workflow); parent jsonb; children jsonb; snapshot jsonb := '{}'::jsonb; field text;
BEGIN
  EXECUTE format('SELECT to_jsonb(v) FROM public.%I v WHERE project_id=$1 AND id=$2',spec->>'versions') INTO parent USING project,version;
  IF parent IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(i)-''workflow_order'' ORDER BY position,(to_jsonb(i)->>''workflow_order'')::bigint NULLS FIRST,created_at,id),''[]'') FROM public.%I i WHERE version_id=$1',spec->>'items') INTO children USING version;
  FOR field IN SELECT jsonb_array_elements_text(spec->'fields') LOOP snapshot := snapshot || jsonb_build_object(field,coalesce(nullif(parent->('snapshot_'||field),'null'::jsonb),spec->'defaults'->field)); END LOOP;
  RETURN jsonb_build_object('version',parent,'snapshot',snapshot,'children',children);
END $function$
;
CREATE UNIQUE INDEX profiles_email_key ON public.profiles USING btree (email);
CREATE UNIQUE INDEX profiles_username_key ON public.profiles USING btree (username);
CREATE INDEX project_activity_events_project_created_idx ON public.project_activity_events USING btree (project_id, created_at DESC);
CREATE INDEX project_analysis_events_entity_idx ON public.project_analysis_events USING btree (project_id, entity_type, entity_id);
CREATE INDEX project_analysis_events_project_idx ON public.project_analysis_events USING btree (project_id, created_at DESC);
CREATE INDEX project_codes_parent_idx ON public.project_codes USING btree (project_id, parent_code_id);
CREATE INDEX project_codes_project_active_position_idx ON public.project_codes USING btree (project_id, "position", name) WHERE (deleted_at IS NULL);
CREATE INDEX project_codes_project_idx ON public.project_codes USING btree (project_id);
CREATE UNIQUE INDEX project_codes_unique_active_name_idx ON public.project_codes USING btree (project_id, lower(name)) WHERE (deleted_at IS NULL);
CREATE INDEX idx_project_delimitation_revision ON public.project_delimitation USING btree (project_id, revision);
CREATE INDEX idx_project_delimitation_updated_at ON public.project_delimitation USING btree (updated_at);
CREATE INDEX idx_delim_items_kind ON public.project_delimitation_items USING btree (kind);
CREATE INDEX idx_delim_items_project ON public.project_delimitation_items USING btree (project_id);
CREATE INDEX idx_project_delimitation_items_project_kind ON public.project_delimitation_items USING btree (project_id, kind);
CREATE INDEX idx_project_delimitation_items_project_revision ON public.project_delimitation_items USING btree (project_id, revision);
CREATE INDEX idx_project_delimitation_items_updated_at ON public.project_delimitation_items USING btree (updated_at);
CREATE INDEX project_delimitation_version_items_version_position_idx ON public.project_delimitation_version_items USING btree (version_id, "position", created_at);
CREATE INDEX idx_delim_versions_project_content_hash ON public.project_delimitation_versions USING btree (project_id, content_hash) WHERE (content_hash IS NOT NULL);
CREATE INDEX idx_delim_versions_project_created_at ON public.project_delimitation_versions USING btree (project_id, created_at DESC);
CREATE INDEX project_document_events_document_created_idx ON public.project_document_events USING btree (document_id, created_at DESC) WHERE (document_id IS NOT NULL);
CREATE INDEX project_document_events_project_created_idx ON public.project_document_events USING btree (project_id, created_at DESC);
CREATE INDEX project_document_segments_project_created_idx ON public.project_document_segments USING btree (project_id, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX project_document_segments_project_document_idx ON public.project_document_segments USING btree (project_id, document_id, start_char) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX project_document_segments_unique_active_range_idx ON public.project_document_segments USING btree (document_id, start_char, end_char, lower(label)) WHERE (deleted_at IS NULL);
CREATE INDEX project_document_sources_project_active_position_idx ON public.project_document_sources USING btree (project_id, is_active, "position", label) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX project_document_sources_project_code_active_uidx ON public.project_document_sources USING btree (project_id, lower(code)) WHERE (deleted_at IS NULL);
CREATE INDEX project_document_versions_project_created_idx ON public.project_document_versions USING btree (project_id, created_at DESC);
CREATE INDEX project_document_versions_project_document_idx ON public.project_document_versions USING btree (project_id, document_id, version_number DESC);
CREATE INDEX project_documents_project_active_updated_idx ON public.project_documents USING btree (project_id, updated_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX project_documents_project_deleted_idx ON public.project_documents USING btree (project_id, deleted_at DESC) WHERE (deleted_at IS NOT NULL);
CREATE INDEX project_documents_project_participant_idx ON public.project_documents USING btree (project_id, participant_id) WHERE (deleted_at IS NULL);
CREATE INDEX project_documents_project_source_idx ON public.project_documents USING btree (project_id, source_id) WHERE (deleted_at IS NULL);
CREATE INDEX project_documents_project_type_status_idx ON public.project_documents USING btree (project_id, document_type, status) WHERE (deleted_at IS NULL);
CREATE INDEX project_documents_title_trgm_idx ON public.project_documents USING gin (title gin_trgm_ops);
CREATE INDEX project_insight_links_insight_idx ON public.project_insight_links USING btree (project_id, insight_id);
CREATE INDEX project_insight_links_project_idx ON public.project_insight_links USING btree (project_id);
CREATE UNIQUE INDEX project_insight_links_unique_code_idx ON public.project_insight_links USING btree (insight_id, code_id) WHERE (link_type = 'code'::text);
CREATE UNIQUE INDEX project_insight_links_unique_document_idx ON public.project_insight_links USING btree (insight_id, document_id) WHERE (link_type = 'document'::text);
CREATE UNIQUE INDEX project_insight_links_unique_memo_idx ON public.project_insight_links USING btree (insight_id, memo_id) WHERE (link_type = 'memo'::text);
CREATE UNIQUE INDEX project_insight_links_unique_participant_idx ON public.project_insight_links USING btree (insight_id, participant_id) WHERE (link_type = 'participant'::text);
CREATE UNIQUE INDEX project_insight_links_unique_segment_idx ON public.project_insight_links USING btree (insight_id, segment_id) WHERE (link_type = 'segment'::text);
CREATE INDEX project_insights_project_active_updated_idx ON public.project_insights USING btree (project_id, updated_at DESC, id DESC) WHERE (deleted_at IS NULL);
CREATE INDEX project_insights_project_idx ON public.project_insights USING btree (project_id);
CREATE INDEX project_insights_tags_idx ON public.project_insights USING gin (tags);
CREATE INDEX project_insights_type_status_idx ON public.project_insights USING btree (project_id, insight_type, status);
CREATE UNIQUE INDEX project_invitations_pending_email_uidx ON public.project_invitations USING btree (project_id, lower(email)) WHERE (status = 'pending'::text);
CREATE INDEX project_invitations_project_status_idx ON public.project_invitations USING btree (project_id, status, created_at DESC);
CREATE INDEX project_members_user_id_project_id_idx ON public.project_members USING btree (user_id, project_id);
CREATE INDEX project_memo_links_memo_idx ON public.project_memo_links USING btree (project_id, memo_id);
CREATE INDEX project_memo_links_project_idx ON public.project_memo_links USING btree (project_id);
CREATE UNIQUE INDEX project_memo_links_unique_code_idx ON public.project_memo_links USING btree (memo_id, code_id) WHERE (link_type = 'code'::text);
CREATE UNIQUE INDEX project_memo_links_unique_document_idx ON public.project_memo_links USING btree (memo_id, document_id) WHERE (link_type = 'document'::text);
CREATE UNIQUE INDEX project_memo_links_unique_participant_idx ON public.project_memo_links USING btree (memo_id, participant_id) WHERE (link_type = 'participant'::text);
CREATE UNIQUE INDEX project_memo_links_unique_segment_idx ON public.project_memo_links USING btree (memo_id, segment_id) WHERE (link_type = 'segment'::text);
CREATE INDEX project_memos_project_active_idx ON public.project_memos USING btree (project_id) WHERE (deleted_at IS NULL);
CREATE INDEX project_memos_project_active_updated_idx ON public.project_memos USING btree (project_id, updated_at DESC, id DESC) WHERE (deleted_at IS NULL);
CREATE INDEX project_memos_project_idx ON public.project_memos USING btree (project_id);
CREATE INDEX project_memos_tags_idx ON public.project_memos USING gin (tags);
CREATE INDEX project_memos_type_status_idx ON public.project_memos USING btree (project_id, memo_type, status);
CREATE INDEX project_participants_project_active_idx ON public.project_participants USING btree (project_id, created_at DESC) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX project_participants_project_alias_active_uidx ON public.project_participants USING btree (project_id, lower(alias)) WHERE (deleted_at IS NULL);
CREATE INDEX project_participants_project_deleted_idx ON public.project_participants USING btree (project_id, deleted_at DESC) WHERE (deleted_at IS NOT NULL);
CREATE INDEX project_presence_resource_seen_idx ON public.project_presence USING btree (project_id, resource_type, resource_id, last_seen_at DESC);
CREATE INDEX idx_project_research_design_updated_at ON public.project_research_design USING btree (updated_at);
CREATE INDEX idx_project_research_design_version_items_version_id ON public.project_research_design_version_items USING btree (version_id);
CREATE INDEX idx_project_research_design_version_items_version_position ON public.project_research_design_version_items USING btree (version_id, "position");
CREATE INDEX idx_project_research_design_versions_project_created_at ON public.project_research_design_versions USING btree (project_id, created_at DESC);
CREATE INDEX idx_project_research_design_versions_project_id ON public.project_research_design_versions USING btree (project_id);
CREATE INDEX idx_project_sample_collection_techniques_project ON public.project_sample_collection_techniques USING btree (project_id);
CREATE INDEX idx_project_sample_collection_techniques_project_position ON public.project_sample_collection_techniques USING btree (project_id, "position");
CREATE UNIQUE INDEX uq_sample_techniques_custom_per_project ON public.project_sample_collection_techniques USING btree (project_id, lower(btrim(custom_label))) WHERE ((is_custom = true) AND (custom_label IS NOT NULL));
CREATE UNIQUE INDEX uq_sample_techniques_standard_per_project ON public.project_sample_collection_techniques USING btree (project_id, technique_code) WHERE ((is_custom = false) AND (technique_code IS NOT NULL));
CREATE INDEX idx_project_sample_config_main_approach ON public.project_sample_config USING btree (main_approach_code);
CREATE INDEX idx_project_sample_config_scope ON public.project_sample_config USING btree (scope_code);
CREATE INDEX idx_project_sample_config_version_techniques_version ON public.project_sample_config_version_techniques USING btree (version_id, "position");
CREATE INDEX idx_project_sample_config_versions_project_created ON public.project_sample_config_versions USING btree (project_id, created_at DESC);
CREATE INDEX project_segment_codes_code_idx ON public.project_segment_codes USING btree (project_id, code_id);
CREATE INDEX project_segment_codes_project_code_segment_active_idx ON public.project_segment_codes USING btree (project_id, code_id, segment_id) WHERE (deleted_at IS NULL);
CREATE INDEX project_segment_codes_project_idx ON public.project_segment_codes USING btree (project_id);
CREATE INDEX project_segment_codes_project_quote_active_idx ON public.project_segment_codes USING btree (project_id, is_quote) WHERE (deleted_at IS NULL);
CREATE INDEX project_segment_codes_project_segment_code_active_idx ON public.project_segment_codes USING btree (project_id, segment_id, code_id) WHERE (deleted_at IS NULL);
CREATE INDEX project_segment_codes_segment_idx ON public.project_segment_codes USING btree (project_id, segment_id);
CREATE UNIQUE INDEX project_segment_codes_unique_active_idx ON public.project_segment_codes USING btree (segment_id, code_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_project_specific_objectives_project_id ON public.project_specific_objectives USING btree (project_id);
CREATE INDEX idx_project_specific_objectives_project_position ON public.project_specific_objectives USING btree (project_id, "position");
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_activity_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_analysis_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_delimitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_delimitation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_delimitation_version_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_delimitation_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_document_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_document_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_document_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_insight_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_memo_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_memos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_presence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_research_design" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_research_design_version_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_research_design_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_sample_collection_techniques" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_sample_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_sample_config_version_techniques" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_sample_config_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_segment_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_specific_objectives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sample_collection_technique_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sample_main_approach_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sample_scope_options" ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.app_is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.app_profile_role()='owner' $function$
;

CREATE OR REPLACE FUNCTION public.app_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.app_profile_role() in ('owner','employee') $function$
;

CREATE OR REPLACE FUNCTION public.app_profile_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role::text
  from public.profiles
  where id = (select auth.uid())
    and is_active = true;
$function$
;
REVOKE ALL ON FUNCTION public."app_is_owner"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."app_is_staff"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."app_profile_role"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."app_is_owner"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."app_is_owner"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."app_is_staff"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."app_is_staff"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."app_profile_role"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."app_profile_role"() TO "service_role";
CREATE POLICY "profiles owner insert" ON public."profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (app_is_owner());
CREATE POLICY "profiles owner update" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_is_owner()) WITH CHECK (app_is_owner());
CREATE POLICY "profiles read self or owner" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) OR app_is_owner()));
CREATE POLICY "profiles_insert_own" ON public."profiles" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid) = id));
CREATE POLICY "profiles_select_own" ON public."profiles" AS PERMISSIVE FOR SELECT TO "public" USING ((( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid) = id));
CREATE POLICY "profiles_update_own" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "public" USING ((( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid) = id)) WITH CHECK ((( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid) = id));
CREATE POLICY "project_activity_member_insert" ON public."project_activity_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_activity_events.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))))));
CREATE POLICY "project_activity_member_select" ON public."project_activity_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_activity_events.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))))));
CREATE POLICY "project_analysis_events_insert_editor" ON public."project_analysis_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((created_by IS NULL) OR (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "project_analysis_events_select_member" ON public."project_analysis_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text, 'viewer'::text]));
CREATE POLICY "project_codes_delete_editor" ON public."project_codes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]));
CREATE POLICY "project_codes_insert_editor" ON public."project_codes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((created_by IS NULL) OR (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))) AND ((updated_by IS NULL) OR (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "project_codes_select_member" ON public."project_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text, 'viewer'::text]));
CREATE POLICY "project_codes_update_editor" ON public."project_codes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text])) WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((updated_by IS NULL) OR (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "delim_select_members" ON public."project_delimitation" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_project_member(project_id));
CREATE POLICY "delim_upsert_owner_editor" ON public."project_delimitation" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_delimitation.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['owner'::project_role, 'editor'::project_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_delimitation.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['owner'::project_role, 'editor'::project_role]))))));
CREATE POLICY "delim_items_select_members" ON public."project_delimitation_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_project_member(project_id));
CREATE POLICY "delim_items_write_owner_editor" ON public."project_delimitation_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_delimitation_items.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['owner'::project_role, 'editor'::project_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_delimitation_items.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['owner'::project_role, 'editor'::project_role]))))));
CREATE POLICY "delimitation_version_items_select_member" ON public."project_delimitation_version_items" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM project_delimitation_versions v
  WHERE ((v.id = project_delimitation_version_items.version_id) AND is_project_member(v.project_id)))));
CREATE POLICY "delimitation_version_items_write_editor_owner" ON public."project_delimitation_version_items" AS PERMISSIVE FOR ALL TO "public" USING ((EXISTS ( SELECT 1
   FROM project_delimitation_versions v
  WHERE ((v.id = project_delimitation_version_items.version_id) AND has_project_role(v.project_id, ARRAY['owner'::text, 'editor'::text]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_delimitation_versions v
  WHERE ((v.id = project_delimitation_version_items.version_id) AND has_project_role(v.project_id, ARRAY['owner'::text, 'editor'::text])))));
CREATE POLICY "delimitation_versions_select_member" ON public."project_delimitation_versions" AS PERMISSIVE FOR SELECT TO "public" USING (is_project_member(project_id));
CREATE POLICY "delimitation_versions_write_editor_owner" ON public."project_delimitation_versions" AS PERMISSIVE FOR ALL TO "public" USING (has_project_role(project_id, ARRAY['owner'::text, 'editor'::text])) WITH CHECK (has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]));
CREATE POLICY "document_events_delete_owner" ON public."project_document_events" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_project_owner(project_id));
CREATE POLICY "document_events_insert_owner_editor" ON public."project_document_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_project_owner_or_editor(project_id) AND (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "document_events_select_members" ON public."project_document_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_project_member(project_id));
CREATE POLICY "document_segments_delete_owner" ON public."project_document_segments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_project_owner(project_id));
CREATE POLICY "document_segments_insert_owner_editor" ON public."project_document_segments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_project_owner_or_editor(project_id) AND (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "document_segments_select_members" ON public."project_document_segments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_project_member(project_id));
CREATE POLICY "document_segments_update_owner_editor" ON public."project_document_segments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_project_owner_or_editor(project_id)) WITH CHECK ((is_project_owner_or_editor(project_id) AND (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "document_sources_delete_owner" ON public."project_document_sources" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_project_owner(project_id));
CREATE POLICY "document_sources_insert_owner_editor" ON public."project_document_sources" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_project_owner_or_editor(project_id) AND (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "document_sources_select_members" ON public."project_document_sources" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_project_member(project_id));
CREATE POLICY "document_sources_update_owner_editor" ON public."project_document_sources" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_project_owner_or_editor(project_id)) WITH CHECK ((is_project_owner_or_editor(project_id) AND (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "document_versions_delete_owner" ON public."project_document_versions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_project_owner(project_id));
CREATE POLICY "document_versions_insert_owner_editor" ON public."project_document_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_project_owner_or_editor(project_id) AND (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "document_versions_select_members" ON public."project_document_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_project_member(project_id));
CREATE POLICY "documents_delete_owner" ON public."project_documents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_project_owner(project_id));
CREATE POLICY "documents_insert_owner_editor" ON public."project_documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_project_owner_or_editor(project_id) AND (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "documents_select_members" ON public."project_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_project_member(project_id));
CREATE POLICY "documents_update_owner_editor" ON public."project_documents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_project_owner_or_editor(project_id)) WITH CHECK ((is_project_owner_or_editor(project_id) AND (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "project_insight_links_delete_editor" ON public."project_insight_links" AS PERMISSIVE FOR DELETE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]));
CREATE POLICY "project_insight_links_insert_editor" ON public."project_insight_links" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((created_by IS NULL) OR (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "project_insight_links_select_member" ON public."project_insight_links" AS PERMISSIVE FOR SELECT TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text, 'viewer'::text]));
CREATE POLICY "project_insights_delete_editor" ON public."project_insights" AS PERMISSIVE FOR DELETE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]));
CREATE POLICY "project_insights_insert_editor" ON public."project_insights" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((created_by IS NULL) OR (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))) AND ((updated_by IS NULL) OR (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "project_insights_select_member" ON public."project_insights" AS PERMISSIVE FOR SELECT TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text, 'viewer'::text]));
CREATE POLICY "project_insights_update_editor" ON public."project_insights" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text])) WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((updated_by IS NULL) OR (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "project_invitations_invitee_accept_update" ON public."project_invitations" AS PERMISSIVE FOR UPDATE TO "public" USING (((status = 'pending'::text) AND (expires_at > now()) AND (lower(email) = lower(COALESCE((( SELECT ( SELECT ( SELECT auth.jwt() AS jwt) AS jwt) AS jwt) ->> 'email'::text), ''::text))))) WITH CHECK (((status = 'accepted'::text) AND (accepted_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (lower(email) = lower(COALESCE((( SELECT ( SELECT ( SELECT auth.jwt() AS jwt) AS jwt) AS jwt) ->> 'email'::text), ''::text)))));
CREATE POLICY "project_invitations_invitee_select" ON public."project_invitations" AS PERMISSIVE FOR SELECT TO "public" USING (((status = 'pending'::text) AND (expires_at > now()) AND (lower(email) = lower(COALESCE((( SELECT ( SELECT ( SELECT auth.jwt() AS jwt) AS jwt) AS jwt) ->> 'email'::text), ''::text)))));
CREATE POLICY "project_invitations_member_select" ON public."project_invitations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_invitations.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))))));
CREATE POLICY "project_invitations_owner_write" ON public."project_invitations" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_invitations.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = 'owner'::project_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_invitations.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = 'owner'::project_role)))));
CREATE POLICY "pm_delete_nonowner_self" ON public."project_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) AND (role <> 'owner'::project_role)));
CREATE POLICY "pm_delete_owner" ON public."project_members" AS PERMISSIVE FOR DELETE TO "public" USING ((project_role(project_id) = 'owner'::project_role));
CREATE POLICY "pm_insert_owner" ON public."project_members" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((project_role(project_id) = 'owner'::project_role) AND (role <> 'owner'::project_role)));
CREATE POLICY "pm_select_members" ON public."project_members" AS PERMISSIVE FOR SELECT TO "public" USING (is_project_member(project_id));
CREATE POLICY "pm_update_owner" ON public."project_members" AS PERMISSIVE FOR UPDATE TO "public" USING ((project_role(project_id) = 'owner'::project_role)) WITH CHECK ((project_role(project_id) = 'owner'::project_role));
CREATE POLICY "project_members_invitee_insert" ON public."project_members" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (role <> 'owner'::project_role) AND (EXISTS ( SELECT 1
   FROM project_invitations pi
  WHERE ((pi.project_id = project_members.project_id) AND (pi.status = 'pending'::text) AND (pi.expires_at > now()) AND (pi.role = project_members.role) AND (lower(pi.email) = lower(COALESCE((( SELECT ( SELECT ( SELECT auth.jwt() AS jwt) AS jwt) AS jwt) ->> 'email'::text), ''::text))))))));
CREATE POLICY "project_memo_links_delete_editor" ON public."project_memo_links" AS PERMISSIVE FOR DELETE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]));
CREATE POLICY "project_memo_links_insert_editor" ON public."project_memo_links" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((created_by IS NULL) OR (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "project_memo_links_select_member" ON public."project_memo_links" AS PERMISSIVE FOR SELECT TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text, 'viewer'::text]));
CREATE POLICY "project_memos_delete_editor" ON public."project_memos" AS PERMISSIVE FOR DELETE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]));
CREATE POLICY "project_memos_insert_editor" ON public."project_memos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((created_by IS NULL) OR (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))) AND ((updated_by IS NULL) OR (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "project_memos_select_member" ON public."project_memos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text, 'viewer'::text]));
CREATE POLICY "project_memos_update_editor" ON public."project_memos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text])) WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((updated_by IS NULL) OR (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "participants_delete_owner" ON public."project_participants" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_project_owner(project_id));
CREATE POLICY "participants_insert_owner_editor" ON public."project_participants" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_project_owner_or_editor(project_id) AND (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "participants_select_members" ON public."project_participants" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_project_member(project_id));
CREATE POLICY "participants_update_owner_editor" ON public."project_participants" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_project_owner_or_editor(project_id)) WITH CHECK ((is_project_owner_or_editor(project_id) AND (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "project_presence_member_select" ON public."project_presence" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_presence.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))))));
CREATE POLICY "project_presence_self_upsert" ON public."project_presence" AS PERMISSIVE FOR ALL TO "authenticated" USING (((user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_presence.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))))))) WITH CHECK (((user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_presence.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))))));
CREATE POLICY "research_design_delete_editor_owner" ON public."project_research_design" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_research_design.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "research_design_insert_editor_owner" ON public."project_research_design" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_research_design.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "research_design_select_members" ON public."project_research_design" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_research_design.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['viewer'::project_role, 'editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "research_design_update_editor_owner" ON public."project_research_design" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_research_design.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_research_design.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "research_design_version_items_select_members" ON public."project_research_design_version_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (project_research_design_versions v
     JOIN project_members pm ON ((pm.project_id = v.project_id)))
  WHERE ((v.id = project_research_design_version_items.version_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['viewer'::project_role, 'editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "research_design_version_items_write_owner_editor" ON public."project_research_design_version_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (project_research_design_versions v
     JOIN project_members pm ON ((pm.project_id = v.project_id)))
  WHERE ((v.id = project_research_design_version_items.version_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (project_research_design_versions v
     JOIN project_members pm ON ((pm.project_id = v.project_id)))
  WHERE ((v.id = project_research_design_version_items.version_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "research_design_versions_select_members" ON public."project_research_design_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_research_design_versions.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['viewer'::project_role, 'editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "research_design_versions_write_owner_editor" ON public."project_research_design_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_research_design_versions.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_research_design_versions.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "sample_techniques_select_members" ON public."project_sample_collection_techniques" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_collection_techniques.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))))));
CREATE POLICY "sample_techniques_write_owner_editor" ON public."project_sample_collection_techniques" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_collection_techniques.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_collection_techniques.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text]))))));
CREATE POLICY "sample_config_delete_editor_owner" ON public."project_sample_config" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_config.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text]))))));
CREATE POLICY "sample_config_insert_editor_owner" ON public."project_sample_config" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_config.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text]))))));
CREATE POLICY "sample_config_select_members" ON public."project_sample_config" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_config.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))))));
CREATE POLICY "sample_config_update_editor_owner" ON public."project_sample_config" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_config.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_config.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text]))))));
CREATE POLICY "sample_config_version_techniques_select_members" ON public."project_sample_config_version_techniques" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (project_sample_config_versions v
     JOIN project_members pm ON ((pm.project_id = v.project_id)))
  WHERE ((v.id = project_sample_config_version_techniques.version_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))))));
CREATE POLICY "sample_config_version_techniques_write_owner_editor" ON public."project_sample_config_version_techniques" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (project_sample_config_versions v
     JOIN project_members pm ON ((pm.project_id = v.project_id)))
  WHERE ((v.id = project_sample_config_version_techniques.version_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (project_sample_config_versions v
     JOIN project_members pm ON ((pm.project_id = v.project_id)))
  WHERE ((v.id = project_sample_config_version_techniques.version_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text]))))));
CREATE POLICY "sample_config_versions_select_members" ON public."project_sample_config_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_config_versions.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))))));
CREATE POLICY "sample_config_versions_write_owner_editor" ON public."project_sample_config_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_config_versions.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_sample_config_versions.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND ((pm.role)::text = ANY (ARRAY['owner'::text, 'editor'::text]))))));
CREATE POLICY "project_segment_codes_delete_editor" ON public."project_segment_codes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]));
CREATE POLICY "project_segment_codes_insert_editor" ON public."project_segment_codes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((created_by IS NULL) OR (created_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))) AND ((updated_by IS NULL) OR (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "project_segment_codes_select_member" ON public."project_segment_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text, 'viewer'::text]));
CREATE POLICY "project_segment_codes_update_editor" ON public."project_segment_codes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text])) WITH CHECK ((analysis_has_project_role(project_id, ARRAY['owner'::text, 'editor'::text]) AND ((updated_by IS NULL) OR (updated_by = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)))));
CREATE POLICY "specific_objectives_delete_editor_owner" ON public."project_specific_objectives" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_specific_objectives.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "specific_objectives_insert_editor_owner" ON public."project_specific_objectives" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_specific_objectives.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "specific_objectives_select_members" ON public."project_specific_objectives" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_specific_objectives.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['viewer'::project_role, 'editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "specific_objectives_update_editor_owner" ON public."project_specific_objectives" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_specific_objectives.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_members pm
  WHERE ((pm.project_id = project_specific_objectives.project_id) AND (pm.user_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)) AND (pm.role = ANY (ARRAY['editor'::project_role, 'owner'::project_role]))))));
CREATE POLICY "projects_delete_owner" ON public."projects" AS PERMISSIVE FOR DELETE TO "public" USING ((project_role(id) = 'owner'::project_role));
CREATE POLICY "projects_insert_owner" ON public."projects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owner_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid)));
CREATE POLICY "projects_select_members" ON public."projects" AS PERMISSIVE FOR SELECT TO "public" USING ((is_project_member(id) OR (owner_id = ( SELECT ( SELECT ( SELECT auth.uid() AS uid) AS uid) AS uid))));
CREATE POLICY "projects_update_owner_editor" ON public."projects" AS PERMISSIVE FOR UPDATE TO "public" USING ((project_role(id) = ANY (ARRAY['owner'::project_role, 'editor'::project_role]))) WITH CHECK ((project_role(id) = ANY (ARRAY['owner'::project_role, 'editor'::project_role])));
CREATE POLICY "sample_collection_technique_options_select_authenticated" ON public."sample_collection_technique_options" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "sample_main_approach_options_select_authenticated" ON public."sample_main_approach_options" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "sample_scope_options_select_authenticated" ON public."sample_scope_options" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_analysis_events_created_by BEFORE INSERT ON public.project_analysis_events FOR EACH ROW EXECUTE FUNCTION set_created_by_field();
CREATE TRIGGER guard_code_soft_delete_dependencies BEFORE UPDATE OF deleted_at ON public.project_codes FOR EACH ROW EXECUTE FUNCTION guard_code_soft_delete_dependencies();
CREATE TRIGGER prevent_project_code_cycle BEFORE INSERT OR UPDATE OF project_id, parent_code_id ON public.project_codes FOR EACH ROW EXECUTE FUNCTION prevent_project_code_cycle();
CREATE TRIGGER trg_project_codes_audit BEFORE INSERT OR UPDATE ON public.project_codes FOR EACH ROW EXECUTE FUNCTION set_project_row_audit_fields();
CREATE TRIGGER trg_project_codes_updated_at_revision BEFORE UPDATE ON public.project_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_revision();
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_delimitation FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('delimitation', 'project_id');
CREATE TRIGGER trg_project_delimitation_updated_at BEFORE UPDATE ON public.project_delimitation FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_delimitation_items FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('delimitation', 'project_id');
CREATE TRIGGER trg_project_delimitation_items_updated_at BEFORE UPDATE ON public.project_delimitation_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_delimitation_version_items FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('delimitation', 'version_id');
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_delimitation_versions FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('delimitation', 'project_id');
CREATE TRIGGER reject_duplicate_delimitation_snapshot BEFORE INSERT ON public.project_delimitation_versions FOR EACH ROW EXECUTE FUNCTION reject_duplicate_workflow_snapshot();
CREATE TRIGGER trg_project_document_events_created_by BEFORE INSERT ON public.project_document_events FOR EACH ROW EXECUTE FUNCTION set_created_by_field();
CREATE TRIGGER trg_project_document_segments_fields BEFORE INSERT OR UPDATE ON public.project_document_segments FOR EACH ROW EXECUTE FUNCTION set_project_document_segment_fields();
CREATE TRIGGER trg_project_document_segments_validate BEFORE INSERT OR UPDATE ON public.project_document_segments FOR EACH ROW EXECUTE FUNCTION validate_project_document_segment();
CREATE TRIGGER trg_project_document_sources_audit BEFORE INSERT OR UPDATE ON public.project_document_sources FOR EACH ROW EXECUTE FUNCTION set_project_row_audit_fields();
CREATE TRIGGER trg_project_document_versions_fields BEFORE INSERT ON public.project_document_versions FOR EACH ROW EXECUTE FUNCTION set_project_document_version_fields();
CREATE TRIGGER guard_document_content_with_segments BEFORE UPDATE OF content ON public.project_documents FOR EACH ROW EXECUTE FUNCTION guard_document_content_with_segments();
CREATE TRIGGER trg_project_documents_derived_fields BEFORE INSERT OR UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION set_project_document_derived_fields();
CREATE TRIGGER trg_project_documents_validate_refs BEFORE INSERT OR UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION validate_project_document_references();
CREATE TRIGGER trg_project_insight_links_created_by BEFORE INSERT ON public.project_insight_links FOR EACH ROW EXECUTE FUNCTION set_created_by_field();
CREATE TRIGGER trg_project_insights_audit BEFORE INSERT OR UPDATE ON public.project_insights FOR EACH ROW EXECUTE FUNCTION set_project_row_audit_fields();
CREATE TRIGGER trg_project_insights_updated_at_revision BEFORE UPDATE ON public.project_insights FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_revision();
CREATE TRIGGER trg_project_memo_links_created_by BEFORE INSERT ON public.project_memo_links FOR EACH ROW EXECUTE FUNCTION set_created_by_field();
CREATE TRIGGER trg_project_memos_audit BEFORE INSERT OR UPDATE ON public.project_memos FOR EACH ROW EXECUTE FUNCTION set_project_row_audit_fields();
CREATE TRIGGER trg_project_memos_updated_at_revision BEFORE UPDATE ON public.project_memos FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_revision();
CREATE TRIGGER trg_project_participants_audit BEFORE INSERT OR UPDATE ON public.project_participants FOR EACH ROW EXECUTE FUNCTION set_project_row_audit_fields();
CREATE TRIGGER trg_project_participants_revision BEFORE INSERT OR UPDATE ON public.project_participants FOR EACH ROW EXECUTE FUNCTION set_project_participant_revision();
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_research_design FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('research-design', 'project_id');
CREATE TRIGGER trg_project_research_design_updated_at BEFORE UPDATE ON public.project_research_design FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_research_design_version_items FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('research-design', 'version_id');
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_research_design_versions FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('research-design', 'project_id');
CREATE TRIGGER reject_duplicate_research_design_snapshot BEFORE INSERT ON public.project_research_design_versions FOR EACH ROW EXECUTE FUNCTION reject_duplicate_workflow_snapshot();
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_sample_collection_techniques FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('sample-config', 'project_id');
CREATE TRIGGER trg_project_sample_collection_techniques_audit BEFORE INSERT OR UPDATE ON public.project_sample_collection_techniques FOR EACH ROW EXECUTE FUNCTION tg_sample_set_audit_fields_and_revision();
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_sample_config FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('sample-config', 'project_id');
CREATE TRIGGER trg_project_sample_config_audit BEFORE INSERT OR UPDATE ON public.project_sample_config FOR EACH ROW EXECUTE FUNCTION tg_sample_set_audit_fields_and_revision();
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_sample_config_version_techniques FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('sample-config', 'version_id');
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_sample_config_versions FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('sample-config', 'project_id');
CREATE TRIGGER reject_duplicate_sample_config_snapshot BEFORE INSERT ON public.project_sample_config_versions FOR EACH ROW EXECUTE FUNCTION reject_duplicate_workflow_snapshot();
CREATE TRIGGER trg_project_segment_codes_audit BEFORE INSERT OR UPDATE ON public.project_segment_codes FOR EACH ROW EXECUTE FUNCTION set_project_row_audit_fields();
CREATE TRIGGER trg_project_segment_codes_updated_at_revision BEFORE UPDATE ON public.project_segment_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_revision();
CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR DELETE OR UPDATE ON public.project_specific_objectives FOR EACH ROW EXECUTE FUNCTION coordinate_workflow_write('research-design', 'project_id');
CREATE TRIGGER trg_project_specific_objectives_updated_at BEFORE UPDATE ON public.project_specific_objectives FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_add_owner_member AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION add_project_owner_member();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_seed_document_sources_after_project_insert AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION seed_default_document_sources_after_project_insert();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
GRANT DELETE ON TABLE public."profiles" TO "anon";
GRANT INSERT ON TABLE public."profiles" TO "anon";
GRANT REFERENCES ON TABLE public."profiles" TO "anon";
GRANT SELECT ON TABLE public."profiles" TO "anon";
GRANT TRIGGER ON TABLE public."profiles" TO "anon";
GRANT TRUNCATE ON TABLE public."profiles" TO "anon";
GRANT UPDATE ON TABLE public."profiles" TO "anon";
GRANT DELETE ON TABLE public."profiles" TO "authenticated";
GRANT INSERT ON TABLE public."profiles" TO "authenticated";
GRANT REFERENCES ON TABLE public."profiles" TO "authenticated";
GRANT SELECT ON TABLE public."profiles" TO "authenticated";
GRANT TRIGGER ON TABLE public."profiles" TO "authenticated";
GRANT TRUNCATE ON TABLE public."profiles" TO "authenticated";
GRANT UPDATE ON TABLE public."profiles" TO "authenticated";
GRANT DELETE ON TABLE public."profiles" TO "service_role";
GRANT INSERT ON TABLE public."profiles" TO "service_role";
GRANT REFERENCES ON TABLE public."profiles" TO "service_role";
GRANT SELECT ON TABLE public."profiles" TO "service_role";
GRANT TRIGGER ON TABLE public."profiles" TO "service_role";
GRANT TRUNCATE ON TABLE public."profiles" TO "service_role";
GRANT UPDATE ON TABLE public."profiles" TO "service_role";
GRANT DELETE ON TABLE public."project_activity_events" TO "anon";
GRANT INSERT ON TABLE public."project_activity_events" TO "anon";
GRANT REFERENCES ON TABLE public."project_activity_events" TO "anon";
GRANT SELECT ON TABLE public."project_activity_events" TO "anon";
GRANT TRIGGER ON TABLE public."project_activity_events" TO "anon";
GRANT TRUNCATE ON TABLE public."project_activity_events" TO "anon";
GRANT UPDATE ON TABLE public."project_activity_events" TO "anon";
GRANT DELETE ON TABLE public."project_activity_events" TO "authenticated";
GRANT INSERT ON TABLE public."project_activity_events" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_activity_events" TO "authenticated";
GRANT SELECT ON TABLE public."project_activity_events" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_activity_events" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_activity_events" TO "authenticated";
GRANT UPDATE ON TABLE public."project_activity_events" TO "authenticated";
GRANT DELETE ON TABLE public."project_activity_events" TO "service_role";
GRANT INSERT ON TABLE public."project_activity_events" TO "service_role";
GRANT REFERENCES ON TABLE public."project_activity_events" TO "service_role";
GRANT SELECT ON TABLE public."project_activity_events" TO "service_role";
GRANT TRIGGER ON TABLE public."project_activity_events" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_activity_events" TO "service_role";
GRANT UPDATE ON TABLE public."project_activity_events" TO "service_role";
GRANT DELETE ON TABLE public."project_analysis_events" TO "anon";
GRANT INSERT ON TABLE public."project_analysis_events" TO "anon";
GRANT REFERENCES ON TABLE public."project_analysis_events" TO "anon";
GRANT SELECT ON TABLE public."project_analysis_events" TO "anon";
GRANT TRIGGER ON TABLE public."project_analysis_events" TO "anon";
GRANT TRUNCATE ON TABLE public."project_analysis_events" TO "anon";
GRANT UPDATE ON TABLE public."project_analysis_events" TO "anon";
GRANT DELETE ON TABLE public."project_analysis_events" TO "authenticated";
GRANT INSERT ON TABLE public."project_analysis_events" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_analysis_events" TO "authenticated";
GRANT SELECT ON TABLE public."project_analysis_events" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_analysis_events" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_analysis_events" TO "authenticated";
GRANT UPDATE ON TABLE public."project_analysis_events" TO "authenticated";
GRANT DELETE ON TABLE public."project_analysis_events" TO "service_role";
GRANT INSERT ON TABLE public."project_analysis_events" TO "service_role";
GRANT REFERENCES ON TABLE public."project_analysis_events" TO "service_role";
GRANT SELECT ON TABLE public."project_analysis_events" TO "service_role";
GRANT TRIGGER ON TABLE public."project_analysis_events" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_analysis_events" TO "service_role";
GRANT UPDATE ON TABLE public."project_analysis_events" TO "service_role";
GRANT DELETE ON TABLE public."project_codes" TO "anon";
GRANT INSERT ON TABLE public."project_codes" TO "anon";
GRANT REFERENCES ON TABLE public."project_codes" TO "anon";
GRANT SELECT ON TABLE public."project_codes" TO "anon";
GRANT TRIGGER ON TABLE public."project_codes" TO "anon";
GRANT TRUNCATE ON TABLE public."project_codes" TO "anon";
GRANT UPDATE ON TABLE public."project_codes" TO "anon";
GRANT DELETE ON TABLE public."project_codes" TO "authenticated";
GRANT INSERT ON TABLE public."project_codes" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_codes" TO "authenticated";
GRANT SELECT ON TABLE public."project_codes" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_codes" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_codes" TO "authenticated";
GRANT UPDATE ON TABLE public."project_codes" TO "authenticated";
GRANT DELETE ON TABLE public."project_codes" TO "service_role";
GRANT INSERT ON TABLE public."project_codes" TO "service_role";
GRANT REFERENCES ON TABLE public."project_codes" TO "service_role";
GRANT SELECT ON TABLE public."project_codes" TO "service_role";
GRANT TRIGGER ON TABLE public."project_codes" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_codes" TO "service_role";
GRANT UPDATE ON TABLE public."project_codes" TO "service_role";
GRANT DELETE ON TABLE public."project_delimitation" TO "anon";
GRANT INSERT ON TABLE public."project_delimitation" TO "anon";
GRANT REFERENCES ON TABLE public."project_delimitation" TO "anon";
GRANT SELECT ON TABLE public."project_delimitation" TO "anon";
GRANT TRIGGER ON TABLE public."project_delimitation" TO "anon";
GRANT TRUNCATE ON TABLE public."project_delimitation" TO "anon";
GRANT UPDATE ON TABLE public."project_delimitation" TO "anon";
GRANT DELETE ON TABLE public."project_delimitation" TO "authenticated";
GRANT INSERT ON TABLE public."project_delimitation" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_delimitation" TO "authenticated";
GRANT SELECT ON TABLE public."project_delimitation" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_delimitation" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_delimitation" TO "authenticated";
GRANT UPDATE ON TABLE public."project_delimitation" TO "authenticated";
GRANT DELETE ON TABLE public."project_delimitation" TO "service_role";
GRANT INSERT ON TABLE public."project_delimitation" TO "service_role";
GRANT REFERENCES ON TABLE public."project_delimitation" TO "service_role";
GRANT SELECT ON TABLE public."project_delimitation" TO "service_role";
GRANT TRIGGER ON TABLE public."project_delimitation" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_delimitation" TO "service_role";
GRANT UPDATE ON TABLE public."project_delimitation" TO "service_role";
GRANT DELETE ON TABLE public."project_delimitation_items" TO "anon";
GRANT INSERT ON TABLE public."project_delimitation_items" TO "anon";
GRANT REFERENCES ON TABLE public."project_delimitation_items" TO "anon";
GRANT SELECT ON TABLE public."project_delimitation_items" TO "anon";
GRANT TRIGGER ON TABLE public."project_delimitation_items" TO "anon";
GRANT TRUNCATE ON TABLE public."project_delimitation_items" TO "anon";
GRANT UPDATE ON TABLE public."project_delimitation_items" TO "anon";
GRANT DELETE ON TABLE public."project_delimitation_items" TO "authenticated";
GRANT INSERT ON TABLE public."project_delimitation_items" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_delimitation_items" TO "authenticated";
GRANT SELECT ON TABLE public."project_delimitation_items" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_delimitation_items" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_delimitation_items" TO "authenticated";
GRANT UPDATE ON TABLE public."project_delimitation_items" TO "authenticated";
GRANT DELETE ON TABLE public."project_delimitation_items" TO "service_role";
GRANT INSERT ON TABLE public."project_delimitation_items" TO "service_role";
GRANT REFERENCES ON TABLE public."project_delimitation_items" TO "service_role";
GRANT SELECT ON TABLE public."project_delimitation_items" TO "service_role";
GRANT TRIGGER ON TABLE public."project_delimitation_items" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_delimitation_items" TO "service_role";
GRANT UPDATE ON TABLE public."project_delimitation_items" TO "service_role";
GRANT DELETE ON TABLE public."project_delimitation_version_items" TO "anon";
GRANT INSERT ON TABLE public."project_delimitation_version_items" TO "anon";
GRANT REFERENCES ON TABLE public."project_delimitation_version_items" TO "anon";
GRANT SELECT ON TABLE public."project_delimitation_version_items" TO "anon";
GRANT TRIGGER ON TABLE public."project_delimitation_version_items" TO "anon";
GRANT TRUNCATE ON TABLE public."project_delimitation_version_items" TO "anon";
GRANT UPDATE ON TABLE public."project_delimitation_version_items" TO "anon";
GRANT DELETE ON TABLE public."project_delimitation_version_items" TO "authenticated";
GRANT INSERT ON TABLE public."project_delimitation_version_items" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_delimitation_version_items" TO "authenticated";
GRANT SELECT ON TABLE public."project_delimitation_version_items" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_delimitation_version_items" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_delimitation_version_items" TO "authenticated";
GRANT UPDATE ON TABLE public."project_delimitation_version_items" TO "authenticated";
GRANT DELETE ON TABLE public."project_delimitation_version_items" TO "service_role";
GRANT INSERT ON TABLE public."project_delimitation_version_items" TO "service_role";
GRANT REFERENCES ON TABLE public."project_delimitation_version_items" TO "service_role";
GRANT SELECT ON TABLE public."project_delimitation_version_items" TO "service_role";
GRANT TRIGGER ON TABLE public."project_delimitation_version_items" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_delimitation_version_items" TO "service_role";
GRANT UPDATE ON TABLE public."project_delimitation_version_items" TO "service_role";
GRANT DELETE ON TABLE public."project_delimitation_versions" TO "anon";
GRANT INSERT ON TABLE public."project_delimitation_versions" TO "anon";
GRANT REFERENCES ON TABLE public."project_delimitation_versions" TO "anon";
GRANT SELECT ON TABLE public."project_delimitation_versions" TO "anon";
GRANT TRIGGER ON TABLE public."project_delimitation_versions" TO "anon";
GRANT TRUNCATE ON TABLE public."project_delimitation_versions" TO "anon";
GRANT UPDATE ON TABLE public."project_delimitation_versions" TO "anon";
GRANT DELETE ON TABLE public."project_delimitation_versions" TO "authenticated";
GRANT INSERT ON TABLE public."project_delimitation_versions" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_delimitation_versions" TO "authenticated";
GRANT SELECT ON TABLE public."project_delimitation_versions" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_delimitation_versions" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_delimitation_versions" TO "authenticated";
GRANT UPDATE ON TABLE public."project_delimitation_versions" TO "authenticated";
GRANT DELETE ON TABLE public."project_delimitation_versions" TO "service_role";
GRANT INSERT ON TABLE public."project_delimitation_versions" TO "service_role";
GRANT REFERENCES ON TABLE public."project_delimitation_versions" TO "service_role";
GRANT SELECT ON TABLE public."project_delimitation_versions" TO "service_role";
GRANT TRIGGER ON TABLE public."project_delimitation_versions" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_delimitation_versions" TO "service_role";
GRANT UPDATE ON TABLE public."project_delimitation_versions" TO "service_role";
GRANT DELETE ON TABLE public."project_document_events" TO "anon";
GRANT INSERT ON TABLE public."project_document_events" TO "anon";
GRANT REFERENCES ON TABLE public."project_document_events" TO "anon";
GRANT SELECT ON TABLE public."project_document_events" TO "anon";
GRANT TRIGGER ON TABLE public."project_document_events" TO "anon";
GRANT TRUNCATE ON TABLE public."project_document_events" TO "anon";
GRANT UPDATE ON TABLE public."project_document_events" TO "anon";
GRANT DELETE ON TABLE public."project_document_events" TO "authenticated";
GRANT INSERT ON TABLE public."project_document_events" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_document_events" TO "authenticated";
GRANT SELECT ON TABLE public."project_document_events" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_document_events" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_document_events" TO "authenticated";
GRANT UPDATE ON TABLE public."project_document_events" TO "authenticated";
GRANT DELETE ON TABLE public."project_document_events" TO "service_role";
GRANT INSERT ON TABLE public."project_document_events" TO "service_role";
GRANT REFERENCES ON TABLE public."project_document_events" TO "service_role";
GRANT SELECT ON TABLE public."project_document_events" TO "service_role";
GRANT TRIGGER ON TABLE public."project_document_events" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_document_events" TO "service_role";
GRANT UPDATE ON TABLE public."project_document_events" TO "service_role";
GRANT DELETE ON TABLE public."project_document_segments" TO "anon";
GRANT INSERT ON TABLE public."project_document_segments" TO "anon";
GRANT REFERENCES ON TABLE public."project_document_segments" TO "anon";
GRANT SELECT ON TABLE public."project_document_segments" TO "anon";
GRANT TRIGGER ON TABLE public."project_document_segments" TO "anon";
GRANT TRUNCATE ON TABLE public."project_document_segments" TO "anon";
GRANT UPDATE ON TABLE public."project_document_segments" TO "anon";
GRANT DELETE ON TABLE public."project_document_segments" TO "authenticated";
GRANT INSERT ON TABLE public."project_document_segments" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_document_segments" TO "authenticated";
GRANT SELECT ON TABLE public."project_document_segments" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_document_segments" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_document_segments" TO "authenticated";
GRANT UPDATE ON TABLE public."project_document_segments" TO "authenticated";
GRANT DELETE ON TABLE public."project_document_segments" TO "service_role";
GRANT INSERT ON TABLE public."project_document_segments" TO "service_role";
GRANT REFERENCES ON TABLE public."project_document_segments" TO "service_role";
GRANT SELECT ON TABLE public."project_document_segments" TO "service_role";
GRANT TRIGGER ON TABLE public."project_document_segments" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_document_segments" TO "service_role";
GRANT UPDATE ON TABLE public."project_document_segments" TO "service_role";
GRANT DELETE ON TABLE public."project_document_sources" TO "anon";
GRANT INSERT ON TABLE public."project_document_sources" TO "anon";
GRANT REFERENCES ON TABLE public."project_document_sources" TO "anon";
GRANT SELECT ON TABLE public."project_document_sources" TO "anon";
GRANT TRIGGER ON TABLE public."project_document_sources" TO "anon";
GRANT TRUNCATE ON TABLE public."project_document_sources" TO "anon";
GRANT UPDATE ON TABLE public."project_document_sources" TO "anon";
GRANT DELETE ON TABLE public."project_document_sources" TO "authenticated";
GRANT INSERT ON TABLE public."project_document_sources" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_document_sources" TO "authenticated";
GRANT SELECT ON TABLE public."project_document_sources" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_document_sources" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_document_sources" TO "authenticated";
GRANT UPDATE ON TABLE public."project_document_sources" TO "authenticated";
GRANT DELETE ON TABLE public."project_document_sources" TO "service_role";
GRANT INSERT ON TABLE public."project_document_sources" TO "service_role";
GRANT REFERENCES ON TABLE public."project_document_sources" TO "service_role";
GRANT SELECT ON TABLE public."project_document_sources" TO "service_role";
GRANT TRIGGER ON TABLE public."project_document_sources" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_document_sources" TO "service_role";
GRANT UPDATE ON TABLE public."project_document_sources" TO "service_role";
GRANT DELETE ON TABLE public."project_document_versions" TO "anon";
GRANT INSERT ON TABLE public."project_document_versions" TO "anon";
GRANT REFERENCES ON TABLE public."project_document_versions" TO "anon";
GRANT SELECT ON TABLE public."project_document_versions" TO "anon";
GRANT TRIGGER ON TABLE public."project_document_versions" TO "anon";
GRANT TRUNCATE ON TABLE public."project_document_versions" TO "anon";
GRANT UPDATE ON TABLE public."project_document_versions" TO "anon";
GRANT DELETE ON TABLE public."project_document_versions" TO "authenticated";
GRANT INSERT ON TABLE public."project_document_versions" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_document_versions" TO "authenticated";
GRANT SELECT ON TABLE public."project_document_versions" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_document_versions" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_document_versions" TO "authenticated";
GRANT UPDATE ON TABLE public."project_document_versions" TO "authenticated";
GRANT DELETE ON TABLE public."project_document_versions" TO "service_role";
GRANT INSERT ON TABLE public."project_document_versions" TO "service_role";
GRANT REFERENCES ON TABLE public."project_document_versions" TO "service_role";
GRANT SELECT ON TABLE public."project_document_versions" TO "service_role";
GRANT TRIGGER ON TABLE public."project_document_versions" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_document_versions" TO "service_role";
GRANT UPDATE ON TABLE public."project_document_versions" TO "service_role";
GRANT DELETE ON TABLE public."project_documents" TO "anon";
GRANT INSERT ON TABLE public."project_documents" TO "anon";
GRANT REFERENCES ON TABLE public."project_documents" TO "anon";
GRANT SELECT ON TABLE public."project_documents" TO "anon";
GRANT TRIGGER ON TABLE public."project_documents" TO "anon";
GRANT TRUNCATE ON TABLE public."project_documents" TO "anon";
GRANT UPDATE ON TABLE public."project_documents" TO "anon";
GRANT DELETE ON TABLE public."project_documents" TO "authenticated";
GRANT INSERT ON TABLE public."project_documents" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_documents" TO "authenticated";
GRANT SELECT ON TABLE public."project_documents" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_documents" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_documents" TO "authenticated";
GRANT UPDATE ON TABLE public."project_documents" TO "authenticated";
GRANT DELETE ON TABLE public."project_documents" TO "service_role";
GRANT INSERT ON TABLE public."project_documents" TO "service_role";
GRANT REFERENCES ON TABLE public."project_documents" TO "service_role";
GRANT SELECT ON TABLE public."project_documents" TO "service_role";
GRANT TRIGGER ON TABLE public."project_documents" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_documents" TO "service_role";
GRANT UPDATE ON TABLE public."project_documents" TO "service_role";
GRANT DELETE ON TABLE public."project_insight_links" TO "anon";
GRANT INSERT ON TABLE public."project_insight_links" TO "anon";
GRANT REFERENCES ON TABLE public."project_insight_links" TO "anon";
GRANT SELECT ON TABLE public."project_insight_links" TO "anon";
GRANT TRIGGER ON TABLE public."project_insight_links" TO "anon";
GRANT TRUNCATE ON TABLE public."project_insight_links" TO "anon";
GRANT UPDATE ON TABLE public."project_insight_links" TO "anon";
GRANT DELETE ON TABLE public."project_insight_links" TO "authenticated";
GRANT INSERT ON TABLE public."project_insight_links" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_insight_links" TO "authenticated";
GRANT SELECT ON TABLE public."project_insight_links" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_insight_links" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_insight_links" TO "authenticated";
GRANT UPDATE ON TABLE public."project_insight_links" TO "authenticated";
GRANT DELETE ON TABLE public."project_insight_links" TO "service_role";
GRANT INSERT ON TABLE public."project_insight_links" TO "service_role";
GRANT REFERENCES ON TABLE public."project_insight_links" TO "service_role";
GRANT SELECT ON TABLE public."project_insight_links" TO "service_role";
GRANT TRIGGER ON TABLE public."project_insight_links" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_insight_links" TO "service_role";
GRANT UPDATE ON TABLE public."project_insight_links" TO "service_role";
GRANT DELETE ON TABLE public."project_insights" TO "anon";
GRANT INSERT ON TABLE public."project_insights" TO "anon";
GRANT REFERENCES ON TABLE public."project_insights" TO "anon";
GRANT SELECT ON TABLE public."project_insights" TO "anon";
GRANT TRIGGER ON TABLE public."project_insights" TO "anon";
GRANT TRUNCATE ON TABLE public."project_insights" TO "anon";
GRANT UPDATE ON TABLE public."project_insights" TO "anon";
GRANT DELETE ON TABLE public."project_insights" TO "authenticated";
GRANT INSERT ON TABLE public."project_insights" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_insights" TO "authenticated";
GRANT SELECT ON TABLE public."project_insights" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_insights" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_insights" TO "authenticated";
GRANT UPDATE ON TABLE public."project_insights" TO "authenticated";
GRANT DELETE ON TABLE public."project_insights" TO "service_role";
GRANT INSERT ON TABLE public."project_insights" TO "service_role";
GRANT REFERENCES ON TABLE public."project_insights" TO "service_role";
GRANT SELECT ON TABLE public."project_insights" TO "service_role";
GRANT TRIGGER ON TABLE public."project_insights" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_insights" TO "service_role";
GRANT UPDATE ON TABLE public."project_insights" TO "service_role";
GRANT DELETE ON TABLE public."project_invitations" TO "anon";
GRANT INSERT ON TABLE public."project_invitations" TO "anon";
GRANT REFERENCES ON TABLE public."project_invitations" TO "anon";
GRANT SELECT ON TABLE public."project_invitations" TO "anon";
GRANT TRIGGER ON TABLE public."project_invitations" TO "anon";
GRANT TRUNCATE ON TABLE public."project_invitations" TO "anon";
GRANT UPDATE ON TABLE public."project_invitations" TO "anon";
GRANT DELETE ON TABLE public."project_invitations" TO "authenticated";
GRANT INSERT ON TABLE public."project_invitations" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_invitations" TO "authenticated";
GRANT SELECT ON TABLE public."project_invitations" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_invitations" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_invitations" TO "authenticated";
GRANT UPDATE ON TABLE public."project_invitations" TO "authenticated";
GRANT DELETE ON TABLE public."project_invitations" TO "service_role";
GRANT INSERT ON TABLE public."project_invitations" TO "service_role";
GRANT REFERENCES ON TABLE public."project_invitations" TO "service_role";
GRANT SELECT ON TABLE public."project_invitations" TO "service_role";
GRANT TRIGGER ON TABLE public."project_invitations" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_invitations" TO "service_role";
GRANT UPDATE ON TABLE public."project_invitations" TO "service_role";
GRANT DELETE ON TABLE public."project_members" TO "anon";
GRANT INSERT ON TABLE public."project_members" TO "anon";
GRANT REFERENCES ON TABLE public."project_members" TO "anon";
GRANT SELECT ON TABLE public."project_members" TO "anon";
GRANT TRIGGER ON TABLE public."project_members" TO "anon";
GRANT TRUNCATE ON TABLE public."project_members" TO "anon";
GRANT UPDATE ON TABLE public."project_members" TO "anon";
GRANT DELETE ON TABLE public."project_members" TO "authenticated";
GRANT INSERT ON TABLE public."project_members" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_members" TO "authenticated";
GRANT SELECT ON TABLE public."project_members" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_members" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_members" TO "authenticated";
GRANT UPDATE ON TABLE public."project_members" TO "authenticated";
GRANT DELETE ON TABLE public."project_members" TO "service_role";
GRANT INSERT ON TABLE public."project_members" TO "service_role";
GRANT REFERENCES ON TABLE public."project_members" TO "service_role";
GRANT SELECT ON TABLE public."project_members" TO "service_role";
GRANT TRIGGER ON TABLE public."project_members" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_members" TO "service_role";
GRANT UPDATE ON TABLE public."project_members" TO "service_role";
GRANT DELETE ON TABLE public."project_memo_links" TO "anon";
GRANT INSERT ON TABLE public."project_memo_links" TO "anon";
GRANT REFERENCES ON TABLE public."project_memo_links" TO "anon";
GRANT SELECT ON TABLE public."project_memo_links" TO "anon";
GRANT TRIGGER ON TABLE public."project_memo_links" TO "anon";
GRANT TRUNCATE ON TABLE public."project_memo_links" TO "anon";
GRANT UPDATE ON TABLE public."project_memo_links" TO "anon";
GRANT DELETE ON TABLE public."project_memo_links" TO "authenticated";
GRANT INSERT ON TABLE public."project_memo_links" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_memo_links" TO "authenticated";
GRANT SELECT ON TABLE public."project_memo_links" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_memo_links" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_memo_links" TO "authenticated";
GRANT UPDATE ON TABLE public."project_memo_links" TO "authenticated";
GRANT DELETE ON TABLE public."project_memo_links" TO "service_role";
GRANT INSERT ON TABLE public."project_memo_links" TO "service_role";
GRANT REFERENCES ON TABLE public."project_memo_links" TO "service_role";
GRANT SELECT ON TABLE public."project_memo_links" TO "service_role";
GRANT TRIGGER ON TABLE public."project_memo_links" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_memo_links" TO "service_role";
GRANT UPDATE ON TABLE public."project_memo_links" TO "service_role";
GRANT DELETE ON TABLE public."project_memos" TO "anon";
GRANT INSERT ON TABLE public."project_memos" TO "anon";
GRANT REFERENCES ON TABLE public."project_memos" TO "anon";
GRANT SELECT ON TABLE public."project_memos" TO "anon";
GRANT TRIGGER ON TABLE public."project_memos" TO "anon";
GRANT TRUNCATE ON TABLE public."project_memos" TO "anon";
GRANT UPDATE ON TABLE public."project_memos" TO "anon";
GRANT DELETE ON TABLE public."project_memos" TO "authenticated";
GRANT INSERT ON TABLE public."project_memos" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_memos" TO "authenticated";
GRANT SELECT ON TABLE public."project_memos" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_memos" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_memos" TO "authenticated";
GRANT UPDATE ON TABLE public."project_memos" TO "authenticated";
GRANT DELETE ON TABLE public."project_memos" TO "service_role";
GRANT INSERT ON TABLE public."project_memos" TO "service_role";
GRANT REFERENCES ON TABLE public."project_memos" TO "service_role";
GRANT SELECT ON TABLE public."project_memos" TO "service_role";
GRANT TRIGGER ON TABLE public."project_memos" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_memos" TO "service_role";
GRANT UPDATE ON TABLE public."project_memos" TO "service_role";
GRANT DELETE ON TABLE public."project_participants" TO "anon";
GRANT INSERT ON TABLE public."project_participants" TO "anon";
GRANT REFERENCES ON TABLE public."project_participants" TO "anon";
GRANT SELECT ON TABLE public."project_participants" TO "anon";
GRANT TRIGGER ON TABLE public."project_participants" TO "anon";
GRANT TRUNCATE ON TABLE public."project_participants" TO "anon";
GRANT UPDATE ON TABLE public."project_participants" TO "anon";
GRANT DELETE ON TABLE public."project_participants" TO "authenticated";
GRANT INSERT ON TABLE public."project_participants" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_participants" TO "authenticated";
GRANT SELECT ON TABLE public."project_participants" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_participants" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_participants" TO "authenticated";
GRANT UPDATE ON TABLE public."project_participants" TO "authenticated";
GRANT DELETE ON TABLE public."project_participants" TO "service_role";
GRANT INSERT ON TABLE public."project_participants" TO "service_role";
GRANT REFERENCES ON TABLE public."project_participants" TO "service_role";
GRANT SELECT ON TABLE public."project_participants" TO "service_role";
GRANT TRIGGER ON TABLE public."project_participants" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_participants" TO "service_role";
GRANT UPDATE ON TABLE public."project_participants" TO "service_role";
GRANT DELETE ON TABLE public."project_presence" TO "anon";
GRANT INSERT ON TABLE public."project_presence" TO "anon";
GRANT REFERENCES ON TABLE public."project_presence" TO "anon";
GRANT SELECT ON TABLE public."project_presence" TO "anon";
GRANT TRIGGER ON TABLE public."project_presence" TO "anon";
GRANT TRUNCATE ON TABLE public."project_presence" TO "anon";
GRANT UPDATE ON TABLE public."project_presence" TO "anon";
GRANT DELETE ON TABLE public."project_presence" TO "authenticated";
GRANT INSERT ON TABLE public."project_presence" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_presence" TO "authenticated";
GRANT SELECT ON TABLE public."project_presence" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_presence" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_presence" TO "authenticated";
GRANT UPDATE ON TABLE public."project_presence" TO "authenticated";
GRANT DELETE ON TABLE public."project_presence" TO "service_role";
GRANT INSERT ON TABLE public."project_presence" TO "service_role";
GRANT REFERENCES ON TABLE public."project_presence" TO "service_role";
GRANT SELECT ON TABLE public."project_presence" TO "service_role";
GRANT TRIGGER ON TABLE public."project_presence" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_presence" TO "service_role";
GRANT UPDATE ON TABLE public."project_presence" TO "service_role";
GRANT DELETE ON TABLE public."project_research_design" TO "anon";
GRANT INSERT ON TABLE public."project_research_design" TO "anon";
GRANT REFERENCES ON TABLE public."project_research_design" TO "anon";
GRANT SELECT ON TABLE public."project_research_design" TO "anon";
GRANT TRIGGER ON TABLE public."project_research_design" TO "anon";
GRANT TRUNCATE ON TABLE public."project_research_design" TO "anon";
GRANT UPDATE ON TABLE public."project_research_design" TO "anon";
GRANT DELETE ON TABLE public."project_research_design" TO "authenticated";
GRANT INSERT ON TABLE public."project_research_design" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_research_design" TO "authenticated";
GRANT SELECT ON TABLE public."project_research_design" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_research_design" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_research_design" TO "authenticated";
GRANT UPDATE ON TABLE public."project_research_design" TO "authenticated";
GRANT DELETE ON TABLE public."project_research_design" TO "service_role";
GRANT INSERT ON TABLE public."project_research_design" TO "service_role";
GRANT REFERENCES ON TABLE public."project_research_design" TO "service_role";
GRANT SELECT ON TABLE public."project_research_design" TO "service_role";
GRANT TRIGGER ON TABLE public."project_research_design" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_research_design" TO "service_role";
GRANT UPDATE ON TABLE public."project_research_design" TO "service_role";
GRANT DELETE ON TABLE public."project_research_design_version_items" TO "anon";
GRANT INSERT ON TABLE public."project_research_design_version_items" TO "anon";
GRANT REFERENCES ON TABLE public."project_research_design_version_items" TO "anon";
GRANT SELECT ON TABLE public."project_research_design_version_items" TO "anon";
GRANT TRIGGER ON TABLE public."project_research_design_version_items" TO "anon";
GRANT TRUNCATE ON TABLE public."project_research_design_version_items" TO "anon";
GRANT UPDATE ON TABLE public."project_research_design_version_items" TO "anon";
GRANT DELETE ON TABLE public."project_research_design_version_items" TO "authenticated";
GRANT INSERT ON TABLE public."project_research_design_version_items" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_research_design_version_items" TO "authenticated";
GRANT SELECT ON TABLE public."project_research_design_version_items" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_research_design_version_items" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_research_design_version_items" TO "authenticated";
GRANT UPDATE ON TABLE public."project_research_design_version_items" TO "authenticated";
GRANT DELETE ON TABLE public."project_research_design_version_items" TO "service_role";
GRANT INSERT ON TABLE public."project_research_design_version_items" TO "service_role";
GRANT REFERENCES ON TABLE public."project_research_design_version_items" TO "service_role";
GRANT SELECT ON TABLE public."project_research_design_version_items" TO "service_role";
GRANT TRIGGER ON TABLE public."project_research_design_version_items" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_research_design_version_items" TO "service_role";
GRANT UPDATE ON TABLE public."project_research_design_version_items" TO "service_role";
GRANT DELETE ON TABLE public."project_research_design_versions" TO "anon";
GRANT INSERT ON TABLE public."project_research_design_versions" TO "anon";
GRANT REFERENCES ON TABLE public."project_research_design_versions" TO "anon";
GRANT SELECT ON TABLE public."project_research_design_versions" TO "anon";
GRANT TRIGGER ON TABLE public."project_research_design_versions" TO "anon";
GRANT TRUNCATE ON TABLE public."project_research_design_versions" TO "anon";
GRANT UPDATE ON TABLE public."project_research_design_versions" TO "anon";
GRANT DELETE ON TABLE public."project_research_design_versions" TO "authenticated";
GRANT INSERT ON TABLE public."project_research_design_versions" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_research_design_versions" TO "authenticated";
GRANT SELECT ON TABLE public."project_research_design_versions" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_research_design_versions" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_research_design_versions" TO "authenticated";
GRANT UPDATE ON TABLE public."project_research_design_versions" TO "authenticated";
GRANT DELETE ON TABLE public."project_research_design_versions" TO "service_role";
GRANT INSERT ON TABLE public."project_research_design_versions" TO "service_role";
GRANT REFERENCES ON TABLE public."project_research_design_versions" TO "service_role";
GRANT SELECT ON TABLE public."project_research_design_versions" TO "service_role";
GRANT TRIGGER ON TABLE public."project_research_design_versions" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_research_design_versions" TO "service_role";
GRANT UPDATE ON TABLE public."project_research_design_versions" TO "service_role";
GRANT DELETE ON TABLE public."project_sample_collection_techniques" TO "anon";
GRANT INSERT ON TABLE public."project_sample_collection_techniques" TO "anon";
GRANT REFERENCES ON TABLE public."project_sample_collection_techniques" TO "anon";
GRANT SELECT ON TABLE public."project_sample_collection_techniques" TO "anon";
GRANT TRIGGER ON TABLE public."project_sample_collection_techniques" TO "anon";
GRANT TRUNCATE ON TABLE public."project_sample_collection_techniques" TO "anon";
GRANT UPDATE ON TABLE public."project_sample_collection_techniques" TO "anon";
GRANT DELETE ON TABLE public."project_sample_collection_techniques" TO "authenticated";
GRANT INSERT ON TABLE public."project_sample_collection_techniques" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_sample_collection_techniques" TO "authenticated";
GRANT SELECT ON TABLE public."project_sample_collection_techniques" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_sample_collection_techniques" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_sample_collection_techniques" TO "authenticated";
GRANT UPDATE ON TABLE public."project_sample_collection_techniques" TO "authenticated";
GRANT DELETE ON TABLE public."project_sample_collection_techniques" TO "service_role";
GRANT INSERT ON TABLE public."project_sample_collection_techniques" TO "service_role";
GRANT REFERENCES ON TABLE public."project_sample_collection_techniques" TO "service_role";
GRANT SELECT ON TABLE public."project_sample_collection_techniques" TO "service_role";
GRANT TRIGGER ON TABLE public."project_sample_collection_techniques" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_sample_collection_techniques" TO "service_role";
GRANT UPDATE ON TABLE public."project_sample_collection_techniques" TO "service_role";
GRANT DELETE ON TABLE public."project_sample_config" TO "anon";
GRANT INSERT ON TABLE public."project_sample_config" TO "anon";
GRANT REFERENCES ON TABLE public."project_sample_config" TO "anon";
GRANT SELECT ON TABLE public."project_sample_config" TO "anon";
GRANT TRIGGER ON TABLE public."project_sample_config" TO "anon";
GRANT TRUNCATE ON TABLE public."project_sample_config" TO "anon";
GRANT UPDATE ON TABLE public."project_sample_config" TO "anon";
GRANT DELETE ON TABLE public."project_sample_config" TO "authenticated";
GRANT INSERT ON TABLE public."project_sample_config" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_sample_config" TO "authenticated";
GRANT SELECT ON TABLE public."project_sample_config" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_sample_config" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_sample_config" TO "authenticated";
GRANT UPDATE ON TABLE public."project_sample_config" TO "authenticated";
GRANT DELETE ON TABLE public."project_sample_config" TO "service_role";
GRANT INSERT ON TABLE public."project_sample_config" TO "service_role";
GRANT REFERENCES ON TABLE public."project_sample_config" TO "service_role";
GRANT SELECT ON TABLE public."project_sample_config" TO "service_role";
GRANT TRIGGER ON TABLE public."project_sample_config" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_sample_config" TO "service_role";
GRANT UPDATE ON TABLE public."project_sample_config" TO "service_role";
GRANT DELETE ON TABLE public."project_sample_config_version_techniques" TO "anon";
GRANT INSERT ON TABLE public."project_sample_config_version_techniques" TO "anon";
GRANT REFERENCES ON TABLE public."project_sample_config_version_techniques" TO "anon";
GRANT SELECT ON TABLE public."project_sample_config_version_techniques" TO "anon";
GRANT TRIGGER ON TABLE public."project_sample_config_version_techniques" TO "anon";
GRANT TRUNCATE ON TABLE public."project_sample_config_version_techniques" TO "anon";
GRANT UPDATE ON TABLE public."project_sample_config_version_techniques" TO "anon";
GRANT DELETE ON TABLE public."project_sample_config_version_techniques" TO "authenticated";
GRANT INSERT ON TABLE public."project_sample_config_version_techniques" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_sample_config_version_techniques" TO "authenticated";
GRANT SELECT ON TABLE public."project_sample_config_version_techniques" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_sample_config_version_techniques" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_sample_config_version_techniques" TO "authenticated";
GRANT UPDATE ON TABLE public."project_sample_config_version_techniques" TO "authenticated";
GRANT DELETE ON TABLE public."project_sample_config_version_techniques" TO "service_role";
GRANT INSERT ON TABLE public."project_sample_config_version_techniques" TO "service_role";
GRANT REFERENCES ON TABLE public."project_sample_config_version_techniques" TO "service_role";
GRANT SELECT ON TABLE public."project_sample_config_version_techniques" TO "service_role";
GRANT TRIGGER ON TABLE public."project_sample_config_version_techniques" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_sample_config_version_techniques" TO "service_role";
GRANT UPDATE ON TABLE public."project_sample_config_version_techniques" TO "service_role";
GRANT DELETE ON TABLE public."project_sample_config_versions" TO "anon";
GRANT INSERT ON TABLE public."project_sample_config_versions" TO "anon";
GRANT REFERENCES ON TABLE public."project_sample_config_versions" TO "anon";
GRANT SELECT ON TABLE public."project_sample_config_versions" TO "anon";
GRANT TRIGGER ON TABLE public."project_sample_config_versions" TO "anon";
GRANT TRUNCATE ON TABLE public."project_sample_config_versions" TO "anon";
GRANT UPDATE ON TABLE public."project_sample_config_versions" TO "anon";
GRANT DELETE ON TABLE public."project_sample_config_versions" TO "authenticated";
GRANT INSERT ON TABLE public."project_sample_config_versions" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_sample_config_versions" TO "authenticated";
GRANT SELECT ON TABLE public."project_sample_config_versions" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_sample_config_versions" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_sample_config_versions" TO "authenticated";
GRANT UPDATE ON TABLE public."project_sample_config_versions" TO "authenticated";
GRANT DELETE ON TABLE public."project_sample_config_versions" TO "service_role";
GRANT INSERT ON TABLE public."project_sample_config_versions" TO "service_role";
GRANT REFERENCES ON TABLE public."project_sample_config_versions" TO "service_role";
GRANT SELECT ON TABLE public."project_sample_config_versions" TO "service_role";
GRANT TRIGGER ON TABLE public."project_sample_config_versions" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_sample_config_versions" TO "service_role";
GRANT UPDATE ON TABLE public."project_sample_config_versions" TO "service_role";
GRANT DELETE ON TABLE public."project_segment_codes" TO "anon";
GRANT INSERT ON TABLE public."project_segment_codes" TO "anon";
GRANT REFERENCES ON TABLE public."project_segment_codes" TO "anon";
GRANT SELECT ON TABLE public."project_segment_codes" TO "anon";
GRANT TRIGGER ON TABLE public."project_segment_codes" TO "anon";
GRANT TRUNCATE ON TABLE public."project_segment_codes" TO "anon";
GRANT UPDATE ON TABLE public."project_segment_codes" TO "anon";
GRANT DELETE ON TABLE public."project_segment_codes" TO "authenticated";
GRANT INSERT ON TABLE public."project_segment_codes" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_segment_codes" TO "authenticated";
GRANT SELECT ON TABLE public."project_segment_codes" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_segment_codes" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_segment_codes" TO "authenticated";
GRANT UPDATE ON TABLE public."project_segment_codes" TO "authenticated";
GRANT DELETE ON TABLE public."project_segment_codes" TO "service_role";
GRANT INSERT ON TABLE public."project_segment_codes" TO "service_role";
GRANT REFERENCES ON TABLE public."project_segment_codes" TO "service_role";
GRANT SELECT ON TABLE public."project_segment_codes" TO "service_role";
GRANT TRIGGER ON TABLE public."project_segment_codes" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_segment_codes" TO "service_role";
GRANT UPDATE ON TABLE public."project_segment_codes" TO "service_role";
GRANT DELETE ON TABLE public."project_specific_objectives" TO "anon";
GRANT INSERT ON TABLE public."project_specific_objectives" TO "anon";
GRANT REFERENCES ON TABLE public."project_specific_objectives" TO "anon";
GRANT SELECT ON TABLE public."project_specific_objectives" TO "anon";
GRANT TRIGGER ON TABLE public."project_specific_objectives" TO "anon";
GRANT TRUNCATE ON TABLE public."project_specific_objectives" TO "anon";
GRANT UPDATE ON TABLE public."project_specific_objectives" TO "anon";
GRANT DELETE ON TABLE public."project_specific_objectives" TO "authenticated";
GRANT INSERT ON TABLE public."project_specific_objectives" TO "authenticated";
GRANT REFERENCES ON TABLE public."project_specific_objectives" TO "authenticated";
GRANT SELECT ON TABLE public."project_specific_objectives" TO "authenticated";
GRANT TRIGGER ON TABLE public."project_specific_objectives" TO "authenticated";
GRANT TRUNCATE ON TABLE public."project_specific_objectives" TO "authenticated";
GRANT UPDATE ON TABLE public."project_specific_objectives" TO "authenticated";
GRANT DELETE ON TABLE public."project_specific_objectives" TO "service_role";
GRANT INSERT ON TABLE public."project_specific_objectives" TO "service_role";
GRANT REFERENCES ON TABLE public."project_specific_objectives" TO "service_role";
GRANT SELECT ON TABLE public."project_specific_objectives" TO "service_role";
GRANT TRIGGER ON TABLE public."project_specific_objectives" TO "service_role";
GRANT TRUNCATE ON TABLE public."project_specific_objectives" TO "service_role";
GRANT UPDATE ON TABLE public."project_specific_objectives" TO "service_role";
GRANT DELETE ON TABLE public."projects" TO "anon";
GRANT INSERT ON TABLE public."projects" TO "anon";
GRANT REFERENCES ON TABLE public."projects" TO "anon";
GRANT SELECT ON TABLE public."projects" TO "anon";
GRANT TRIGGER ON TABLE public."projects" TO "anon";
GRANT TRUNCATE ON TABLE public."projects" TO "anon";
GRANT UPDATE ON TABLE public."projects" TO "anon";
GRANT DELETE ON TABLE public."projects" TO "authenticated";
GRANT INSERT ON TABLE public."projects" TO "authenticated";
GRANT REFERENCES ON TABLE public."projects" TO "authenticated";
GRANT SELECT ON TABLE public."projects" TO "authenticated";
GRANT TRIGGER ON TABLE public."projects" TO "authenticated";
GRANT TRUNCATE ON TABLE public."projects" TO "authenticated";
GRANT UPDATE ON TABLE public."projects" TO "authenticated";
GRANT DELETE ON TABLE public."projects" TO "service_role";
GRANT INSERT ON TABLE public."projects" TO "service_role";
GRANT REFERENCES ON TABLE public."projects" TO "service_role";
GRANT SELECT ON TABLE public."projects" TO "service_role";
GRANT TRIGGER ON TABLE public."projects" TO "service_role";
GRANT TRUNCATE ON TABLE public."projects" TO "service_role";
GRANT UPDATE ON TABLE public."projects" TO "service_role";
GRANT DELETE ON TABLE public."sample_collection_technique_options" TO "anon";
GRANT INSERT ON TABLE public."sample_collection_technique_options" TO "anon";
GRANT REFERENCES ON TABLE public."sample_collection_technique_options" TO "anon";
GRANT SELECT ON TABLE public."sample_collection_technique_options" TO "anon";
GRANT TRIGGER ON TABLE public."sample_collection_technique_options" TO "anon";
GRANT TRUNCATE ON TABLE public."sample_collection_technique_options" TO "anon";
GRANT UPDATE ON TABLE public."sample_collection_technique_options" TO "anon";
GRANT DELETE ON TABLE public."sample_collection_technique_options" TO "authenticated";
GRANT INSERT ON TABLE public."sample_collection_technique_options" TO "authenticated";
GRANT REFERENCES ON TABLE public."sample_collection_technique_options" TO "authenticated";
GRANT SELECT ON TABLE public."sample_collection_technique_options" TO "authenticated";
GRANT TRIGGER ON TABLE public."sample_collection_technique_options" TO "authenticated";
GRANT TRUNCATE ON TABLE public."sample_collection_technique_options" TO "authenticated";
GRANT UPDATE ON TABLE public."sample_collection_technique_options" TO "authenticated";
GRANT DELETE ON TABLE public."sample_collection_technique_options" TO "service_role";
GRANT INSERT ON TABLE public."sample_collection_technique_options" TO "service_role";
GRANT REFERENCES ON TABLE public."sample_collection_technique_options" TO "service_role";
GRANT SELECT ON TABLE public."sample_collection_technique_options" TO "service_role";
GRANT TRIGGER ON TABLE public."sample_collection_technique_options" TO "service_role";
GRANT TRUNCATE ON TABLE public."sample_collection_technique_options" TO "service_role";
GRANT UPDATE ON TABLE public."sample_collection_technique_options" TO "service_role";
GRANT DELETE ON TABLE public."sample_main_approach_options" TO "anon";
GRANT INSERT ON TABLE public."sample_main_approach_options" TO "anon";
GRANT REFERENCES ON TABLE public."sample_main_approach_options" TO "anon";
GRANT SELECT ON TABLE public."sample_main_approach_options" TO "anon";
GRANT TRIGGER ON TABLE public."sample_main_approach_options" TO "anon";
GRANT TRUNCATE ON TABLE public."sample_main_approach_options" TO "anon";
GRANT UPDATE ON TABLE public."sample_main_approach_options" TO "anon";
GRANT DELETE ON TABLE public."sample_main_approach_options" TO "authenticated";
GRANT INSERT ON TABLE public."sample_main_approach_options" TO "authenticated";
GRANT REFERENCES ON TABLE public."sample_main_approach_options" TO "authenticated";
GRANT SELECT ON TABLE public."sample_main_approach_options" TO "authenticated";
GRANT TRIGGER ON TABLE public."sample_main_approach_options" TO "authenticated";
GRANT TRUNCATE ON TABLE public."sample_main_approach_options" TO "authenticated";
GRANT UPDATE ON TABLE public."sample_main_approach_options" TO "authenticated";
GRANT DELETE ON TABLE public."sample_main_approach_options" TO "service_role";
GRANT INSERT ON TABLE public."sample_main_approach_options" TO "service_role";
GRANT REFERENCES ON TABLE public."sample_main_approach_options" TO "service_role";
GRANT SELECT ON TABLE public."sample_main_approach_options" TO "service_role";
GRANT TRIGGER ON TABLE public."sample_main_approach_options" TO "service_role";
GRANT TRUNCATE ON TABLE public."sample_main_approach_options" TO "service_role";
GRANT UPDATE ON TABLE public."sample_main_approach_options" TO "service_role";
GRANT DELETE ON TABLE public."sample_scope_options" TO "anon";
GRANT INSERT ON TABLE public."sample_scope_options" TO "anon";
GRANT REFERENCES ON TABLE public."sample_scope_options" TO "anon";
GRANT SELECT ON TABLE public."sample_scope_options" TO "anon";
GRANT TRIGGER ON TABLE public."sample_scope_options" TO "anon";
GRANT TRUNCATE ON TABLE public."sample_scope_options" TO "anon";
GRANT UPDATE ON TABLE public."sample_scope_options" TO "anon";
GRANT DELETE ON TABLE public."sample_scope_options" TO "authenticated";
GRANT INSERT ON TABLE public."sample_scope_options" TO "authenticated";
GRANT REFERENCES ON TABLE public."sample_scope_options" TO "authenticated";
GRANT SELECT ON TABLE public."sample_scope_options" TO "authenticated";
GRANT TRIGGER ON TABLE public."sample_scope_options" TO "authenticated";
GRANT TRUNCATE ON TABLE public."sample_scope_options" TO "authenticated";
GRANT UPDATE ON TABLE public."sample_scope_options" TO "authenticated";
GRANT DELETE ON TABLE public."sample_scope_options" TO "service_role";
GRANT INSERT ON TABLE public."sample_scope_options" TO "service_role";
GRANT REFERENCES ON TABLE public."sample_scope_options" TO "service_role";
GRANT SELECT ON TABLE public."sample_scope_options" TO "service_role";
GRANT TRIGGER ON TABLE public."sample_scope_options" TO "service_role";
GRANT TRUNCATE ON TABLE public."sample_scope_options" TO "service_role";
GRANT UPDATE ON TABLE public."sample_scope_options" TO "service_role";
INSERT INTO public."sample_collection_technique_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('semi_structured_interview', 'Entrevista semiestructurada', 'Guía flexible de preguntas con posibilidad de profundizar.', true, 1, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_collection_technique_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('in_depth_interview', 'Entrevista a profundidad', 'Exploración detallada de experiencias y significados.', true, 2, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_collection_technique_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('focus_group', 'Grupo focal', 'Discusión guiada con varios participantes.', true, 3, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_collection_technique_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('participant_observation', 'Observación participante', 'Observación con involucramiento directo en el contexto.', true, 4, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_collection_technique_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('non_participant_observation', 'Observación no participante', 'Observación del contexto sin participación activa.', true, 5, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_collection_technique_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('field_diary', 'Diario de campo', 'Registro sistemático de observaciones y reflexiones de campo.', true, 6, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_collection_technique_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('document_analysis', 'Análisis documental', 'Revisión de documentos, archivos o materiales existentes.', true, 7, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_collection_technique_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('life_history', 'Historia de vida', 'Reconstrucción narrativa de trayectorias y experiencias.', true, 8, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_main_approach_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('ethnographic', 'Etnográfico', 'Comprensión cultural y contextual desde el trabajo de campo.', true, 1, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_main_approach_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('phenomenological', 'Fenomenológico', 'Comprensión de experiencias vividas y significados.', true, 2, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_main_approach_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('grounded_theory', 'Teoría fundamentada', 'Construcción de teoría a partir de los datos.', true, 3, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_main_approach_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('case_study', 'Estudio de caso', 'Análisis profundo de un caso o unidad específica.', true, 4, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_main_approach_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('narrative', 'Narrativo', 'Análisis de relatos, trayectorias y experiencias.', true, 5, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_main_approach_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('action_research', 'Investigación-acción', 'Comprensión e intervención sobre un contexto.', true, 6, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_scope_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('exploratory', 'Exploratorio', 'Aproximación a un fenómeno poco estudiado o poco delimitado.', true, 1, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_scope_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('descriptive', 'Descriptivo', 'Caracterización del fenómeno en su contexto.', true, 2, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_scope_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('interpretive', 'Interpretativo', 'Comprensión de significados y sentidos sociales.', true, 3, '2026-04-13T20:42:01.971765+00:00');
INSERT INTO public."sample_scope_options" ("code", "label", "description", "is_active", "position", "created_at") VALUES ('comparative', 'Comparativo', 'Contraste entre grupos, contextos o casos.', true, 4, '2026-04-13T20:42:01.971765+00:00');
-- Preserve original function execution privileges.
REVOKE ALL ON FUNCTION public."accept_project_invitation_atomic"(p_token text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."add_project_owner_member"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."analysis_has_project_role"(pid uuid, allowed_roles text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."analysis_is_project_member"(pid uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."approx_word_count"(p_text text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."coordinate_workflow_write"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."create_project_code_safe"(p_project_id uuid, p_name_b64 text, p_description_b64 text, p_definition_b64 text, p_inclusion_b64 text, p_exclusion_b64 text, p_parent_code_id uuid, p_color text, p_position integer, p_metadata jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."create_project_sample_config_snapshot"(p_project_id uuid, p_label text, p_trigger_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."debug_request_context"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."find_project_code_by_name_safe"(p_project_id uuid, p_name_b64 text, p_exclude_code_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."get_project_analysis_overview"(input_project_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."guard_code_soft_delete_dependencies"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."guard_document_content_with_segments"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."handle_new_user"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."has_project_role"(pid uuid, roles text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."is_project_member"(pid uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."is_project_owner"(pid uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."is_project_owner_or_editor"(pid uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."prevent_profile_role_change"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."prevent_project_code_cycle"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."project_has_member_email_safe"(p_project_id uuid, p_email_b64 text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."project_member_profiles_safe"(p_project_id uuid, p_user_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."project_role"(pid uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."reject_duplicate_workflow_snapshot"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."remove_project_member_atomic"(p_project_id uuid, p_user_id uuid, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."restore_workflow_version"(p_workflow text, p_project_id uuid, p_version_id uuid, p_actor_id uuid, p_expected_revision bigint, p_create_backup boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."save_workflow_snapshot"(p_workflow text, p_project_id uuid, p_actor_id uuid, p_snapshot jsonb, p_children jsonb, p_label text, p_trigger_type text, p_content_hash text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."search_project_codes_safe"(p_project_id uuid, p_search_b64 text, p_include_deleted boolean, p_parent_code_id uuid, p_limit integer, p_offset integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."seed_default_document_sources_after_project_insert"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."seed_default_document_sources_for_project"(pid uuid, user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."set_created_by_field"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."set_project_document_derived_fields"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."set_project_document_segment_fields"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."set_project_document_version_fields"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."set_project_participant_revision"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."set_project_row_audit_fields"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."set_updated_at"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."set_updated_at_and_revision"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."tg_sample_set_audit_fields_and_revision"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."utf16_normalized_length"(input_text text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."utf16_normalized_slice"(input_text text, start_unit integer, end_unit integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."validate_project_document_references"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."validate_project_document_segment"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."workflow_identity"(workflow text, snapshot jsonb, children jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."workflow_lock_key"(workflow text, project uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."workflow_spec"(workflow text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."workflow_trim"(value text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."workflow_version_data"(workflow text, project uuid, version uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."accept_project_invitation_atomic"(p_token text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."accept_project_invitation_atomic"(p_token text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."add_project_owner_member"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."add_project_owner_member"() TO "anon";
GRANT EXECUTE ON FUNCTION public."add_project_owner_member"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."add_project_owner_member"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."analysis_has_project_role"(pid uuid, allowed_roles text[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."analysis_has_project_role"(pid uuid, allowed_roles text[]) TO "anon";
GRANT EXECUTE ON FUNCTION public."analysis_has_project_role"(pid uuid, allowed_roles text[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."analysis_has_project_role"(pid uuid, allowed_roles text[]) TO "service_role";
GRANT EXECUTE ON FUNCTION public."analysis_is_project_member"(pid uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."analysis_is_project_member"(pid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."analysis_is_project_member"(pid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."analysis_is_project_member"(pid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."approx_word_count"(p_text text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."approx_word_count"(p_text text) TO "anon";
GRANT EXECUTE ON FUNCTION public."approx_word_count"(p_text text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."approx_word_count"(p_text text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."coordinate_workflow_write"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."coordinate_workflow_write"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."create_project_code_safe"(p_project_id uuid, p_name_b64 text, p_description_b64 text, p_definition_b64 text, p_inclusion_b64 text, p_exclusion_b64 text, p_parent_code_id uuid, p_color text, p_position integer, p_metadata jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_project_code_safe"(p_project_id uuid, p_name_b64 text, p_description_b64 text, p_definition_b64 text, p_inclusion_b64 text, p_exclusion_b64 text, p_parent_code_id uuid, p_color text, p_position integer, p_metadata jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION public."create_project_sample_config_snapshot"(p_project_id uuid, p_label text, p_trigger_type text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."create_project_sample_config_snapshot"(p_project_id uuid, p_label text, p_trigger_type text) TO "anon";
GRANT EXECUTE ON FUNCTION public."create_project_sample_config_snapshot"(p_project_id uuid, p_label text, p_trigger_type text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_project_sample_config_snapshot"(p_project_id uuid, p_label text, p_trigger_type text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."debug_request_context"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."debug_request_context"() TO "anon";
GRANT EXECUTE ON FUNCTION public."debug_request_context"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."debug_request_context"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."find_project_code_by_name_safe"(p_project_id uuid, p_name_b64 text, p_exclude_code_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."find_project_code_by_name_safe"(p_project_id uuid, p_name_b64 text, p_exclude_code_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."get_project_analysis_overview"(input_project_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_project_analysis_overview"(input_project_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_project_analysis_overview"(input_project_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_project_analysis_overview"(input_project_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."guard_code_soft_delete_dependencies"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."guard_code_soft_delete_dependencies"() TO "anon";
GRANT EXECUTE ON FUNCTION public."guard_code_soft_delete_dependencies"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."guard_code_soft_delete_dependencies"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."guard_document_content_with_segments"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."guard_document_content_with_segments"() TO "anon";
GRANT EXECUTE ON FUNCTION public."guard_document_content_with_segments"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."guard_document_content_with_segments"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "anon";
GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."has_project_role"(pid uuid, roles text[]) TO "anon";
GRANT EXECUTE ON FUNCTION public."has_project_role"(pid uuid, roles text[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."has_project_role"(pid uuid, roles text[]) TO "service_role";
GRANT EXECUTE ON FUNCTION public."is_project_member"(pid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_project_member"(pid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_project_member"(pid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."is_project_owner"(pid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_project_owner"(pid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_project_owner"(pid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."is_project_owner_or_editor"(pid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_project_owner_or_editor"(pid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_project_owner_or_editor"(pid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."prevent_profile_role_change"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."prevent_project_code_cycle"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."prevent_project_code_cycle"() TO "anon";
GRANT EXECUTE ON FUNCTION public."prevent_project_code_cycle"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."prevent_project_code_cycle"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."project_has_member_email_safe"(p_project_id uuid, p_email_b64 text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."project_has_member_email_safe"(p_project_id uuid, p_email_b64 text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."project_member_profiles_safe"(p_project_id uuid, p_user_ids uuid[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."project_member_profiles_safe"(p_project_id uuid, p_user_ids uuid[]) TO "service_role";
GRANT EXECUTE ON FUNCTION public."project_role"(pid uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."project_role"(pid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."project_role"(pid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."project_role"(pid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."reject_duplicate_workflow_snapshot"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."reject_duplicate_workflow_snapshot"() TO "anon";
GRANT EXECUTE ON FUNCTION public."reject_duplicate_workflow_snapshot"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."reject_duplicate_workflow_snapshot"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."remove_project_member_atomic"(p_project_id uuid, p_user_id uuid, p_actor_user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."remove_project_member_atomic"(p_project_id uuid, p_user_id uuid, p_actor_user_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."restore_workflow_version"(p_workflow text, p_project_id uuid, p_version_id uuid, p_actor_id uuid, p_expected_revision bigint, p_create_backup boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."restore_workflow_version"(p_workflow text, p_project_id uuid, p_version_id uuid, p_actor_id uuid, p_expected_revision bigint, p_create_backup boolean) TO "service_role";
GRANT EXECUTE ON FUNCTION public."save_workflow_snapshot"(p_workflow text, p_project_id uuid, p_actor_id uuid, p_snapshot jsonb, p_children jsonb, p_label text, p_trigger_type text, p_content_hash text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."save_workflow_snapshot"(p_workflow text, p_project_id uuid, p_actor_id uuid, p_snapshot jsonb, p_children jsonb, p_label text, p_trigger_type text, p_content_hash text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."search_project_codes_safe"(p_project_id uuid, p_search_b64 text, p_include_deleted boolean, p_parent_code_id uuid, p_limit integer, p_offset integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."search_project_codes_safe"(p_project_id uuid, p_search_b64 text, p_include_deleted boolean, p_parent_code_id uuid, p_limit integer, p_offset integer) TO "service_role";
GRANT EXECUTE ON FUNCTION public."seed_default_document_sources_after_project_insert"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."seed_default_document_sources_after_project_insert"() TO "anon";
GRANT EXECUTE ON FUNCTION public."seed_default_document_sources_after_project_insert"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."seed_default_document_sources_after_project_insert"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."seed_default_document_sources_for_project"(pid uuid, user_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."seed_default_document_sources_for_project"(pid uuid, user_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."seed_default_document_sources_for_project"(pid uuid, user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."seed_default_document_sources_for_project"(pid uuid, user_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_created_by_field"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_created_by_field"() TO "anon";
GRANT EXECUTE ON FUNCTION public."set_created_by_field"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_created_by_field"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_project_document_derived_fields"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_project_document_derived_fields"() TO "anon";
GRANT EXECUTE ON FUNCTION public."set_project_document_derived_fields"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_project_document_derived_fields"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_project_document_segment_fields"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_project_document_segment_fields"() TO "anon";
GRANT EXECUTE ON FUNCTION public."set_project_document_segment_fields"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_project_document_segment_fields"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_project_document_version_fields"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_project_document_version_fields"() TO "anon";
GRANT EXECUTE ON FUNCTION public."set_project_document_version_fields"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_project_document_version_fields"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_project_participant_revision"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_project_row_audit_fields"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_project_row_audit_fields"() TO "anon";
GRANT EXECUTE ON FUNCTION public."set_project_row_audit_fields"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_project_row_audit_fields"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_updated_at_and_revision"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_updated_at_and_revision"() TO "anon";
GRANT EXECUTE ON FUNCTION public."set_updated_at_and_revision"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_updated_at_and_revision"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."tg_sample_set_audit_fields_and_revision"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."tg_sample_set_audit_fields_and_revision"() TO "anon";
GRANT EXECUTE ON FUNCTION public."tg_sample_set_audit_fields_and_revision"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."tg_sample_set_audit_fields_and_revision"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."utf16_normalized_length"(input_text text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."utf16_normalized_length"(input_text text) TO "anon";
GRANT EXECUTE ON FUNCTION public."utf16_normalized_length"(input_text text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."utf16_normalized_length"(input_text text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."utf16_normalized_slice"(input_text text, start_unit integer, end_unit integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."utf16_normalized_slice"(input_text text, start_unit integer, end_unit integer) TO "anon";
GRANT EXECUTE ON FUNCTION public."utf16_normalized_slice"(input_text text, start_unit integer, end_unit integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."utf16_normalized_slice"(input_text text, start_unit integer, end_unit integer) TO "service_role";
GRANT EXECUTE ON FUNCTION public."validate_project_document_references"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."validate_project_document_references"() TO "anon";
GRANT EXECUTE ON FUNCTION public."validate_project_document_references"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."validate_project_document_references"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."validate_project_document_segment"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."validate_project_document_segment"() TO "anon";
GRANT EXECUTE ON FUNCTION public."validate_project_document_segment"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."validate_project_document_segment"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."workflow_identity"(workflow text, snapshot jsonb, children jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."workflow_identity"(workflow text, snapshot jsonb, children jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION public."workflow_lock_key"(workflow text, project uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."workflow_lock_key"(workflow text, project uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."workflow_spec"(workflow text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."workflow_spec"(workflow text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."workflow_trim"(value text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."workflow_trim"(value text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."workflow_version_data"(workflow text, project uuid, version uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."workflow_version_data"(workflow text, project uuid, version uuid) TO "service_role";
COMMIT;
