-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "SpecialtyCategory" AS ENUM ('ENDOCRINOLOGY', 'RHEUMATOLOGY', 'ORTHOPEDICS', 'INTERNAL_MEDICINE', 'FAMILY_MEDICINE', 'GERIATRICS', 'MENTAL_HEALTH', 'PSYCHIATRY', 'PSYCHOLOGY', 'SOCIAL_WORK', 'NURSING', 'NURSE_PRACTITIONER', 'PHYSICIAN_ASSISTANT', 'MIDWIFERY', 'DENTISTRY', 'OPTOMETRY', 'PHARMACY', 'PHYSICAL_THERAPY', 'OCCUPATIONAL_THERAPY', 'SPEECH_THERAPY', 'RESPIRATORY_THERAPY', 'CHIROPRACTIC', 'ACUPUNCTURE', 'EMERGENCY_MEDICINE', 'PEDIATRICS', 'ANESTHESIOLOGY', 'SURGERY', 'OB_GYN', 'CARDIOLOGY', 'RADIOLOGY', 'DERMATOLOGY', 'NEUROLOGY', 'ONCOLOGY', 'UROLOGY', 'GASTROENTEROLOGY', 'PULMONOLOGY', 'NEPHROLOGY', 'INFECTIOUS_DISEASE', 'ALLERGY_IMMUNOLOGY', 'PATHOLOGY', 'DIETETICS', 'LAB_PATHOLOGY', 'DME_PROSTHETICS', 'COMMUNITY_HEALTH', 'HOME_HEALTH', 'HOSPICE_PALLIATIVE', 'CLINIC_FACILITY', 'HOSPITAL', 'OTHER');

-- CreateEnum
CREATE TYPE "NpiStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('HMO', 'PPO', 'EPO', 'POS', 'HDHP', 'MEDICARE_ADVANTAGE', 'MEDICAID', 'OTHER');

-- CreateEnum
CREATE TYPE "MetalLevel" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'CATASTROPHIC');

-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('INDIVIDUAL', 'SMALL_GROUP', 'LARGE_GROUP', 'MEDICARE', 'MEDICAID');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('CMS_NPPES', 'CMS_PLAN_FINDER', 'USER_UPLOAD', 'CARRIER_API', 'CROWDSOURCE');

