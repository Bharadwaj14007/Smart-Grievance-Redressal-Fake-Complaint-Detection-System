-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CITIZEN', 'OFFICER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('SUBMITTED', 'AI_ANALYSIS', 'ASSIGNED', 'UNDER_INVESTIGATION', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('NOT_CONFIGURED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citizen_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(32),
    "address" TEXT,
    "state" VARCHAR(100),
    "district" VARCHAR(100),
    "city" VARCHAR(100),
    "pincode" VARCHAR(12),

    CONSTRAINT "citizen_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "officer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "department_id" UUID,
    "jurisdiction" TEXT,
    "phone" VARCHAR(32),

    CONSTRAINT "officer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "description" TEXT,
    "state" VARCHAR(100),
    "district" VARCHAR(100),
    "jurisdiction" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "department_id" UUID,
    "default_priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "sla_hours" INTEGER NOT NULL DEFAULT 72,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "complaint_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "tracking_id" VARCHAR(40) NOT NULL,
    "citizen_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "department_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Priority" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ComplaintStatus" NOT NULL DEFAULT 'SUBMITTED',
    "incident_at" TIMESTAMPTZ(6),
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_images" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_locations" (
    "complaint_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "pincode" VARCHAR(12) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,

    CONSTRAINT "complaint_locations_pkey" PRIMARY KEY ("complaint_id")
);

-- CreateTable
CREATE TABLE "complaint_assignments" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "officer_id" UUID NOT NULL,
    "department_id" UUID,
    "assigned_by_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "complaint_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation_notes" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investigation_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolution_evidence" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resolution_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_status_history" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "from_status" "ComplaintStatus",
    "to_status" "ComplaintStatus" NOT NULL,
    "note" TEXT,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "complaint_id" UUID,
    "type" VARCHAR(60) NOT NULL,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_reviews" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" VARCHAR(40) NOT NULL,
    "similarity" DECIMAL(5,4),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_configurations" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "priority" "Priority",
    "response_hours" INTEGER NOT NULL,
    "resolution_hours" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sla_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_sequences" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tracking_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "citizen_profiles_user_id_key" ON "citizen_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "officer_profiles_user_id_key" ON "officer_profiles"("user_id");

-- CreateIndex
CREATE INDEX "officer_profiles_department_id_idx" ON "officer_profiles"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_categories_name_key" ON "complaint_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_tracking_id_key" ON "complaints"("tracking_id");

-- CreateIndex
CREATE INDEX "complaints_citizen_id_created_at_idx" ON "complaints"("citizen_id", "created_at");

-- CreateIndex
CREATE INDEX "complaints_status_priority_created_at_idx" ON "complaints"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "complaints_department_id_status_idx" ON "complaints"("department_id", "status");

-- CreateIndex
CREATE INDEX "complaints_category_id_created_at_idx" ON "complaints"("category_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_images_object_key_key" ON "complaint_images"("object_key");

-- CreateIndex
CREATE INDEX "complaint_images_complaint_id_idx" ON "complaint_images"("complaint_id");

-- CreateIndex
CREATE INDEX "complaint_locations_state_district_city_idx" ON "complaint_locations"("state", "district", "city");

-- CreateIndex
CREATE INDEX "complaint_assignments_officer_id_active_idx" ON "complaint_assignments"("officer_id", "active");

-- CreateIndex
CREATE INDEX "complaint_assignments_complaint_id_active_idx" ON "complaint_assignments"("complaint_id", "active");

-- CreateIndex
CREATE INDEX "investigation_notes_complaint_id_created_at_idx" ON "investigation_notes"("complaint_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "resolution_evidence_object_key_key" ON "resolution_evidence"("object_key");

-- CreateIndex
CREATE INDEX "complaint_status_history_complaint_id_created_at_idx" ON "complaint_status_history"("complaint_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_complaint_id_key" ON "feedback"("complaint_id");

-- CreateIndex
CREATE INDEX "duplicate_reviews_complaint_id_created_at_idx" ON "duplicate_reviews"("complaint_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "sla_configurations_category_id_priority_active_idx" ON "sla_configurations"("category_id", "priority", "active");

-- CreateIndex
CREATE INDEX "ai_analyses_status_created_at_idx" ON "ai_analyses"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_expires_at_idx" ON "refresh_tokens"("user_id", "revoked_at", "expires_at");

-- AddForeignKey
ALTER TABLE "citizen_profiles" ADD CONSTRAINT "citizen_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "officer_profiles" ADD CONSTRAINT "officer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "officer_profiles" ADD CONSTRAINT "officer_profiles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_categories" ADD CONSTRAINT "complaint_categories_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "complaint_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_images" ADD CONSTRAINT "complaint_images_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_locations" ADD CONSTRAINT "complaint_locations_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_assignments" ADD CONSTRAINT "complaint_assignments_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_assignments" ADD CONSTRAINT "complaint_assignments_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_assignments" ADD CONSTRAINT "complaint_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_notes" ADD CONSTRAINT "investigation_notes_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_notes" ADD CONSTRAINT "investigation_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution_evidence" ADD CONSTRAINT "resolution_evidence_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_status_history" ADD CONSTRAINT "complaint_status_history_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_configurations" ADD CONSTRAINT "sla_configurations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "complaint_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
