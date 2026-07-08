-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "skip_reason" TEXT;

-- AlterTable
ALTER TABLE "vendor_profiles" ADD COLUMN     "embedding" vector(384);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "action_type" TEXT NOT NULL,
    "performed_by" TEXT NOT NULL DEFAULT 'admin',
    "old_score" DOUBLE PRECISION NOT NULL,
    "new_score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
