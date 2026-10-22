ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
CREATE INDEX "AdministrativeAudit_login_idx" ON "AdministrativeAudit" ("actorId",action,"createdAt");
