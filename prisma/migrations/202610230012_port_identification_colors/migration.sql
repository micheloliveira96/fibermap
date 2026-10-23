-- Additive: existing ports and connections retain their identities and default to neutral.
ALTER TABLE "OpticalTerminal" ADD COLUMN "identificationColor" TEXT;
ALTER TABLE "OpticalTerminal" ADD CONSTRAINT "OpticalTerminal_identificationColor_check"
CHECK ("identificationColor" IS NULL OR "identificationColor" ~ '^#[0-9a-fA-F]{6}$');
