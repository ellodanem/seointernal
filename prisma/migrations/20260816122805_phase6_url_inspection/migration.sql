-- DropIndex
DROP INDEX "gsc_url_inspections_pageId_idx";

-- AlterTable
ALTER TABLE "gsc_url_inspections" ADD COLUMN     "canonicalState" TEXT,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "normalizedStatus" TEXT,
ADD COLUMN     "success" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "gsc_url_inspections_pageId_inspectedAt_idx" ON "gsc_url_inspections"("pageId", "inspectedAt");

-- CreateIndex
CREATE INDEX "gsc_url_inspections_projectId_pageId_inspectedAt_idx" ON "gsc_url_inspections"("projectId", "pageId", "inspectedAt");
