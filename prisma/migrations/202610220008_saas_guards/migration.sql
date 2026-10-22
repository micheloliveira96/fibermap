-- Existing networks stay in their original organizations. No fabricated contracts.
INSERT INTO "License" ("organizationId","updatedAt") SELECT id,now() FROM "Organization" ON CONFLICT DO NOTHING;
UPDATE "Membership" m SET role='OWNER' WHERE role='ADMIN' AND (SELECT count(*) FROM "Membership" x WHERE x."organizationId"=m."organizationId" AND x.role='ADMIN')=1;
CREATE UNIQUE INDEX "Membership_one_owner" ON "Membership"("organizationId") WHERE role='OWNER';
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_no_self_parent" CHECK ("parentId" IS NULL OR "parentId"<>id);
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_status_check" CHECK (status IN ('ACTIVE','SUSPENDED'));
ALTER TABLE "License" ADD CONSTRAINT "License_values_check" CHECK ("maxUsers">0 AND "maxProjects">=0 AND "maxStorageBytes">=0 AND status IN ('ACTIVE','TRIAL','EXPIRED','SUSPENDED','CANCELED') AND "expiryPolicy" IN ('READ_ONLY','BLOCK'));
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "Plan_values_check" CHECK ("maxUsers">0 AND "maxProjects">=0 AND "maxStorageBytes">=0 AND "priceCents">=0 AND period IN ('MONTHLY','YEARLY'));
CREATE FUNCTION fibermap_default_license() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN INSERT INTO "License" ("organizationId","updatedAt") VALUES (NEW.id,now()); RETURN NEW; END $$;
CREATE TRIGGER organization_license AFTER INSERT ON "Organization" FOR EACH ROW EXECUTE FUNCTION fibermap_default_license();
-- Locks serialize reservations and inserts for the same company, including API calls.
CREATE FUNCTION fibermap_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE l "License"; used bigint;
BEGIN
  PERFORM 1 FROM "Organization" WHERE id=NEW."organizationId" FOR UPDATE;
  SELECT * INTO l FROM "License" WHERE "organizationId"=NEW."organizationId";
  IF TG_TABLE_NAME='NetworkProject' THEN
    SELECT count(*) INTO used FROM "NetworkProject" WHERE "organizationId"=NEW."organizationId";
    IF used>=l."maxProjects" THEN RAISE EXCEPTION 'Limite de projetos atingido' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='ImportBatch' THEN
    SELECT coalesce(sum(octet_length(source)),0) INTO used FROM "ImportBatch" WHERE "organizationId"=NEW."organizationId";
    IF used+octet_length(NEW.source)>l."maxStorageBytes" THEN RAISE EXCEPTION 'Limite de armazenamento de arquivos atingido' USING ERRCODE='23514'; END IF;
  ELSE
    SELECT count(*) INTO used FROM "Membership" WHERE "organizationId"=NEW."organizationId";
    SELECT used+count(*) INTO used FROM "UserInvitation" i WHERE i."organizationId"=NEW."organizationId" AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL AND i."expiresAt">now() AND i.purpose='INVITE' AND NOT EXISTS (SELECT 1 FROM "Membership" m JOIN "User" u ON u.id=m."userId" WHERE m."organizationId"=i."organizationId" AND lower(u.email)=lower(i.email));
    IF TG_TABLE_NAME='Membership' AND used>=l."maxUsers" THEN RAISE EXCEPTION 'Limite de usuários atingido' USING ERRCODE='23514'; END IF;
    IF TG_TABLE_NAME='UserInvitation' AND NEW.purpose='INVITE' AND used>=l."maxUsers" THEN RAISE EXCEPTION 'Limite de usuários e convites atingido' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_capacity BEFORE INSERT ON "NetworkProject" FOR EACH ROW EXECUTE FUNCTION fibermap_capacity();
CREATE TRIGGER import_capacity BEFORE INSERT ON "ImportBatch" FOR EACH ROW EXECUTE FUNCTION fibermap_capacity();
CREATE TRIGGER membership_capacity BEFORE INSERT ON "Membership" FOR EACH ROW EXECUTE FUNCTION fibermap_capacity();
CREATE TRIGGER invitation_capacity BEFORE INSERT ON "UserInvitation" FOR EACH ROW EXECUTE FUNCTION fibermap_capacity();
CREATE UNIQUE INDEX "Invitation_pending_email" ON "UserInvitation"("organizationId",lower(email)) WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL AND purpose='INVITE';
-- Direct Supabase browser roles cannot read administrative or invitation data.
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['PlatformAdministrator','SubscriptionPlan','License','UserInvitation','AdministrativeAudit','PlatformSettings'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon,authenticated',t); END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fibermap_app') THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO fibermap_app',t);
   EXECUTE format('CREATE POLICY server_runtime ON %I TO fibermap_app USING (true) WITH CHECK (true)',t);
 END IF;
END LOOP;
IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fibermap_app') THEN
 REVOKE UPDATE,DELETE ON "AdministrativeAudit","AuditLog" FROM fibermap_app;
 REVOKE INSERT,UPDATE,DELETE ON "PlatformAdministrator" FROM fibermap_app;
END IF;
END $$;
REVOKE ALL ON FUNCTION fibermap_default_license(),fibermap_capacity() FROM PUBLIC;
