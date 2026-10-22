import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import JSZip from "jszip";
import { db } from "../src/lib/db";
const base = process.env.TEST_API_URL;
if (!base || !/^http:\/\/localhost:\d+$/.test(base))
  throw new Error("Use um servidor local exclusivo.");
const org = randomUUID(),
  other = randomUUID(),
  user = randomUUID(),
  email = `${user}@fibermap.invalid`,
  password = randomUUID() + randomUUID();
let cookie = "";
async function call(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  organization = org,
) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      origin: base!,
      cookie,
      "x-organization-id": organization,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function ok(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  status = 200,
) {
  const r = await call(path, body, method);
  assert.equal(r.status, status, await r.clone().text());
  return r.json();
}
const geometry = {
  type: "LineString",
  coordinates: [
    [-46.63, -23.55],
    [-46.64, -23.56],
    [-46.65, -23.55],
  ],
};
const xml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>Rede importada</name><Placemark><name>Rota KML</name><LineString><coordinates>-46.63,-23.55 -46.64,-23.56</coordinates></LineString></Placemark><Placemark><name>Ponto KML</name><Point><coordinates>-46.63,-23.55</coordinates></Point></Placemark><Placemark><name>Cobertura KML</name><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 1,0 1,1 0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Folder></Document></kml>`;
try {
  await db.organization.createMany({
    data: [
      { id: org, name: "QA editor temporário" },
      { id: other, name: "QA isolamento temporário" },
    ],
  });
  await db.user.create({ data: { id: user, name: "QA", email } });
  await db.account.create({
    data: {
      id: randomUUID(),
      userId: user,
      accountId: user,
      providerId: "credential",
      password: await hashPassword(password),
    },
  });
  await db.membership.create({
    data: { userId: user, organizationId: org, role: "ADMIN" },
  });
  assert.equal((await call("/api/map")).status, 401);
  const login = await call("/api/auth/sign-in/email", { email, password });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const project = await ok("/api/map", {
    type: "project",
    name: "Projeto QA",
    colorPattern: ["Vermelho", "Azul"],
  });
  const layer = await ok("/api/map", {
    type: "layer",
    name: "Cabos QA",
    projectId: project.id,
    color: "#3366ff",
  });
  let cable = await ok(
    "/api/network",
    {
      code: "QA-24",
      name: "Cabo 24",
      kind: "BACKBONE",
      status: "INSTALLED",
      geometry,
      fiberCount: 24,
      projectId: project.id,
      layerId: layer.id,
    },
    "POST",
    201,
  );
  await ok('/api/map',{...layer,type:'layer',color:'#cc6633'});
  assert.equal((await call('/api/map',{...layer,type:'layer',visible:false})).status,409);
  let assets = await ok("/api/network");
  cable = assets.find((a: { id: string }) => a.id === cable.id);
  assert.equal(cable.fibers.length, 24);
  assert.equal(cable.color,'#cc6633');
  assert.equal(cable.fibers[0].color, "Vermelho");
  assert.ok(cable.geographicLengthM > 2000);
  const fiberIds = cable.fibers.map((f: { id: string }) => f.id);
  const cto = await ok(
    "/api/network",
    {
      code: "QA-CTO",
      name: "CTO",
      kind: "CTO",
      status: "INSTALLED",
      geometry: { type: "Point", coordinates: [-46.64, -23.56] },
      ports: 8,
    },
    "POST",
    201,
  );
  const splitter = await ok(
    "/api/network",
    {
      code: "QA-SP",
      name: "Splitter",
      kind: "SPLITTER",
      status: "INSTALLED",
      geometry: { type: "Point", coordinates: [-46.64, -23.56] },
      ports: 8,
      parentId: cto.id,
    },
    "POST",
    201,
  );
  assets = await ok("/api/network");
  const split = assets.find((a: { id: string }) => a.id === splitter.id);
  assert.equal(split.terminals.length, 9);
  const end = cable.terminals.find((t: { label: string }) => t.label === "1/B"),
    input = split.terminals.find(
      (t: { kind: string }) => t.kind === "SPLITTER_IN",
    );
  const connection = await ok(
    "/api/connections",
    { a: end.id, b: input.id, kind: "PATCH", locationId: cto.id },
    "POST",
    201,
  );
  assert.equal(
    (
      await call(
        `/api/assets/${cable.id}`,
        { version: cable.version },
        "DELETE",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(`/api/assets/${cable.id}/split`, {
        at: [-46.635, -23.555],
        version: cable.version,
      })
    ).status,
    409,
  );
  const parts = await ok(`/api/assets/${cable.id}/split`, {
    at: [-46.635, -23.555],
    version: cable.version,
    confirmConnections: true,
  });
  assert.equal(parts.length, 2);
  assets = await ok("/api/network");
  cable = assets.find((a: { id: string }) => a.id === cable.id);
  assert.deepEqual(
    cable.fibers.map((f: { id: string }) => f.id),
    fiberIds,
  );
  assert.equal(
    cable.terminals.find((t: { id: string }) => t.id === end.id).links.length,
    1,
  );
  const edit = {
    ...cable,
    geometry: {
      ...geometry,
      coordinates: [...geometry.coordinates, [-46.66, -23.56]],
    },
    name: "Renomeado",
    installedAt: null,
    fiberCount: 24,
  };
  let updated = await ok(`/api/assets/${cable.id}`, edit, "PATCH");
  assert.equal(updated.name, "Renomeado");
  assert.equal(updated.segments.length, 0);
  assert.equal(
    (await call(`/api/assets/${cable.id}`, edit, "PATCH")).status,
    409,
  );
  assert.deepEqual(
    updated.fibers.map((f: { id: string }) => f.id),
    fiberIds,
  );
  const concurrent = await Promise.all([
    call(
      "/api/assets/" + cable.id,
      { ...updated, name: "Concorrência A" },
      "PATCH",
    ),
    call(
      "/api/assets/" + cable.id,
      { ...updated, name: "Concorrência B" },
      "PATCH",
    ),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  updated = (await ok("/api/network")).find(
    (a: { id: string }) => a.id === cable.id,
  );
  const closure = await ok(
    "/api/network",
    {
      code: "QA-CE",
      name: "Caixa de emenda QA",
      kind: "CLOSURE",
      status: "INSTALLED",
      geometry: { type: "Point", coordinates: [-46.64, -23.56] },
    },
    "POST",
    201,
  );
  const second = await ok(
    "/api/network",
    {
      code: "QA-CABO-B",
      name: "Cabo B",
      kind: "DISTRIBUTION",
      status: "INSTALLED",
      geometry,
      fiberCount: 12,
    },
    "POST",
    201,
  );
  const secondRead = (await ok("/api/network")).find(
    (a: { id: string }) => a.id === second.id,
  );
  const fusion = await ok(
    "/api/connections",
    {
      a: updated.terminals.find((t: { label: string }) => t.label === "3/B").id,
      b: secondRead.terminals.find((t: { label: string }) => t.label === "7/A")
        .id,
      kind: "SPLICE",
      locationId: closure.id,
      tray: "Bandeja 1",
    },
    "POST",
    201,
  );
  const ceConnections = (await ok("/api/map")).connections.filter(
    (c: { locationId: string }) => c.locationId === closure.id,
  );
  assert.equal(ceConnections.length, 1);
  assert.equal(ceConnections[0].kind, "SPLICE");
  await ok("/api/connections/" + fusion.id, {}, "DELETE");

  assert.equal(
    (
      await call(
        `/api/assets/${cable.id}/fibers`,
        {
          fiberId: updated.fibers[0].id,
          status: "DAMAGED",
          version: updated.version,
        },
        "PATCH",
      )
    ).status,
    409,
  );
  await ok(
    `/api/assets/${cable.id}/fibers`,
    {
      fiberId: updated.fibers[1].id,
      status: "RESERVED",
      version: updated.version,
    },
    "PATCH",
  );
  const dup = await ok(
    `/api/assets/${cable.id}`,
    { code: "QA-COPY", name: "Cópia" },
    "POST",
    201,
  );
  assets = await ok("/api/network");
  const copy = assets.find((a: { id: string }) => a.id === dup.id);
  assert.equal(copy.fibers.length, 24);
  assert.ok(copy.terminals.every((t: { links: unknown[] }) => !t.links.length));
  await ok(`/api/assets/${copy.id}`, { version: copy.version }, "DELETE");
  const imported = await ok(
    "/api/imports",
    {
      filename: "qa.kml",
      source: Buffer.from(xml).toString("base64"),
      projectName: "Importação QA",
      selected: [
        { id: 0, kind: "IMPORTED", fiberCount: 12 },
        { id: 1, kind: "CTO", fiberCount: 12 },
        { id: 2, kind: "COVERAGE", fiberCount: 12 },
      ],
    },
    "POST",
    201,
  );
  assert.equal(imported.count, 3);
  assert.equal(
    (
      await call("/api/imports", {
        filename: "qa.kml",
        source: Buffer.from(xml).toString("base64"),
        projectName: "Outra",
        selected: [{ id: 0, kind: "IMPORTED", fiberCount: 12 }],
      })
    ).status,
    409,
  );
  assets = await ok("/api/network");
  const generic = assets.find((a: { name: string }) => a.name === "Rota KML");
  await ok(`/api/assets/${generic.id}/convert`, {
    kind: "DISTRIBUTION",
    fiberCount: 12,
    ports: 8,
    inputs: 1,
    insertionLossDb: 10.5,
    version: generic.version,
    confirm: true,
  });
  assets = await ok("/api/network");
  assert.equal(
    assets.find((a: { id: string }) => a.id === generic.id).fibers.length,
    12,
  );
  const zip = new JSZip();
  zip.file("doc.kml", xml.replace("Rota KML", "Rota KMZ"));
  await ok(
    "/api/imports",
    {
      filename: "qa.kmz",
      source: (await zip.generateAsync({ type: "nodebuffer" })).toString(
        "base64",
      ),
      projectName: "Importação KMZ",
      selected: [{ id: 0, kind: "BACKBONE", fiberCount: 24 }],
    },
    "POST",
    201,
  );
  const invalid = {
    ...edit,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 1],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ],
    },
    kind: "COVERAGE",
    code: "INVALID",
  };
  assert.equal((await call("/api/network", invalid)).status, 400);
  const foreign = await db.networkProject.create({
    data: { name: "Outro", organizationId: other },
  });
  assert.equal(
    (
      await call("/api/network", {
        code: "FOREIGN",
        name: "Inválido",
        kind: "POP",
        status: "PLANNED",
        geometry: { type: "Point", coordinates: [0, 0] },
        projectId: foreign.id,
      })
    ).status,
    404,
  );
  assert.equal((await call("/api/map", undefined, "GET", other)).status, 403);
  const backup = await ok("/api/backup");
  assert.equal(backup.format, "FiberMap");
  assert.equal(backup.imports.length, 2);
  assert.equal(backup.connections.length, 1);
  assert.ok(
    backup.assets.some((a: { parentId: string }) => a.parentId === cto.id),
  );
  assert.ok(!("users" in backup));
  assert.ok(!JSON.stringify(backup).includes(password));
  assert.equal(
    Buffer.from(
      backup.imports.find((i: { filename: string }) => i.filename === "qa.kml")
        .source,
      "base64",
    ).toString(),
    xml,
  );
  await ok(`/api/connections/${connection.id}`, {}, "DELETE");
  const refreshed = await ok("/api/network");
  const last = refreshed.find((a: { id: string }) => a.id === cable.id);
  await ok(`/api/assets/${cable.id}`, { version: last.version }, "DELETE");
  await db.membership.update({
    where: { userId_organizationId: { userId: user, organizationId: org } },
    data: { role: "VIEWER" },
  });
  assert.equal(
    (await call("/api/map", { type: "project", name: "Proibido" })).status,
    403,
  );
  assert.equal(
    (await call(`/api/assets/${cto.id}`, { ...cto, name: "Proibido" }, "PATCH"))
      .status,
    403,
  );
  console.log(
    "PASS editor HTTP: projetos/camadas, 24 fibras, padrão por projeto, CTO/splitter8, conexões, segmentação sem perda, edição/versionamento, status, cópia, KML/KMZ, conversão, geometria inválida, backup, isolamento e perfil.",
  );
} finally {
  await db.$transaction(async (tx) => {
    await tx.connectionTerminal.deleteMany({
      where: { organizationId: { in: [org, other] } },
    });
    await tx.networkConnection.deleteMany({
      where: { organizationId: { in: [org, other] } },
    });
  });
  await db.internalLink.deleteMany({
    where: { organizationId: { in: [org, other] } },
  });
  await db.opticalTerminal.deleteMany({
    where: { organizationId: { in: [org, other] } },
  });
  await db.fiberStrand.deleteMany({
    where: { asset: { organizationId: { in: [org, other] } } },
  });
  await db.cableSegment.deleteMany({
    where: { organizationId: { in: [org, other] } },
  });
  await db.asset.updateMany({
    where: { organizationId: { in: [org, other] } },
    data: { parentId: null },
  });
  await db.asset.deleteMany({
    where: { organizationId: { in: [org, other] } },
  });
  await db.importBatch.deleteMany({
    where: { organizationId: { in: [org, other] } },
  });
  await db.mapLayer.deleteMany({
    where: { organizationId: { in: [org, other] } },
  });
  await db.networkProject.deleteMany({
    where: { organizationId: { in: [org, other] } },
  });
  await db.auditLog.deleteMany({
    where: { organizationId: { in: [org, other] } },
  });
  await db.membership.deleteMany({
    where: { organizationId: { in: [org, other] } },
  });
  await db.organization.deleteMany({ where: { id: { in: [org, other] } } });
  await db.user.deleteMany({ where: { id: user } });
  await db.$disconnect();
}
