CREATE INDEX IF NOT EXISTS "Asset_spatial_gist" ON "Asset" USING GIST (spatial);
ALTER TABLE "InternalLink" ADD CONSTRAINT "InternalLink_distinct_surfaces" CHECK ("aId" <> "bId");
ALTER TABLE "FiberStrand" ADD CONSTRAINT "FiberStrand_positive_number" CHECK (number > 0 AND tube > 0);
ALTER TABLE "NetworkConnection" ADD CONSTRAINT "NetworkConnection_nonnegative_loss" CHECK ("lossDb" >= 0);

CREATE FUNCTION validate_connection_terminals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text;
BEGIN
  IF TG_TABLE_NAME = 'NetworkConnection' THEN
    target_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_id := OLD."connectionId";
  ELSE
    target_id := NEW."connectionId";
  END IF;
  IF EXISTS (SELECT 1 FROM "NetworkConnection" WHERE id = target_id)
    AND (SELECT COUNT(*) FROM "ConnectionTerminal" WHERE "connectionId" = target_id) <> 2 THEN
    RAISE EXCEPTION 'Uma conexão física exige exatamente dois terminais' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER connection_has_two_terminals
AFTER INSERT OR UPDATE ON "NetworkConnection" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_connection_terminals();
CREATE CONSTRAINT TRIGGER terminal_pair_remains_complete
AFTER INSERT OR UPDATE OR DELETE ON "ConnectionTerminal" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_connection_terminals();
