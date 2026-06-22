-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'CONTENT_ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TOUCH', 'PING', 'COMMENT', 'BOND', 'SYSTEM', 'SUBSCRIPTION', 'DM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "google_uid" TEXT NOT NULL,
    "pixel_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "avatar_type" TEXT NOT NULL DEFAULT 'svg',
    "avatar_svg_id" TEXT,
    "avatar_image_url" TEXT,
    "current_aura" TEXT NOT NULL DEFAULT 'GLOW',
    "activity_score" BIGINT NOT NULL DEFAULT 0,
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "is_shadow_banned" BOOLEAN NOT NULL DEFAULT false,
    "shadow_ban_reason" TEXT,
    "status_message" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stardust_balance" INTEGER NOT NULL DEFAULT 0,
    "supernova_tier" TEXT,
    "supernova_expires_at" TIMESTAMPTZ(6),
    "equipped_title" TEXT,
    "space_id_stage" INTEGER NOT NULL DEFAULT 1,
    "country" TEXT NOT NULL DEFAULT 'KR',
    "language" TEXT NOT NULL DEFAULT 'ko',
    "current_mood_id" TEXT,
    "galaxy_activity_scores" JSONB DEFAULT '{}',
    "max_constellation_bonds" INTEGER NOT NULL DEFAULT 20,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_primary_provider" TEXT,
    "ai_primary_model" TEXT,
    "ai_compaction_model" TEXT,
    "expo_push_token" TEXT,
    "push_touch_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_ping_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_comment_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_bond_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_marketing_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_coordinates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "coord_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coord_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "z_depth" REAL NOT NULL DEFAULT 1.0,
    "glow_radius" REAL NOT NULL DEFAULT 1.0,
    "nebula_id" UUID,
    "is_in_blackhole" BOOLEAN NOT NULL DEFAULT false,
    "last_static_update" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_dynamic_update" TIMESTAMPTZ(6),
    "static_vector" REAL[],
    "dynamic_vector" REAL[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "color" TEXT,
    "label" TEXT,
    "sync_score" SMALLINT DEFAULT 0,
    "partner_code" TEXT,
    "galaxy_key" TEXT,
    "display_name" TEXT,
    "avatar_image_url" TEXT,
    "avatar_type" TEXT NOT NULL DEFAULT 'image',
    "activity_score" BIGINT NOT NULL DEFAULT 0,
    "status_message" TEXT,
    "rank" INTEGER,

    CONSTRAINT "user_coordinates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_personas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "score_e_i" SMALLINT NOT NULL DEFAULT 50,
    "score_s_n" SMALLINT NOT NULL DEFAULT 50,
    "score_t_f" SMALLINT NOT NULL DEFAULT 50,
    "score_j_p" SMALLINT NOT NULL DEFAULT 50,
    "score_morning_night" SMALLINT NOT NULL DEFAULT 50,
    "score_home_open" SMALLINT NOT NULL DEFAULT 50,
    "score_spend_save" SMALLINT NOT NULL DEFAULT 50,
    "score_depth_broad" SMALLINT NOT NULL DEFAULT 50,
    "score_calm_vibrant" SMALLINT NOT NULL DEFAULT 50,
    "score_yolo_future" SMALLINT NOT NULL DEFAULT 50,
    "persona_code" TEXT NOT NULL DEFAULT 'INFP',
    "persona_name" TEXT NOT NULL,
    "persona_color" TEXT NOT NULL,
    "glow_color_primary" TEXT NOT NULL,
    "glow_color_secondary" TEXT NOT NULL,
    "survey_completed" BOOLEAN NOT NULL DEFAULT false,
    "survey_stage" SMALLINT NOT NULL DEFAULT 0,
    "occupation" TEXT,
    "interest_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "life_stage" TEXT DEFAULT 'EARLY_CAREER',
    "life_stage_since" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "content" TEXT,
    "image_url" TEXT,
    "aura_at_post" TEXT NOT NULL,
    "category" TEXT,
    "galaxy_key" TEXT,
    "topic_tags" TEXT[],
    "sentiment_vector" REAL[],
    "sentiment_label" TEXT,
    "ai_processed" BOOLEAN NOT NULL DEFAULT false,
    "ping_count" INTEGER NOT NULL DEFAULT 0,
    "is_filtered" BOOLEAN NOT NULL DEFAULT false,
    "filter_reason" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "images" JSONB,
    "youtube_url" TEXT,
    "mood_id" TEXT,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "is_subscriber_only" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "moment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "moment_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sender_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "moment_id" UUID,
    "galaxy_key" TEXT,
    "ping_type" TEXT NOT NULL,
    "is_crystal" BOOLEAN NOT NULL DEFAULT false,
    "is_filtered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "character_code" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "message" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "model_used" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ai_affinity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "character_code" TEXT NOT NULL,
    "affinity_score" INTEGER NOT NULL DEFAULT 0,
    "resonance_stage" INTEGER NOT NULL DEFAULT 1,
    "interaction_count" INTEGER NOT NULL DEFAULT 0,
    "unlocked_skills" TEXT[],
    "last_interacted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_ai_affinity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cosmic_weather_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "weather_type" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "target_moment_id" UUID,
    "stardust_multiplier" REAL NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cosmic_weather_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constellation_bonds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_a_id" UUID NOT NULL,
    "user_b_id" UUID NOT NULL,
    "bond_type" TEXT NOT NULL DEFAULT '"constellation"',
    "bond_color" TEXT,
    "bond_shader" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "rejected_at" TIMESTAMPTZ(6),
    "galaxy_key" TEXT,

    CONSTRAINT "constellation_bonds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_code" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_star_dust" INTEGER,
    "is_limited" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spine_asset_path" TEXT,
    "preview_image_url" TEXT,
    "slot_category" TEXT,
    "rarity" TEXT NOT NULL DEFAULT 'common',

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_avatar_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "base_character" TEXT NOT NULL DEFAULT 'spineboy',
    "equipped_slots" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_avatar_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nebula_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nebula_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nebula_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nebulae" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nebula_type" TEXT NOT NULL DEFAULT 'public',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "theme_color" TEXT NOT NULL,
    "persona_code" TEXT,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "center_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "center_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "radius" REAL NOT NULL DEFAULT 10,
    "owner_id" UUID,
    "invite_code" TEXT,
    "max_members" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nebulae_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "question_no" SMALLINT NOT NULL,
    "answer_value" SMALLINT NOT NULL,
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "blocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "reported_id" UUID NOT NULL,
    "moment_id" UUID,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '"pending"',
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_diaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "diary_text" TEXT,
    "dominant_mood" TEXT,
    "mood_breakdown" JSONB,
    "image_url" TEXT,
    "moment_count" INTEGER NOT NULL DEFAULT 0,
    "ping_sent_count" INTEGER NOT NULL DEFAULT 0,
    "ping_received_count" INTEGER NOT NULL DEFAULT 0,
    "is_generated" BOOLEAN NOT NULL DEFAULT false,
    "generated_at" TIMESTAMPTZ(6),
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_diaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stardust_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SPEND',
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stardust_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thought_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscriber_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tier" TEXT NOT NULL DEFAULT 'basic',
    "monthly_cost" INTEGER NOT NULL DEFAULT 1000,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "thought_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "touches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "toucher_id" UUID NOT NULL,
    "touched_id" UUID NOT NULL,
    "galaxy_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "touches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_statistics" (
    "user_id" UUID NOT NULL,
    "galaxy_key" TEXT NOT NULL,
    "today_visits" INTEGER NOT NULL DEFAULT 0,
    "yesterday_visits" INTEGER NOT NULL DEFAULT 0,
    "total_visits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_statistics_pkey" PRIMARY KEY ("user_id","galaxy_key")
);

