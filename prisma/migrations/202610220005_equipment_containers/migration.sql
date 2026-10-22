-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "NetworkProject" ADD COLUMN     "colorPattern" JSONB NOT NULL DEFAULT '["Azul","Laranja","Verde","Marrom","Cinza","Branco","Vermelho","Preto","Amarelo","Violeta","Rosa","Turquesa"]';

-- AlterTable
ALTER TABLE "NetworkConnection" ADD COLUMN     "locationId" TEXT;

-- CreateIndex
CREATE INDEX "Asset_parentId_organizationId_idx" ON "Asset"("parentId", "organizationId");

-- CreateIndex
CREATE INDEX "NetworkConnection_locationId_organizationId_idx" ON "NetworkConnection"("locationId", "organizationId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_parentId_organizationId_fkey" FOREIGN KEY ("parentId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkConnection" ADD CONSTRAINT "NetworkConnection_locationId_organizationId_fkey" FOREIGN KEY ("locationId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
