-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssetKind" ADD VALUE 'COVERAGE';
ALTER TYPE "AssetKind" ADD VALUE 'WAYPOINT';
ALTER TYPE "AssetKind" ADD VALUE 'IMPORTED';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#18a99b',
ADD COLUMN     "destinationLabel" TEXT,
ADD COLUMN     "geographicLengthM" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "installedAt" TIMESTAMP(3),
ADD COLUMN     "layerId" TEXT,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "originLabel" TEXT,
ADD COLUMN     "physicalLengthM" DOUBLE PRECISION,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "reserveM" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "NetworkProject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapLayer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#18a99b',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MapLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "source" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CableSegment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "geometry" JSONB NOT NULL,
    "spatial" geometry(LineString,4326),
    "lengthM" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CableSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkProject_id_organizationId_key" ON "NetworkProject"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkProject_organizationId_name_key" ON "NetworkProject"("organizationId", "name");

-- CreateIndex
CREATE INDEX "MapLayer_organizationId_projectId_idx" ON "MapLayer"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MapLayer_id_organizationId_key" ON "MapLayer"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_id_organizationId_key" ON "ImportBatch"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_organizationId_digest_key" ON "ImportBatch"("organizationId", "digest");

-- CreateIndex
CREATE INDEX "CableSegment_organizationId_idx" ON "CableSegment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CableSegment_assetId_position_key" ON "CableSegment"("assetId", "position");

-- CreateIndex
CREATE INDEX "Asset_organizationId_projectId_layerId_idx" ON "Asset"("organizationId", "projectId", "layerId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "NetworkProject"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_layerId_organizationId_fkey" FOREIGN KEY ("layerId", "organizationId") REFERENCES "MapLayer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_importBatchId_organizationId_fkey" FOREIGN KEY ("importBatchId", "organizationId") REFERENCES "ImportBatch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkProject" ADD CONSTRAINT "NetworkProject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapLayer" ADD CONSTRAINT "MapLayer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapLayer" ADD CONSTRAINT "MapLayer_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "NetworkProject"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "NetworkProject"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableSegment" ADD CONSTRAINT "CableSegment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableSegment" ADD CONSTRAINT "CableSegment_assetId_organizationId_fkey" FOREIGN KEY ("assetId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
