CREATE OR REPLACE FUNCTION fibermap_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
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
    IF TG_TABLE_NAME='UserInvitation' AND to_jsonb(NEW)->>'purpose'='INVITE' AND used>=l."maxUsers" THEN RAISE EXCEPTION 'Limite de usuários e convites atingido' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
