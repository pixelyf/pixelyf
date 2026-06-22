-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'CONTENT_ADMIN', 'SUPER_ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';
