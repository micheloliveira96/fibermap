require("dotenv").config({ quiet: true });
const fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process"),
  assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");
const url = new URL(process.env.DATABASE_URL);
assert(
  ["localhost", "127.0.0.1"].includes(url.hostname),
  "Local database only",
);
const name = "fibermap_migration_qa_" + Date.now();
assert(/^fibermap_migration_qa_\d+$/.test(name));
const psql = (database, sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "isp-maps-db-1",
      "psql",
      "-U",
      "fibermap",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
const root = path.resolve("tmp/migration-qa", name),
  source = path.resolve("prisma/migrations");
fs.mkdirSync(path.join(root, "migrations"), { recursive: true });
fs.copyFileSync("prisma/schema.prisma", path.join(root, "schema.prisma"));
for (const f of fs.readdirSync(source))
  if (f !== "202610230013_independent_projects_and_components")
    fs.cpSync(path.join(source, f), path.join(root, "migrations", f), {
      recursive: true,
    });
url.pathname = "/" + name;
const deploy = () =>
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      path.join(root, "schema.prisma"),
    ],
    {
      env: { ...process.env, DATABASE_URL: url.href },
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
(async () => {
  let client;
  psql("fibermap", `CREATE DATABASE "${name}";`);
  try {
    deploy();
    psql(
      name,
      `BEGIN; INSERT INTO "Organization" (id,name) VALUES ('legacy-org','Legacy QA');
 INSERT INTO "Asset" (id,"organizationId",code,name,kind,geometry,"updatedAt") VALUES
 ('legacy-cto','legacy-org','CTO-01','Existing CTO','CTO','{"type":"Point","coordinates":[-46.6,-23.5]}',now()),
 ('legacy-cable','legacy-org','CAB-01','Existing cable','BACKBONE','{"type":"LineString","coordinates":[[-46.6,-23.5],[-46.61,-23.51]]}',now());
 INSERT INTO "OpticalTerminal" (id,"organizationId","assetId",label,kind) VALUES
 ('legacy-in','legacy-org','legacy-cto','Porta 1','CTO'),('legacy-out','legacy-org','legacy-cto','Porta 1 · traseira','CTO');
 INSERT INTO "InternalLink" (id,"organizationId","assetId","aId","bId") VALUES ('legacy-adapter','legacy-org','legacy-cto','legacy-in','legacy-out');
 INSERT INTO "CableAccess" (id,"organizationId","equipmentId","cableId","end",fraction) VALUES ('legacy-access','legacy-org','legacy-cto','legacy-cable','A',0);
 INSERT INTO "OpticalDiagram" ("equipmentId","organizationId",layout,"updatedAt") VALUES ('legacy-cto','legacy-org','{"nodes":{"legacy-cto":{"x":20,"y":30}}}',now());
 INSERT INTO "NetworkConnection" (id,"organizationId",kind,"locationId") VALUES ('legacy-connection','legacy-org','DOCUMENTARY','legacy-cto');
 INSERT INTO "ConnectionTerminal" ("terminalId","organizationId","connectionId") VALUES ('legacy-in','legacy-org','legacy-connection'),('legacy-out','legacy-org','legacy-connection'); COMMIT;`,
    );
    client = new PrismaClient({ datasourceUrl: url.href });
    const before = await client.$queryRawUnsafe(
      `SELECT id,geometry FROM "Asset" ORDER BY id`,
    );
    fs.cpSync(
      path.join(source, "202610230013_independent_projects_and_components"),
      path.join(
        root,
        "migrations",
        "202610230013_independent_projects_and_components",
      ),
      { recursive: true },
    );
    deploy();
    assert.deepEqual(
      await client.$queryRawUnsafe(
        `SELECT id,geometry FROM "Asset" ORDER BY id`,
      ),
      before,
    );
    const assets = await client.asset.findMany();
    assert(assets.every((a) => a.projectId === "principal:legacy-org"));
    assert.equal(assets.length, 2);
    assert.equal(
      (
        await client.internalLink.findUniqueOrThrow({
          where: { id: "legacy-adapter" },
        })
      ).aId,
      "legacy-in",
    );
    assert.equal(
      await client.connectionTerminal.count({
        where: { connectionId: "legacy-connection" },
      }),
      2,
    );
    assert.equal(
      (
        await client.networkConnection.findUniqueOrThrow({
          where: { id: "legacy-connection" },
        })
      ).projectId,
      "principal:legacy-org",
    );
    assert.equal(
      (
        await client.cableAccess.findUniqueOrThrow({
          where: { id: "legacy-access" },
        })
      ).cableId,
      "legacy-cable",
    );
    assert.deepEqual(
      (
        await client.opticalDiagram.findUniqueOrThrow({
          where: { equipmentId: "legacy-cto" },
        })
      ).layout,
      { nodes: { "legacy-cto": { x: 20, y: 30 } } },
    );
    assert.equal(await client.networkProject.count(), 1);
    assert.equal(
      (
        await client.$queryRawUnsafe(
          `SELECT count(*)::int n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
        )
      )[0].n,
      13,
    );
    console.log(
      "PASS clean migration 001–013; legacy IDs, geometries, internal pairs, connections, accesses and diagram layout preserved in Projeto Principal.",
    );
  } finally {
    if (client) await client.$disconnect();
    psql("fibermap", `DROP DATABASE "${name}";`);
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
