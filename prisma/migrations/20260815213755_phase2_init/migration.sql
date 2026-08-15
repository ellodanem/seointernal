-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GscPropertyType" AS ENUM ('DOMAIN', 'URL_PREFIX');

-- CreateEnum
CREATE TYPE "GscPropertyStatus" AS ENUM ('CONFIGURED', 'VERIFIED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "PageRole" AS ENUM ('INDEXABLE', 'NOINDEX', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PageSource" AS ENUM ('SITEMAP', 'MANUAL', 'GSC');

-- CreateEnum
CREATE TYPE "GscMetricScopeType" AS ENUM ('PROPERTY', 'ORIGIN');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "auth_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "primaryOrigin" TEXT NOT NULL,
    "sitemapUrl" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_properties" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "propertyType" "GscPropertyType" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "status" "GscPropertyStatus" NOT NULL DEFAULT 'CONFIGURED',
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gsc_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "role" "PageRole" NOT NULL DEFAULT 'UNKNOWN',
    "source" "PageSource" NOT NULL DEFAULT 'MANUAL',
    "watched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_daily_totals" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gscPropertyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "scopeType" "GscMetricScopeType" NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gsc_daily_totals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_page_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gscPropertyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gsc_page_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_query_daily" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gscPropertyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "query" TEXT NOT NULL,
    "scopeType" "GscMetricScopeType" NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gsc_query_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_query_page_rollups" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gscPropertyId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "query" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "scopeType" "GscMetricScopeType" NOT NULL DEFAULT 'ORIGIN',
    "scopeValue" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gsc_query_page_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_sitemap_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gscPropertyId" TEXT NOT NULL,
    "sitemapPath" TEXT NOT NULL,
    "lastSubmitted" TIMESTAMP(3),
    "lastDownloaded" TIMESTAMP(3),
    "isPending" BOOLEAN NOT NULL DEFAULT false,
    "submittedCount" INTEGER,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "rawResult" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gsc_sitemap_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_url_inspections" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gscPropertyId" TEXT NOT NULL,
    "pageId" TEXT,
    "inspectedUrl" TEXT NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL,
    "verdict" TEXT,
    "coverageState" TEXT,
    "indexingState" TEXT,
    "robotsTxtState" TEXT,
    "pageFetchState" TEXT,
    "lastCrawlTime" TIMESTAMP(3),
    "googleCanonical" TEXT,
    "userCanonical" TEXT,
    "crawledAs" TEXT,
    "rawResult" JSONB,

    CONSTRAINT "gsc_url_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "projectId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "JobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "stats" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_user_email_key" ON "auth_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "gsc_properties_projectId_idx" ON "gsc_properties"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "gsc_properties_projectId_siteUrl_key" ON "gsc_properties"("projectId", "siteUrl");

-- CreateIndex
CREATE INDEX "pages_projectId_host_idx" ON "pages"("projectId", "host");

-- CreateIndex
CREATE UNIQUE INDEX "pages_projectId_url_key" ON "pages"("projectId", "url");

-- CreateIndex
CREATE INDEX "gsc_daily_totals_projectId_date_idx" ON "gsc_daily_totals"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "gsc_daily_totals_gscPropertyId_date_scopeType_scopeValue_key" ON "gsc_daily_totals"("gscPropertyId", "date", "scopeType", "scopeValue");

-- CreateIndex
CREATE INDEX "gsc_page_daily_projectId_date_idx" ON "gsc_page_daily"("projectId", "date");

-- CreateIndex
CREATE INDEX "gsc_page_daily_projectId_host_idx" ON "gsc_page_daily"("projectId", "host");

-- CreateIndex
CREATE UNIQUE INDEX "gsc_page_daily_gscPropertyId_date_pageUrl_key" ON "gsc_page_daily"("gscPropertyId", "date", "pageUrl");

-- CreateIndex
CREATE INDEX "gsc_query_daily_projectId_date_idx" ON "gsc_query_daily"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "gsc_query_daily_gscPropertyId_date_query_scopeType_scopeVal_key" ON "gsc_query_daily"("gscPropertyId", "date", "query", "scopeType", "scopeValue");

-- CreateIndex
CREATE INDEX "gsc_query_page_rollups_projectId_periodEnd_idx" ON "gsc_query_page_rollups"("projectId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "gsc_query_page_rollups_gscPropertyId_periodStart_periodEnd__key" ON "gsc_query_page_rollups"("gscPropertyId", "periodStart", "periodEnd", "query", "pageUrl", "scopeType", "scopeValue");

-- CreateIndex
CREATE INDEX "gsc_sitemap_snapshots_projectId_capturedAt_idx" ON "gsc_sitemap_snapshots"("projectId", "capturedAt");

-- CreateIndex
CREATE INDEX "gsc_sitemap_snapshots_gscPropertyId_sitemapPath_idx" ON "gsc_sitemap_snapshots"("gscPropertyId", "sitemapPath");

-- CreateIndex
CREATE INDEX "gsc_url_inspections_projectId_inspectedAt_idx" ON "gsc_url_inspections"("projectId", "inspectedAt");

-- CreateIndex
CREATE INDEX "gsc_url_inspections_pageId_idx" ON "gsc_url_inspections"("pageId");

-- CreateIndex
CREATE INDEX "job_runs_jobName_startedAt_idx" ON "job_runs"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "job_runs_projectId_idx" ON "job_runs"("projectId");

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_properties" ADD CONSTRAINT "gsc_properties_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_daily_totals" ADD CONSTRAINT "gsc_daily_totals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_daily_totals" ADD CONSTRAINT "gsc_daily_totals_gscPropertyId_fkey" FOREIGN KEY ("gscPropertyId") REFERENCES "gsc_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_page_daily" ADD CONSTRAINT "gsc_page_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_page_daily" ADD CONSTRAINT "gsc_page_daily_gscPropertyId_fkey" FOREIGN KEY ("gscPropertyId") REFERENCES "gsc_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_query_daily" ADD CONSTRAINT "gsc_query_daily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_query_daily" ADD CONSTRAINT "gsc_query_daily_gscPropertyId_fkey" FOREIGN KEY ("gscPropertyId") REFERENCES "gsc_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_query_page_rollups" ADD CONSTRAINT "gsc_query_page_rollups_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_query_page_rollups" ADD CONSTRAINT "gsc_query_page_rollups_gscPropertyId_fkey" FOREIGN KEY ("gscPropertyId") REFERENCES "gsc_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_sitemap_snapshots" ADD CONSTRAINT "gsc_sitemap_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_sitemap_snapshots" ADD CONSTRAINT "gsc_sitemap_snapshots_gscPropertyId_fkey" FOREIGN KEY ("gscPropertyId") REFERENCES "gsc_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_url_inspections" ADD CONSTRAINT "gsc_url_inspections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_url_inspections" ADD CONSTRAINT "gsc_url_inspections_gscPropertyId_fkey" FOREIGN KEY ("gscPropertyId") REFERENCES "gsc_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_url_inspections" ADD CONSTRAINT "gsc_url_inspections_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
