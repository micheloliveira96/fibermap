-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'PATCHCORD';

-- DropIndex
DROP INDEX "Asset_organizationId_code_key";

-- DropIndex
DROP INDEX "ImportBatch_organizationId_digest_key";

-- AlterTable
ALTER TABLE "NetworkProject" ADD COLUMN     "creatorId" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "region" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "restricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "view" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "InternalLink" ADD COLUMN     "name" TEXT,
ADD COLUMN     "status" "FiberStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "NetworkConnection" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "CableAccess" ADD COLUMN     "bothEnds" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remoteAssetId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "ProjectGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY['projects.view']::TEXT[],

    CONSTRAINT "ProjectGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagramComponent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "DiagramComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectGrant_projectId_membershipId_key" ON "ProjectGrant"("projectId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagramComponent_equipmentId_assetId_key" ON "DiagramComponent"("equipmentId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_organizationId_projectId_code_key" ON "Asset"("organizationId", "projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_organizationId_projectId_digest_key" ON "ImportBatch"("organizationId", "projectId", "digest");

-- AddForeignKey
ALTER TABLE "ProjectGrant" ADD CONSTRAINT "ProjectGrant_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "NetworkProject"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGrant" ADD CONSTRAINT "ProjectGrant_membershipId_organizationId_fkey" FOREIGN KEY ("membershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkConnection" ADD CONSTRAINT "NetworkConnection_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "NetworkProject"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableAccess" ADD CONSTRAINT "CableAccess_remoteAssetId_organizationId_fkey" FOREIGN KEY ("remoteAssetId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagramComponent" ADD CONSTRAINT "DiagramComponent_equipmentId_organizationId_fkey" FOREIGN KEY ("equipmentId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagramComponent" ADD CONSTRAINT "DiagramComponent_assetId_organizationId_fkey" FOREIGN KEY ("assetId", "organizationId") REFERENCES "Asset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "NetworkProject"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve legacy records in a real project, with IDs and optical topology unchanged.
ALTER TABLE "NetworkProject" DISABLE TRIGGER project_capacity;
INSERT INTO "NetworkProject" (id,"organizationId",name,"createdAt","updatedAt")
SELECT 'principal:'||o.id,o.id,'Projeto Principal',now(),now() FROM "Organization" o
WHERE (EXISTS(SELECT 1 FROM "Asset" a WHERE a."organizationId"=o.id AND a."projectId" IS NULL)
OR EXISTS(SELECT 1 FROM "MapLayer" l WHERE l."organizationId"=o.id AND l."projectId" IS NULL)
OR EXISTS(SELECT 1 FROM "NetworkConnection" c WHERE c."organizationId"=o.id))
AND NOT EXISTS(SELECT 1 FROM "NetworkProject" p WHERE p."organizationId"=o.id AND p.name='Projeto Principal');
ALTER TABLE "NetworkProject" ENABLE TRIGGER project_capacity;
UPDATE "Asset" a SET "projectId"=p.id FROM "NetworkProject" p WHERE a."projectId" IS NULL AND a."organizationId"=p."organizationId" AND p.name='Projeto Principal';
UPDATE "MapLayer" a SET "projectId"=p.id FROM "NetworkProject" p WHERE a."projectId" IS NULL AND a."organizationId"=p."organizationId" AND p.name='Projeto Principal';
UPDATE "NetworkConnection" c SET "projectId"=coalesce((SELECT a."projectId" FROM "Asset" a WHERE a.id=c."locationId"),(SELECT a."projectId" FROM "ConnectionTerminal" t JOIN "OpticalTerminal" o ON o.id=t."terminalId" JOIN "Asset" a ON a.id=o."assetId" WHERE t."connectionId"=c.id LIMIT 1),(SELECT p.id FROM "NetworkProject" p WHERE p."organizationId"=c."organizationId" AND p.name='Projeto Principal'));
UPDATE "AuditLog" a SET "projectId"=coalesce((SELECT x."projectId" FROM "Asset" x WHERE x.id=a."entityId"),(SELECT x."projectId" FROM "NetworkConnection" x WHERE x.id=a."entityId"),(SELECT p.id FROM "NetworkProject" p WHERE p."organizationId"=a."organizationId" AND p.name='Projeto Principal'));
DO $$ BEGIN
IF EXISTS(SELECT 1 FROM "ConnectionTerminal" t JOIN "NetworkConnection" c ON c.id=t."connectionId" JOIN "OpticalTerminal" o ON o.id=t."terminalId" JOIN "Asset" a ON a.id=o."assetId" WHERE c."projectId" IS DISTINCT FROM a."projectId")
OR EXISTS(SELECT 1 FROM "Asset" a JOIN "Asset" p ON p.id=a."parentId" WHERE a."projectId" IS DISTINCT FROM p."projectId")
OR EXISTS(SELECT 1 FROM "CableAccess" c JOIN "Asset" a ON a.id=c."equipmentId" JOIN "Asset" b ON b.id=c."cableId" WHERE a."projectId" IS DISTINCT FROM b."projectId")
THEN RAISE EXCEPTION 'Existing cross-project topology requires an explicit recovery plan; nothing was deleted'; END IF;
END $$;
-- Flush deferred connection validators before changing table constraints.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "Asset" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "MapLayer" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "NetworkConnection" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "NetworkProject" ADD CONSTRAINT "NetworkProject_status_check" CHECK(status IN ('ACTIVE','ARCHIVED','DELETED'));

-- Backwards-compatible inserts from trusted legacy code receive the company's principal project.
-- HTTP writes use an explicit, authorized project and never use this fallback.
CREATE FUNCTION fibermap_project_default() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p text;
BEGIN
IF NEW."projectId" IS NULL THEN
  SELECT id INTO p FROM "NetworkProject" WHERE "organizationId"=NEW."organizationId" AND name='Projeto Principal';
  IF p IS NULL THEN
    INSERT INTO "NetworkProject" (id,"organizationId",name,"createdAt","updatedAt") VALUES ('principal:'||NEW."organizationId",NEW."organizationId",'Projeto Principal',now(),now()) RETURNING id INTO p;
  END IF;
  NEW."projectId":=p;
END IF;
RETURN NEW;
END $$;
CREATE TRIGGER a_project_default BEFORE INSERT ON "Asset" FOR EACH ROW EXECUTE FUNCTION fibermap_project_default();
CREATE TRIGGER a_project_default BEFORE INSERT ON "MapLayer" FOR EACH ROW EXECUTE FUNCTION fibermap_project_default();
CREATE TRIGGER a_project_default BEFORE INSERT ON "NetworkConnection" FOR EACH ROW EXECUTE FUNCTION fibermap_project_default();

CREATE FUNCTION fibermap_project_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p text; q text; r text;
BEGIN
IF TG_TABLE_NAME='Asset' THEN
 p:=NEW."projectId";
 IF TG_OP='UPDATE' AND OLD."projectId" IS DISTINCT FROM p THEN RAISE EXCEPTION 'An asset cannot move between projects; duplicate the project' USING ERRCODE='23514'; END IF;
 IF NEW."parentId" IS NOT NULL THEN SELECT "projectId" INTO q FROM "Asset" WHERE id=NEW."parentId"; IF q IS DISTINCT FROM p THEN RAISE EXCEPTION 'Container belongs to another project' USING ERRCODE='23514'; END IF; END IF;
 IF NEW."layerId" IS NOT NULL THEN SELECT "projectId" INTO q FROM "MapLayer" WHERE id=NEW."layerId"; IF q IS DISTINCT FROM p THEN RAISE EXCEPTION 'Layer belongs to another project' USING ERRCODE='23514'; END IF; END IF;
 IF NEW."importBatchId" IS NOT NULL THEN SELECT "projectId" INTO q FROM "ImportBatch" WHERE id=NEW."importBatchId"; IF q IS DISTINCT FROM p THEN RAISE EXCEPTION 'Import belongs to another project' USING ERRCODE='23514'; END IF; END IF;
ELSIF TG_TABLE_NAME='ConnectionTerminal' THEN
 SELECT a."projectId" INTO p FROM "OpticalTerminal" t JOIN "Asset" a ON a.id=t."assetId" WHERE t.id=NEW."terminalId";
 SELECT "projectId" INTO q FROM "NetworkConnection" WHERE id=NEW."connectionId";
 IF p IS DISTINCT FROM q THEN RAISE EXCEPTION 'A connection cannot cross projects' USING ERRCODE='23514'; END IF;
ELSIF TG_TABLE_NAME='NetworkConnection' THEN
 IF NEW."locationId" IS NOT NULL THEN SELECT "projectId" INTO p FROM "Asset" WHERE id=NEW."locationId"; IF p IS DISTINCT FROM NEW."projectId" THEN RAISE EXCEPTION 'Connection location belongs to another project' USING ERRCODE='23514'; END IF; END IF;
 IF TG_OP='UPDATE' AND OLD."projectId" IS DISTINCT FROM NEW."projectId" THEN RAISE EXCEPTION 'Connection project is immutable' USING ERRCODE='23514'; END IF;
ELSIF TG_TABLE_NAME='CableAccess' THEN
 SELECT "projectId" INTO p FROM "Asset" WHERE id=NEW."equipmentId";
 SELECT "projectId" INTO q FROM "Asset" WHERE id=NEW."cableId";
 IF p IS DISTINCT FROM q THEN RAISE EXCEPTION 'Cable access cannot cross projects' USING ERRCODE='23514'; END IF;
 IF NEW."bothEnds" AND NEW."end"='MID' THEN RAISE EXCEPTION 'Both ends cannot be a midspan access' USING ERRCODE='23514'; END IF;
 IF NEW."remoteAssetId" IS NOT NULL THEN
  SELECT "projectId" INTO r FROM "Asset" WHERE id=NEW."remoteAssetId" AND kind='CUSTOMER';
  IF r IS DISTINCT FROM p OR NOT NEW."bothEnds" THEN RAISE EXCEPTION 'Invalid remote customer' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM "CableAccess" x WHERE x.id<>NEW.id AND x."cableId"=NEW."cableId" AND ((NEW."bothEnds" AND x."end" IN ('A','B')) OR (x."bothEnds" AND NEW."end" IN ('A','B')))) THEN RAISE EXCEPTION 'A physical cable end is already associated' USING ERRCODE='23514'; END IF;
ELSIF TG_TABLE_NAME='DiagramComponent' THEN
 SELECT "projectId" INTO p FROM "Asset" WHERE id=NEW."equipmentId";
 SELECT "projectId" INTO q FROM "Asset" WHERE id=NEW."assetId";
 IF p IS DISTINCT FROM q OR NEW."equipmentId"=NEW."assetId" THEN RAISE EXCEPTION 'Invalid diagram component project' USING ERRCODE='23514'; END IF;
ELSIF TG_TABLE_NAME='InternalLink' THEN
 IF NOT EXISTS(SELECT 1 FROM "OpticalTerminal" WHERE id=NEW."aId" AND "assetId"=NEW."assetId") OR NOT EXISTS(SELECT 1 FROM "OpticalTerminal" WHERE id=NEW."bId" AND "assetId"=NEW."assetId") THEN RAISE EXCEPTION 'Adapter terminals must belong to the component' USING ERRCODE='23514'; END IF;
END IF;
RETURN NEW;
END $$;
CREATE TRIGGER b_project_integrity BEFORE INSERT OR UPDATE ON "Asset" FOR EACH ROW EXECUTE FUNCTION fibermap_project_integrity();
CREATE TRIGGER b_project_integrity BEFORE INSERT OR UPDATE ON "ConnectionTerminal" FOR EACH ROW EXECUTE FUNCTION fibermap_project_integrity();
CREATE TRIGGER b_project_integrity BEFORE INSERT OR UPDATE ON "NetworkConnection" FOR EACH ROW EXECUTE FUNCTION fibermap_project_integrity();
CREATE TRIGGER b_project_integrity BEFORE INSERT OR UPDATE ON "CableAccess" FOR EACH ROW EXECUTE FUNCTION fibermap_project_integrity();
CREATE TRIGGER b_project_integrity BEFORE INSERT OR UPDATE ON "DiagramComponent" FOR EACH ROW EXECUTE FUNCTION fibermap_project_integrity();
CREATE TRIGGER b_project_integrity BEFORE INSERT OR UPDATE ON "InternalLink" FOR EACH ROW EXECUTE FUNCTION fibermap_project_integrity();

CREATE FUNCTION fibermap_project_touch() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
UPDATE "NetworkProject" SET "updatedAt"=now() WHERE id=NEW."projectId"; RETURN NEW; END $$;
CREATE TRIGGER project_touch AFTER INSERT OR UPDATE ON "Asset" FOR EACH ROW EXECUTE FUNCTION fibermap_project_touch();
CREATE TRIGGER project_touch AFTER INSERT OR UPDATE ON "NetworkConnection" FOR EACH ROW EXECUTE FUNCTION fibermap_project_touch();

-- Existing full project license entitlements continue to enable project management.
UPDATE "License" SET features=features||ARRAY['projects.rename','projects.duplicate','projects.archive','projects.delete','projects.export','projects.access'] WHERE cardinality(features)>0 AND 'projects.edit'=ANY(features);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['ProjectGrant','DiagramComponent'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon,authenticated',t); END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fibermap_app') THEN
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO fibermap_app',t);
  EXECUTE format('CREATE POLICY server_runtime ON %I TO fibermap_app USING (true) WITH CHECK (true)',t);
 END IF;
END LOOP; END $$;
REVOKE ALL ON FUNCTION fibermap_project_default(),fibermap_project_integrity(),fibermap_project_touch() FROM PUBLIC;

-- Keep ownership immutable even for direct database writes.
CREATE FUNCTION fibermap_ownership_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE component_kind text; parent_id text;
BEGIN
 IF TG_TABLE_NAME IN ('MapLayer','ImportBatch') AND TG_OP='UPDATE' THEN
  IF OLD."projectId" IS DISTINCT FROM NEW."projectId" OR OLD."organizationId"<>NEW."organizationId" THEN RAISE EXCEPTION 'Project ownership is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='FiberStrand' AND TG_OP='UPDATE' THEN
  IF OLD."assetId"<>NEW."assetId" THEN RAISE EXCEPTION 'Fiber ownership is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='OpticalTerminal' AND TG_OP='UPDATE' THEN
  IF OLD."assetId"<>NEW."assetId" OR OLD."fiberId" IS DISTINCT FROM NEW."fiberId" OR OLD."organizationId"<>NEW."organizationId" THEN RAISE EXCEPTION 'Terminal ownership is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='CableAccess' THEN
  PERFORM 1 FROM "Asset" WHERE id=NEW."cableId" FOR UPDATE;
  IF TG_OP='UPDATE' AND (OLD."equipmentId"<>NEW."equipmentId" OR OLD."cableId"<>NEW."cableId" OR OLD."end"<>NEW."end" OR OLD.fraction<>NEW.fraction) THEN RAISE EXCEPTION 'Physical access identity is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='DiagramComponent' THEN
  SELECT kind::text,"parentId" INTO component_kind,parent_id FROM "Asset" WHERE id=NEW."assetId" FOR UPDATE;
  IF component_kind<>'CUSTOMER' AND parent_id IS NOT NULL AND parent_id<>NEW."equipmentId" THEN RAISE EXCEPTION 'Equipment is installed in another location' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM "DiagramComponent" x WHERE x."assetId"=NEW."assetId" AND x."equipmentId"<>NEW."equipmentId") THEN RAISE EXCEPTION 'Component already belongs to another optical diagram' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_ownership_guard BEFORE UPDATE ON "MapLayer" FOR EACH ROW EXECUTE FUNCTION fibermap_ownership_guard();
CREATE TRIGGER aa_ownership_guard BEFORE UPDATE ON "ImportBatch" FOR EACH ROW EXECUTE FUNCTION fibermap_ownership_guard();
CREATE TRIGGER aa_ownership_guard BEFORE UPDATE ON "FiberStrand" FOR EACH ROW EXECUTE FUNCTION fibermap_ownership_guard();
CREATE TRIGGER aa_ownership_guard BEFORE UPDATE ON "OpticalTerminal" FOR EACH ROW EXECUTE FUNCTION fibermap_ownership_guard();
CREATE TRIGGER aa_ownership_guard BEFORE INSERT OR UPDATE ON "CableAccess" FOR EACH ROW EXECUTE FUNCTION fibermap_ownership_guard();
CREATE TRIGGER aa_ownership_guard BEFORE INSERT OR UPDATE ON "DiagramComponent" FOR EACH ROW EXECUTE FUNCTION fibermap_ownership_guard();
REVOKE ALL ON FUNCTION fibermap_ownership_guard() FROM PUBLIC;

-- Trash releases the project quota; restoration checks it again.
CREATE OR REPLACE FUNCTION fibermap_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE l "License"; used bigint;
BEGIN
  PERFORM 1 FROM "Organization" WHERE id=NEW."organizationId" FOR UPDATE;
  SELECT * INTO l FROM "License" WHERE "organizationId"=NEW."organizationId";
  IF TG_TABLE_NAME='NetworkProject' THEN
    IF NEW.status='DELETED' OR (TG_OP='UPDATE' AND OLD.status<>'DELETED') THEN RETURN NEW; END IF;
    SELECT count(*) INTO used FROM "NetworkProject" WHERE "organizationId"=NEW."organizationId" AND status<>'DELETED';
    IF used>=l."maxProjects" THEN RAISE EXCEPTION 'Limite de projetos atingido' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='ImportBatch' THEN
    SELECT coalesce(sum(octet_length(source)),0) INTO used FROM "ImportBatch" WHERE "organizationId"=NEW."organizationId";
    IF used+octet_length(NEW.source)>l."maxStorageBytes" THEN RAISE EXCEPTION 'Limite de armazenamento de arquivos atingido' USING ERRCODE='23514'; END IF;
  ELSE
    SELECT count(*) INTO used FROM "Membership" WHERE "organizationId"=NEW."organizationId";
    SELECT used+count(*) INTO used FROM "UserInvitation" i WHERE i."organizationId"=NEW."organizationId" AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL AND i."expiresAt">now() AND i.purpose='INVITE' AND NOT EXISTS (SELECT 1 FROM "Membership" m JOIN "User" u ON u.id=m."userId" WHERE m."organizationId"=i."organizationId" AND lower(u.email)=lower(i.email));
    IF TG_TABLE_NAME='Membership' AND used>=l."maxUsers" THEN RAISE EXCEPTION 'Limite de usuários atingido' USING ERRCODE='23514'; END IF;
    IF TG_TABLE_NAME='UserInvitation' AND to_jsonb(NEW)->>'purpose'='INVITE' AND used>=l."maxUsers" THEN RAISE EXCEPTION 'Limite de usuários e convites atingido' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER project_capacity ON "NetworkProject";
CREATE TRIGGER project_capacity BEFORE INSERT OR UPDATE OF status ON "NetworkProject" FOR EACH ROW EXECUTE FUNCTION fibermap_capacity();
