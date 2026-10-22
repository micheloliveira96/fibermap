CREATE INDEX "CableSegment_spatial_gist" ON "CableSegment" USING GIST (spatial);
CREATE INDEX "Asset_layerId_org_idx" ON "Asset" ("layerId", "organizationId");
CREATE INDEX "Asset_importBatchId_org_idx" ON "Asset" ("importBatchId", "organizationId");
CREATE INDEX "Asset_projectId_org_idx" ON "Asset" ("projectId", "organizationId");
CREATE INDEX "ImportBatch_projectId_org_idx" ON "ImportBatch" ("projectId", "organizationId");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_valid_lengths" CHECK ("geographicLengthM" >= 0 AND "reserveM" >= 0 AND ("physicalLengthM" IS NULL OR "physicalLengthM" >= 0));
UPDATE "Asset" SET "geographicLengthM" = ST_Length(spatial::geography) WHERE GeometryType(spatial) IN ('LINESTRING','MULTILINESTRING');
-- The browser has no direct database access. The shared server role is protected
-- by membership checks in every API; anonymous and Supabase Auth roles have no grants.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['NetworkProject','MapLayer','ImportBatch','CableSegment'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON %I FROM anon',t);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON %I FROM authenticated',t);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fibermap_app') THEN
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO fibermap_app',t);
      EXECUTE format('CREATE POLICY server_runtime ON %I TO fibermap_app USING (true) WITH CHECK (true)',t);
    END IF;
  END LOOP;
END;
$$;
