-- DropIndex
DROP INDEX "Asset_spatial_gist";

-- CreateTable
CREATE TABLE "InternalLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,

    CONSTRAINT "InternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InternalLink_aId_key" ON "InternalLink"("aId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalLink_bId_key" ON "InternalLink"("bId");

-- AddForeignKey
ALTER TABLE "InternalLink" ADD CONSTRAINT "InternalLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalLink" ADD CONSTRAINT "InternalLink_assetId_organizationId_fkey" FOREIGN KEY ("assetId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalLink" ADD CONSTRAINT "InternalLink_aId_organizationId_fkey" FOREIGN KEY ("aId", "organizationId") REFERENCES "OpticalTerminal"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalLink" ADD CONSTRAINT "InternalLink_bId_organizationId_fkey" FOREIGN KEY ("bId", "organizationId") REFERENCES "OpticalTerminal"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