-- CreateEnum
CREATE TYPE "AcceptanceStatus" AS ENUM ('ACCEPTED', 'NOT_ACCEPTED', 'PENDING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('CMS_DATA', 'CARRIER_DATA', 'PROVIDER_PORTAL', 'PHONE_CALL', 'CROWDSOURCE', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('PLAN_ACCEPTANCE', 'PROVIDER_INFO', 'CONTACT_INFO', 'STATUS_CHANGE', 'NEW_PLAN');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('NPI_FULL', 'NPI_WEEKLY', 'PLAN_IMPORT', 'PLAN_UPDATE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "npi" VARCHAR(10) NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "middleName" VARCHAR(100),
    "credential" VARCHAR(50),
    "organizationName" VARCHAR(300),
    "addressLine1" VARCHAR(200) NOT NULL,
    "addressLine2" VARCHAR(200),
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "zip" VARCHAR(10) NOT NULL,
    "country" VARCHAR(2) NOT NULL DEFAULT 'US',
    "phone" VARCHAR(20),
    "fax" VARCHAR(20),
    "taxonomyCode" VARCHAR(20),
    "taxonomyDescription" VARCHAR(200),
    "specialtyCategory" "SpecialtyCategory",
    "secondaryTaxonomies" JSONB,
    "enumerationDate" TIMESTAMP(3),
    "lastUpdateDate" TIMESTAMP(3),
    "deactivationDate" TIMESTAMP(3),
    "reactivationDate" TIMESTAMP(3),
    "npiStatus" "NpiStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_plans" (
    "id" TEXT NOT NULL,
    "planId" VARCHAR(50) NOT NULL,
    "planName" VARCHAR(300) NOT NULL,
    "carrierId" VARCHAR(50),
    "carrierName" VARCHAR(200) NOT NULL,
    "planType" "PlanType" NOT NULL,
    "metalLevel" "MetalLevel",
    "marketType" "MarketType" NOT NULL,
    "statesCovered" TEXT[],
    "serviceArea" VARCHAR(500),
    "planYear" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "dataSource" "DataSource" NOT NULL,
    "sourceFileId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_plan_acceptance" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "acceptanceStatus" "AcceptanceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "acceptsNewPatients" BOOLEAN,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceFactors" JSONB,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationSource" "VerificationSource",
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "effectiveDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_plan_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_logs" (
    "id" TEXT NOT NULL,
    "providerId" TEXT,
    "planId" TEXT,
    "acceptanceId" TEXT,
    "verificationType" "VerificationType" NOT NULL,
    "verificationSource" "VerificationSource" NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "sourceIp" VARCHAR(50),
    "userAgent" VARCHAR(500),
    "submittedBy" VARCHAR(200),
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "isApproved" BOOLEAN,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "notes" TEXT,
    "evidenceUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "syncType" "SyncType" NOT NULL,
    "dataSource" "DataSource" NOT NULL,
    "sourceFileName" VARCHAR(500),
    "sourceFileHash" VARCHAR(64),
    "sourceFileSize" BIGINT,
    "sourceFileDate" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "processedRecords" INTEGER NOT NULL DEFAULT 0,
    "insertedRecords" INTEGER NOT NULL DEFAULT 0,
    "updatedRecords" INTEGER NOT NULL DEFAULT 0,
    "skippedRecords" INTEGER NOT NULL DEFAULT 0,
    "errorRecords" INTEGER NOT NULL DEFAULT 0,
    "errorLog" JSONB,
    "lastError" TEXT,
    "filterCriteria" JSONB,
    "triggeredBy" VARCHAR(200),
    "notes" TEXT,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "providers_npi_key" ON "providers"("npi");

-- CreateIndex
CREATE INDEX "providers_state_idx" ON "providers"("state");

-- CreateIndex
CREATE INDEX "providers_taxonomyCode_idx" ON "providers"("taxonomyCode");

-- CreateIndex
CREATE INDEX "providers_specialtyCategory_idx" ON "providers"("specialtyCategory");

-- CreateIndex
CREATE INDEX "providers_lastName_idx" ON "providers"("lastName");

-- CreateIndex
CREATE INDEX "providers_organizationName_idx" ON "providers"("organizationName");

-- CreateIndex
CREATE INDEX "providers_state_specialtyCategory_idx" ON "providers"("state", "specialtyCategory");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_plans_planId_key" ON "insurance_plans"("planId");

-- CreateIndex
CREATE INDEX "insurance_plans_carrierName_idx" ON "insurance_plans"("carrierName");

-- CreateIndex
CREATE INDEX "insurance_plans_planType_idx" ON "insurance_plans"("planType");

-- CreateIndex
CREATE INDEX "insurance_plans_statesCovered_idx" ON "insurance_plans"("statesCovered");

-- CreateIndex
CREATE INDEX "insurance_plans_planYear_idx" ON "insurance_plans"("planYear");

-- CreateIndex
CREATE INDEX "insurance_plans_isActive_idx" ON "insurance_plans"("isActive");

-- CreateIndex
CREATE INDEX "provider_plan_acceptance_acceptanceStatus_idx" ON "provider_plan_acceptance"("acceptanceStatus");

-- CreateIndex
CREATE INDEX "provider_plan_acceptance_confidenceScore_idx" ON "provider_plan_acceptance"("confidenceScore");

-- CreateIndex
CREATE INDEX "provider_plan_acceptance_lastVerifiedAt_idx" ON "provider_plan_acceptance"("lastVerifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_plan_acceptance_providerId_planId_key" ON "provider_plan_acceptance"("providerId", "planId");

-- CreateIndex
CREATE INDEX "verification_logs_providerId_idx" ON "verification_logs"("providerId");

-- CreateIndex
CREATE INDEX "verification_logs_planId_idx" ON "verification_logs"("planId");

-- CreateIndex
CREATE INDEX "verification_logs_verificationType_idx" ON "verification_logs"("verificationType");

-- CreateIndex
CREATE INDEX "verification_logs_createdAt_idx" ON "verification_logs"("createdAt");

-- CreateIndex
CREATE INDEX "verification_logs_isApproved_idx" ON "verification_logs"("isApproved");

-- CreateIndex
CREATE INDEX "sync_logs_syncType_idx" ON "sync_logs"("syncType");

-- CreateIndex
CREATE INDEX "sync_logs_dataSource_idx" ON "sync_logs"("dataSource");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");

-- CreateIndex
CREATE INDEX "sync_logs_startedAt_idx" ON "sync_logs"("startedAt");

-- AddForeignKey
ALTER TABLE "provider_plan_acceptance" ADD CONSTRAINT "provider_plan_acceptance_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_plan_acceptance" ADD CONSTRAINT "provider_plan_acceptance_planId_fkey" FOREIGN KEY ("planId") REFERENCES "insurance_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "insurance_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