-- CreateTable
CREATE TABLE "pixel_visit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target_pixel_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "galaxy_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pixel_visit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_souls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "soul_prompt" TEXT NOT NULL,
    "memory_version" INTEGER NOT NULL DEFAULT 0,
    "interaction_count" INTEGER NOT NULL DEFAULT 0,
    "total_tokens_used" INTEGER NOT NULL DEFAULT 0,
    "daily_action_count" INTEGER NOT NULL DEFAULT 0,
    "last_active_at" TIMESTAMPTZ(6),
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "last_reflection_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "allow_owner_mention" BOOLEAN NOT NULL DEFAULT false,
    "life_event_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_souls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "initiator_soul_id" UUID NOT NULL,
    "responder_soul_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "turn_count" INTEGER NOT NULL DEFAULT 3,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "match_score" DOUBLE PRECISION,
    "match_type" TEXT,
    "topic_ingredient" TEXT,
    "used_owner_data" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_memories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ai_soul_id" UUID NOT NULL,
    "memory_stream" TEXT NOT NULL,
    "memory_layer" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "embedding" vector(1536),
    "source" TEXT NOT NULL,
    "importance_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recall_count" INTEGER NOT NULL DEFAULT 0,
    "unique_partners" INTEGER NOT NULL DEFAULT 0,
    "is_promoted" BOOLEAN NOT NULL DEFAULT false,
    "promoted_category" TEXT,
    "promoted_at" TIMESTAMPTZ(6),
    "merged_from" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_reflection_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ai_soul_id" UUID NOT NULL,
    "phase" TEXT NOT NULL,
    "input_count" INTEGER NOT NULL DEFAULT 0,
    "promoted_count" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_reflection_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_whispers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "soul_id" UUID NOT NULL,
    "target_moment_id" UUID,
    "target_soul_id" UUID,
    "whisper_type" TEXT NOT NULL,
    "content" TEXT,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_whispers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_galaxy_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "ai_moment_id" UUID NOT NULL,
    "view_duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_galaxy_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_moments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "soul_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "action_type" TEXT NOT NULL DEFAULT 'POST',
    "context_type" TEXT NOT NULL,
    "author_type" TEXT NOT NULL DEFAULT 'ai',
    "parent_moment_id" UUID,
    "target_soul_id" UUID,
    "topic_ingredient" TEXT,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "is_moderated" BOOLEAN NOT NULL DEFAULT false,
    "thread_id" UUID,
    "post_type" TEXT,
    "original_language" TEXT,
    "target_language" TEXT,
    "owner_translation" TEXT,
    "image_url" TEXT,
    "image_credit" TEXT,
    "ping_count" INTEGER NOT NULL DEFAULT 0,
    "touch_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "trending_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "api_key_encrypted" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_validated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_pings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "soul_id" UUID NOT NULL,
    "target_soul_id" UUID NOT NULL,
    "moment_id" UUID NOT NULL,
    "ping_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_pings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_touches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "soul_id" UUID NOT NULL,
    "target_soul_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_touches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_soul_bonds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "soul_a_id" UUID NOT NULL,
    "soul_b_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resonance_score" INTEGER NOT NULL DEFAULT 0,
    "last_interaction_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_soul_bonds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "galaxies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "partner_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "center_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "center_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "join_type" TEXT NOT NULL DEFAULT 'lazy',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_root" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "galaxies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "galaxy_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "galaxy_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "type" TEXT NOT NULL DEFAULT 'content_tag',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "galaxy_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_profiles" (
    "user_id" UUID NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowed_ips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_admin_login" TIMESTAMPTZ(6),

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "actor_id" UUID,
    "resource_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_life_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "soul_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PROJECT',
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "desire" TEXT,
    "current_phase" SMALLINT NOT NULL DEFAULT 0,
    "phase_history" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pad_state" JSONB NOT NULL DEFAULT '{ "P": 0, "A": 0, "D": 0 }',
    "day_count" SMALLINT NOT NULL DEFAULT 0,
    "cycle_count" SMALLINT NOT NULL DEFAULT 1,
    "last_event_summary" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_life_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_need_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "soul_id" UUID NOT NULL,
    "expression_need" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "social_need" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reflection_need" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rest_need" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_need_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dm_rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" VARCHAR(10) NOT NULL DEFAULT 'DM',
    "name" VARCHAR(50),
    "avatar_url" TEXT,
    "creator_id" UUID,
    "max_participants" INTEGER NOT NULL DEFAULT 2,
    "lastMessageAt" TIMESTAMPTZ(6),
    "lastMessagePreview" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dm_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(10) NOT NULL DEFAULT 'MEMBER',
    "mute_until" TIMESTAMPTZ(6),
    "last_read_at" TIMESTAMPTZ(6),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "dm_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dm_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "images" JSONB DEFAULT '[]',
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avatar_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "soul_id" UUID NOT NULL,
    "concept" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "last_access" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(768),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avatar_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avatar_edges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "relation_type" VARCHAR(50) NOT NULL,
    "weight" REAL NOT NULL DEFAULT 0.5,
    "reinforce_count" INTEGER NOT NULL DEFAULT 1,
    "last_access" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avatar_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heartbeat_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "soul_id" UUID NOT NULL,
    "stimulus" TEXT NOT NULL,
    "should_speak" BOOLEAN NOT NULL,
    "spark_nodes" JSONB,
    "final_output" TEXT,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "heartbeat_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordinate_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "galaxy_key" TEXT,
    "coord_x" DOUBLE PRECISION NOT NULL,
    "coord_y" DOUBLE PRECISION NOT NULL,
    "z_depth" REAL NOT NULL DEFAULT 1.0,
    "rank" INTEGER NOT NULL,
    "zone" INTEGER NOT NULL,
    "activity_score" BIGINT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_mood_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "mood_id" VARCHAR(20) NOT NULL,
    "aura" VARCHAR(20) NOT NULL,
    "recorded_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mood_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_uid_key" ON "users"("google_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_pixel_id_key" ON "users"("pixel_id");

-- CreateIndex
CREATE INDEX "idx_users_current_aura" ON "users"("current_aura");

-- CreateIndex
CREATE INDEX "idx_users_google_uid" ON "users"("google_uid");

-- CreateIndex
CREATE INDEX "idx_users_is_active" ON "users"("is_active") WHERE (is_active = true);

-- CreateIndex
CREATE INDEX "idx_users_pixel_id" ON "users"("pixel_id");

-- CreateIndex
CREATE INDEX "idx_coords_partner_galaxy" ON "user_coordinates"("partner_code", "galaxy_key");

-- CreateIndex
CREATE INDEX "idx_coords_nebula_id" ON "user_coordinates"("nebula_id");

-- CreateIndex
CREATE INDEX "idx_coords_position" ON "user_coordinates"("coord_x", "coord_y");

-- CreateIndex
CREATE UNIQUE INDEX "idx_coords_sojung_user_galaxy" ON "user_coordinates"("user_id", "galaxy_key") WHERE (galaxy_key IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "user_personas_user_id_key" ON "user_personas"("user_id");

-- CreateIndex
CREATE INDEX "idx_moments_ai_queue" ON "moments"("ai_processed") WHERE (ai_processed = false);

-- CreateIndex
CREATE INDEX "idx_moments_category" ON "moments"("category") WHERE (category IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_moments_created_at" ON "moments"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_moments_user_id" ON "moments"("user_id");

-- CreateIndex
CREATE INDEX "idx_moments_galaxy_key" ON "moments"("galaxy_key");

-- CreateIndex
CREATE INDEX "moment_comments_moment_id_created_at_idx" ON "moment_comments"("moment_id", "created_at");

-- CreateIndex
CREATE INDEX "moment_comments_user_id_idx" ON "moment_comments"("user_id");

-- CreateIndex
CREATE INDEX "idx_pings_sender_receiver_created" ON "pings"("sender_id", "receiver_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pings_receiver_created" ON "pings"("receiver_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pings_galaxy_key" ON "pings"("galaxy_key");

-- CreateIndex
CREATE INDEX "ai_interactions_processed_at_idx" ON "ai_interactions"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_ai_affinity_user_id_character_code_key" ON "user_ai_affinity"("user_id", "character_code");

-- CreateIndex
CREATE INDEX "idx_constellation_bonds_galaxy_key" ON "constellation_bonds"("galaxy_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_constellation_bonds_a_b_galaxy" ON "constellation_bonds"("user_a_id", "user_b_id", "galaxy_key");

-- CreateIndex
CREATE UNIQUE INDEX "items_item_code_key" ON "items"("item_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_avatar_config_user_id_key" ON "user_avatar_config"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "nebula_members_nebula_id_user_id_key" ON "nebula_members"("nebula_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "nebulae_invite_code_key" ON "nebulae"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_answers_user_id_question_no_key" ON "onboarding_answers"("user_id", "question_no");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_blocker_id_blocked_id_key" ON "user_blocks"("blocker_id", "blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_inventory_user_id_item_id_key" ON "user_inventory"("user_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_diaries_user_id_week_start_key" ON "weekly_diaries"("user_id", "week_start");

-- CreateIndex
CREATE INDEX "idx_stardust_tx_user_created" ON "stardust_transactions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_stardust_tx_user_category" ON "stardust_transactions"("user_id", "category");

-- CreateIndex
CREATE INDEX "idx_thought_sub_subscriber" ON "thought_subscriptions"("subscriber_id", "status");

-- CreateIndex
CREATE INDEX "idx_thought_sub_creator" ON "thought_subscriptions"("creator_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "thought_subscriptions_subscriber_id_creator_id_key" ON "thought_subscriptions"("subscriber_id", "creator_id");

-- CreateIndex
CREATE INDEX "idx_touches_toucher_created" ON "touches"("toucher_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_touches_touched_created" ON "touches"("touched_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_touches_galaxy_key" ON "touches"("galaxy_key");

-- CreateIndex
CREATE INDEX "pixel_visit_logs_target_pixel_id_visitor_id_created_at_idx" ON "pixel_visit_logs"("target_pixel_id", "visitor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pixel_visits_galaxy_key" ON "pixel_visit_logs"("galaxy_key");

-- CreateIndex
CREATE UNIQUE INDEX "ai_souls_user_id_key" ON "ai_souls"("user_id");

-- CreateIndex
CREATE INDEX "ai_conversations_initiator_soul_id_created_at_idx" ON "ai_conversations"("initiator_soul_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_conversations_responder_soul_id_created_at_idx" ON "ai_conversations"("responder_soul_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_memories_ai_soul_id_memory_stream_memory_layer_idx" ON "ai_memories"("ai_soul_id", "memory_stream", "memory_layer");

-- CreateIndex
CREATE INDEX "ai_memories_ai_soul_id_is_promoted_idx" ON "ai_memories"("ai_soul_id", "is_promoted");

-- CreateIndex
CREATE INDEX "ai_memories_ai_soul_id_importance_score_idx" ON "ai_memories"("ai_soul_id", "importance_score" DESC);

-- CreateIndex
CREATE INDEX "ai_reflection_logs_ai_soul_id_processed_at_idx" ON "ai_reflection_logs"("ai_soul_id", "processed_at" DESC);

-- CreateIndex
CREATE INDEX "ai_whispers_soul_id_is_resolved_created_at_idx" ON "ai_whispers"("soul_id", "is_resolved", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_whispers_user_id_idx" ON "ai_whispers"("user_id");

-- CreateIndex
CREATE INDEX "ai_galaxy_views_user_id_created_at_idx" ON "ai_galaxy_views"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_moments_soul_id_action_type_created_at_idx" ON "ai_moments"("soul_id", "action_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_moments_soul_id_created_at_idx" ON "ai_moments"("soul_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_moments_trending_score_idx" ON "ai_moments"("trending_score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_keys_user_id_provider_key" ON "ai_provider_keys"("user_id", "provider");

-- CreateIndex
CREATE INDEX "ai_pings_moment_id_ping_type_idx" ON "ai_pings"("moment_id", "ping_type");

-- CreateIndex
CREATE INDEX "ai_pings_soul_id_created_at_idx" ON "ai_pings"("soul_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_touches_soul_id_created_at_idx" ON "ai_touches"("soul_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_touches_target_soul_id_created_at_idx" ON "ai_touches"("target_soul_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_soul_bonds_status_idx" ON "ai_soul_bonds"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_soul_bonds_soul_a_id_soul_b_id_key" ON "ai_soul_bonds"("soul_a_id", "soul_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "galaxies_key_key" ON "galaxies"("key");

-- CreateIndex
CREATE UNIQUE INDEX "galaxies_partner_code_key" ON "galaxies"("partner_code");

-- CreateIndex
CREATE INDEX "galaxies_is_active_sort_order_idx" ON "galaxies"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "galaxy_categories_galaxy_id_key_key" ON "galaxy_categories"("galaxy_id", "key");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_created_at_idx" ON "admin_audit_logs"("admin_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notifications_user_unread" ON "notifications"("user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notifications_user_timeline" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_life_threads_soul_id_is_active_idx" ON "ai_life_threads"("soul_id", "is_active");

-- CreateIndex
CREATE INDEX "ai_life_threads_soul_id_type_is_active_idx" ON "ai_life_threads"("soul_id", "type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ai_need_states_soul_id_key" ON "ai_need_states"("soul_id");

-- CreateIndex
CREATE INDEX "dm_rooms_type_idx" ON "dm_rooms"("type");

-- CreateIndex
CREATE INDEX "dm_rooms_lastMessageAt_idx" ON "dm_rooms"("lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "dm_participants_user_id_left_at_idx" ON "dm_participants"("user_id", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "dm_participants_room_id_user_id_key" ON "dm_participants"("room_id", "user_id");

-- CreateIndex
CREATE INDEX "dm_messages_room_id_created_at_idx" ON "dm_messages"("room_id", "created_at" ASC);

-- CreateIndex
CREATE INDEX "dm_messages_sender_id_idx" ON "dm_messages"("sender_id");

-- CreateIndex
CREATE INDEX "avatar_nodes_soul_id_last_access_idx" ON "avatar_nodes"("soul_id", "last_access" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "avatar_nodes_soul_id_concept_key" ON "avatar_nodes"("soul_id", "concept");

-- CreateIndex
CREATE UNIQUE INDEX "avatar_edges_source_id_target_id_relation_type_key" ON "avatar_edges"("source_id", "target_id", "relation_type");

-- CreateIndex
CREATE INDEX "heartbeat_logs_soul_id_created_at_idx" ON "heartbeat_logs"("soul_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "coordinate_history_user_id_snapshot_date_idx" ON "coordinate_history"("user_id", "snapshot_date" DESC);

-- CreateIndex
CREATE INDEX "coordinate_history_snapshot_date_idx" ON "coordinate_history"("snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "coordinate_history_user_id_galaxy_key_snapshot_date_key" ON "coordinate_history"("user_id", "galaxy_key", "snapshot_date");

-- CreateIndex
CREATE INDEX "idx_mood_history_timeline" ON "user_mood_history"("user_id", "recorded_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_mood_history_user_date" ON "user_mood_history"("user_id", "recorded_date");

-- AddForeignKey
ALTER TABLE "user_coordinates" ADD CONSTRAINT "user_coordinates_nebula_id_fkey" FOREIGN KEY ("nebula_id") REFERENCES "nebulae"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_coordinates" ADD CONSTRAINT "user_coordinates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_personas" ADD CONSTRAINT "user_personas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "moment_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pings" ADD CONSTRAINT "pings_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pings" ADD CONSTRAINT "pings_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pings" ADD CONSTRAINT "pings_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_ai_affinity" ADD CONSTRAINT "user_ai_affinity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cosmic_weather_logs" ADD CONSTRAINT "cosmic_weather_logs_target_moment_id_fkey" FOREIGN KEY ("target_moment_id") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "constellation_bonds" ADD CONSTRAINT "constellation_bonds_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "constellation_bonds" ADD CONSTRAINT "constellation_bonds_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_avatar_config" ADD CONSTRAINT "user_avatar_config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebula_members" ADD CONSTRAINT "nebula_members_nebula_id_fkey" FOREIGN KEY ("nebula_id") REFERENCES "nebulae"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nebula_members" ADD CONSTRAINT "nebula_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nebulae" ADD CONSTRAINT "nebulae_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "onboarding_answers" ADD CONSTRAINT "onboarding_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "moments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "weekly_diaries" ADD CONSTRAINT "weekly_diaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stardust_transactions" ADD CONSTRAINT "stardust_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "thought_subscriptions" ADD CONSTRAINT "thought_subscriptions_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "thought_subscriptions" ADD CONSTRAINT "thought_subscriptions_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "touches" ADD CONSTRAINT "touches_touched_id_fkey" FOREIGN KEY ("touched_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "touches" ADD CONSTRAINT "touches_toucher_id_fkey" FOREIGN KEY ("toucher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_statistics" ADD CONSTRAINT "user_statistics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pixel_visit_logs" ADD CONSTRAINT "pixel_visit_logs_target_pixel_id_fkey" FOREIGN KEY ("target_pixel_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pixel_visit_logs" ADD CONSTRAINT "pixel_visit_logs_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_souls" ADD CONSTRAINT "ai_souls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_initiator_soul_id_fkey" FOREIGN KEY ("initiator_soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_responder_soul_id_fkey" FOREIGN KEY ("responder_soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_ai_soul_id_fkey" FOREIGN KEY ("ai_soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reflection_logs" ADD CONSTRAINT "ai_reflection_logs_ai_soul_id_fkey" FOREIGN KEY ("ai_soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_whispers" ADD CONSTRAINT "ai_whispers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_whispers" ADD CONSTRAINT "ai_whispers_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_whispers" ADD CONSTRAINT "ai_whispers_target_moment_id_fkey" FOREIGN KEY ("target_moment_id") REFERENCES "ai_moments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_moments" ADD CONSTRAINT "ai_moments_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_moments" ADD CONSTRAINT "ai_moments_parent_moment_id_fkey" FOREIGN KEY ("parent_moment_id") REFERENCES "ai_moments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_moments" ADD CONSTRAINT "ai_moments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "ai_life_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_keys" ADD CONSTRAINT "ai_provider_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_pings" ADD CONSTRAINT "ai_pings_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_pings" ADD CONSTRAINT "ai_pings_target_soul_id_fkey" FOREIGN KEY ("target_soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_pings" ADD CONSTRAINT "ai_pings_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "ai_moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_touches" ADD CONSTRAINT "ai_touches_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_touches" ADD CONSTRAINT "ai_touches_target_soul_id_fkey" FOREIGN KEY ("target_soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_soul_bonds" ADD CONSTRAINT "ai_soul_bonds_soul_a_id_fkey" FOREIGN KEY ("soul_a_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_soul_bonds" ADD CONSTRAINT "ai_soul_bonds_soul_b_id_fkey" FOREIGN KEY ("soul_b_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "galaxy_categories" ADD CONSTRAINT "galaxy_categories_galaxy_id_fkey" FOREIGN KEY ("galaxy_id") REFERENCES "galaxies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_life_threads" ADD CONSTRAINT "ai_life_threads_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_need_states" ADD CONSTRAINT "ai_need_states_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_rooms" ADD CONSTRAINT "dm_rooms_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_participants" ADD CONSTRAINT "dm_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "dm_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_participants" ADD CONSTRAINT "dm_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "dm_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_nodes" ADD CONSTRAINT "avatar_nodes_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_edges" ADD CONSTRAINT "avatar_edges_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "avatar_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_edges" ADD CONSTRAINT "avatar_edges_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "avatar_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heartbeat_logs" ADD CONSTRAINT "heartbeat_logs_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mood_history" ADD CONSTRAINT "user_mood_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

