-- AlterTable
ALTER TABLE "NetworkConnection" ADD COLUMN     "actorId" TEXT;

-- AlterTable
ALTER TABLE "OpticalTerminal" ADD COLUMN     "attachmentId" TEXT,
ADD COLUMN     "localSide" TEXT,
ADD COLUMN     "routePosition" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "OpticalDiagram" (
    "equipmentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpticalDiagram_pkey" PRIMARY KEY ("equipmentId")
);

-- CreateTable
CREATE TABLE "CableAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "fraction" DOUBLE PRECISION NOT NULL,
    "fiberStates" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CableAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpticalDiagram_equipmentId_organizationId_key" ON "OpticalDiagram"("equipmentId", "organizationId");

-- CreateIndex
CREATE INDEX "CableAccess_organizationId_cableId_idx" ON "CableAccess"("organizationId", "cableId");

-- CreateIndex
CREATE UNIQUE INDEX "CableAccess_equipmentId_cableId_key" ON "CableAccess"("equipmentId", "cableId");

-- CreateIndex
CREATE UNIQUE INDEX "CableAccess_id_cableId_organizationId_key" ON "CableAccess"("id", "cableId", "organizationId");

-- AddForeignKey
ALTER TABLE "OpticalTerminal" ADD CONSTRAINT "OpticalTerminal_attachmentId_assetId_organizationId_fkey" FOREIGN KEY ("attachmentId", "assetId", "organizationId") REFERENCES "CableAccess"("id", "cableId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpticalDiagram" ADD CONSTRAINT "OpticalDiagram_equipmentId_organizationId_fkey" FOREIGN KEY ("equipmentId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableAccess" ADD CONSTRAINT "CableAccess_equipmentId_organizationId_fkey" FOREIGN KEY ("equipmentId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableAccess" ADD CONSTRAINT "CableAccess_cableId_organizationId_fkey" FOREIGN KEY ("cableId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An end belongs to one enclosure. Midspan access can occur at multiple locations.
CREATE UNIQUE INDEX "CableAccess_unique_end" ON "CableAccess"("cableId", "end") WHERE "end" IN ('A','B');
CREATE UNIQUE INDEX "CableAccess_unique_midspan" ON "CableAccess"("cableId", "fraction") WHERE "end" = 'MID';
ALTER TABLE "CableAccess" ADD CONSTRAINT "CableAccess_position_check" CHECK (("end"='A' AND "fraction"=0) OR ("end"='B' AND "fraction"=1) OR ("end"='MID' AND "fraction">0 AND "fraction"<1));
ALTER TABLE "OpticalTerminal" ADD CONSTRAINT "OpticalTerminal_access_check" CHECK (("attachmentId" IS NULL AND "localSide" IS NULL AND "routePosition" IS NULL) OR ("attachmentId" IS NOT NULL AND "fiberId" IS NOT NULL AND "localSide" IN ('IN','OUT') AND "routePosition">0 AND "routePosition"<1));
CREATE UNIQUE INDEX "OpticalTerminal_access_fiber_side" ON "OpticalTerminal"("attachmentId", "fiberId", "localSide");
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['OpticalDiagram','CableAccess'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon,authenticated', t); END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fibermap_app') THEN
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO fibermap_app', t);
  EXECUTE format('CREATE POLICY server_runtime ON %I TO fibermap_app USING (true) WITH CHECK (true)', t);
 END IF;
END LOOP;
END $$;
