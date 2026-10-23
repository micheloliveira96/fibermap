import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { graph } from "../src/lib/network";
import {
  accessPorts,
  defaultLayout,
  splitterPorts,
  type DiagramData,
  type DiagramDraft,
  endpointColor,
} from "../src/lib/diagram-types";
const base = process.env.TEST_API_URL;
if (!base || !/^http:\/\/localhost:\d+$/.test(base))
  throw Error("Use apenas servidor e banco locais.");
if (
  !new URL(process.env.DATABASE_URL!).hostname.match(
    /^(localhost|127\.0\.0\.1)$/,
  )
)
  throw Error("Banco de testes deve ser local.");
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
let current: DiagramData;
const draft = (): DiagramDraft => ({
  accesses: structuredClone(current.accesses),
  splitters: [],
  links: structuredClone(current.connections),
  layout: structuredClone(current.layout),
});
async function save(id: string, d: DiagramDraft, status = 200) {
  const r = await call(
    `/api/diagrams/${id}`,
    { ...d, version: current.version, revision: current.revision },
    "PUT",
  );
  assert.equal(r.status, status, await r.clone().text());
  if (status === 200) current = await r.json();
  return r;
}
try {
  await db.organization.createMany({
    data: [
      { id: org, name: "QA diagramas" },
      { id: other, name: "QA outra empresa" },
    ],
  });
  await db.user.create({ data: { id: user, name: "QA diagramas", email } });
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
  assert.equal((await call("/api/diagrams/none")).status, 401);
  assert.equal((await call("/api/help/manual")).status, 401);
  const login = await call("/api/auth/sign-in/email", { email, password });
  assert.equal(login.status, 200, await login.clone().text());
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const manual = await call("/api/help/manual");
  assert.equal(manual.status, 200);
  assert.equal(manual.headers.get("content-type"), "application/pdf");
  assert.match(manual.headers.get("content-disposition")!, /^inline;/);
  assert.deepEqual(
    Buffer.from(await manual.arrayBuffer()),
    await readFile("resources/Manual_FiberMap.pdf"),
  );
  const download = await call("/api/help/manual?download=1");
  assert.match(download.headers.get("content-disposition")!, /^attachment;/);
  assert.equal((await call("/ajuda")).status, 200);
  const point = { type: "Point", coordinates: [-46.63, -23.55] };
  const create = (code: string, kind: string, geometry: unknown, extra = {}) =>
    ok(
      "/api/network",
      { code, name: code, kind, status: "INSTALLED", geometry, ...extra },
      "POST",
      201,
    );
  const box = await create("CE-QA", "CLOSURE", point),
    box2 = await create("CE-QA-2", "CLOSURE", {
      type: "Point",
      coordinates: [-46.64, -23.55],
    }),
    dio = await create("DIO-QA", "DIO", point, { ports: 8 });
  const a = await create(
      "CAB-A",
      "BACKBONE",
      {
        type: "LineString",
        coordinates: [point.coordinates, [-46.64, -23.55]],
      },
      { fiberCount: 24 },
    ),
    b = await create(
      "CAB-B",
      "DISTRIBUTION",
      {
        type: "LineString",
        coordinates: [point.coordinates, [-46.65, -23.56]],
      },
      { fiberCount: 24 },
    );
  const mid = await create(
    "CAB-SANGRIA",
    "BACKBONE",
    {
      type: "LineString",
      coordinates: [
        [-46.66, -23.55],
        [-46.61, -23.55],
      ],
    },
    { fiberCount: 12 },
  );
  const beforeGeo = JSON.stringify(
    (
      await db.asset.findMany({
        where: { organizationId: org },
        orderBy: { id: "asc" },
      })
    ).map((a) => [a.id, a.geometry]),
  );
  current = await ok(`/api/diagrams/${box.id}`);
  assert.equal(current.accesses.length, 2);
  assert.equal(current.equipment.id, box.id);
  assert.equal(
    current.assets.find((x) => x.id === a.id)!.fibers[0].color,
    "Azul",
  );
  const getPort = (assetId: string, number: number) => {
    const asset = current.assets.find((x) => x.id === assetId)!,
      access = current.accesses.find((x) => x.cableId === assetId)!;
    return accessPorts(asset, access).find(
      (p) => p.fiberId === asset.fibers.find((f) => f.number === number)!.id,
    )!.id;
  };
  const a1 = getPort(a.id, 1),
    b7 = getPort(b.id, 7);
  let d = draft();
  d.links.push({
    id: randomUUID(),
    a: a1,
    b: b7,
    kind: "SPLICE",
    tray: "Bandeja 1",
  });
  await save(box.id, d);
  assert.equal(current.connections.length, 1);
  assert.equal(current.connections[0].actorId, user);
  d = draft();
  for (let i = 2; i <= 6; i++)
    d.links.push({
      id: randomUUID(),
      a: getPort(a.id, i),
      b: getPort(b.id, 14 - i),
      kind: "SPLICE",
      tray: "Lote invertido",
    });
  await save(box.id, d);
  assert.equal(current.connections.length, 6);
  d = draft();
  d.links.push({
    id: randomUUID(),
    a: a1,
    b: getPort(b.id, 1),
    kind: "SPLICE",
    tray: "",
  });
  await save(box.id, d, 409);
  assert.equal(
    await db.networkConnection.count({ where: { organizationId: org } }),
    6,
  );
  d = draft();
  d.links = d.links.filter((l) => l.a !== a1);
  await save(box.id, d);
  assert.equal(current.connections.length, 5);
  d = draft();
  d.links.push({
    id: randomUUID(),
    a: a1,
    b: getPort(b.id, 1),
    kind: "PASS_THROUGH",
    tray: "",
  });
  await save(box.id, d, 400);
  const access = {
    id: randomUUID(),
    cableId: mid.id,
    end: "MID" as const,
    fraction: 0.4,
    fiberStates: {},
  };
  const cable = current.assets.find((x) => x.id === mid.id)!;
  const midports = accessPorts(cable, access);
  d = draft();
  d.accesses.push(access);
  for (const f of cable.fibers) {
    const ps = midports.filter((p) => p.fiberId === f.id);
    d.links.push({
      id: randomUUID(),
      a: ps[0].id,
      b: ps[1].id,
      kind: "PASS_THROUGH",
      tray: "",
    });
  }
  await save(box.id, d);
  assert.equal(
    current.connections.filter((c) => c.kind === "PASS_THROUGH").length,
    12,
  );
  const midFiber = cable.fibers[0],
    faces = midports.filter((p) => p.fiberId === midFiber.id);
  d = draft();
  d.links = d.links.filter(
    (l) => !(l.a === faces[0].id && l.b === faces[1].id),
  );
  const splitId = randomUUID();
  d.splitters.push({
    id: splitId,
    name: "Splitter de teste",
    code: "SPL-QA",
    ports: 8,
  });
  const input = splitterPorts(splitId, 8)[0].id;
  d.links.push({
    id: randomUUID(),
    a: faces[0].id,
    b: input,
    kind: "PATCH",
    tray: "Entrada",
  });
  d.layout = {
    ...defaultLayout,
    theme: "light",
    nodes: {
      [a.id]: { x: 120, y: 180, tube: 2, collapsed: true },
      [splitId]: { x: 650, y: 120, tube: 1, collapsed: false },
    },
    viewport: { x: 20, y: 30, zoom: 0.65 },
  };
  await save(box.id, d);
  assert.equal(
    current.assets.find((x) => x.id === splitId)!.terminals.length,
    9,
  );
  assert.equal(current.connections.filter((l) => l.kind === "PATCH").length, 1);
  const reopened: DiagramData = await ok(`/api/diagrams/${box.id}`);
  assert.deepEqual(reopened.layout, current.layout);
  assert.deepEqual(reopened.connections, current.connections);
  assert.equal(reopened.version, current.version);
  const persisted = await db.opticalTerminal.findMany({
      where: { organizationId: org },
    }),
    connections = await db.networkConnection.findMany({
      where: { organizationId: org },
      include: { terminals: true },
    });
  const edges = graph(
    await db.asset.findMany({ where: { organizationId: org } }),
    persisted,
    connections,
  );
  const ends = persisted.filter(
    (p) => p.fiberId === midFiber.id && !p.attachmentId,
  );
  assert(
    !edges.some(
      (e) => ends.some((x) => x.id === e.a) && ends.some((x) => x.id === e.b),
    ),
  );
  assert(
    edges.some(
      (e) =>
        (e.a === faces[0].id && e.b === input) ||
        (e.b === faces[0].id && e.a === input),
    ),
  );
  // Restore a cut fiber, then remove it again: actual continuity is separate from a splice.
  d = draft();
  d.links = d.links.filter((l) => l.b !== input);
  d.links.push({
    id: randomUUID(),
    a: faces[0].id,
    b: faces[1].id,
    kind: "PASS_THROUGH",
    tray: "",
  });
  await save(box.id, d);
  d = draft();
  d.links = d.links.filter((l) => l.a !== faces[0].id && l.b !== faces[0].id);
  d.accesses.find((x) => x.cableId === mid.id)!.fiberStates[midFiber.id] =
    "RESERVED";
  await save(box.id, d);
  d = draft();
  d.links.push({
    id: randomUUID(),
    a: faces[0].id,
    b: input,
    kind: "PATCH",
    tray: "",
  });
  await save(box.id, d, 409);
  const otherBox = await db.asset.create({
    data: {
      organizationId: other,
      code: "OTHER",
      name: "Outra caixa",
      kind: "CLOSURE",
      geometry: point,
    },
  });
  assert.equal((await call(`/api/diagrams/${otherBox.id}`)).status, 404);
  assert.equal(
    (await call(`/api/diagrams/${box.id}`, undefined, "GET", other)).status,
    403,
  );
  const oldVersion = current.version,
    oldRevision = current.revision,
    stale = draft();
  d = draft();
  d.layout.names = false;
  await save(box.id, d);
  const conflict = await call(
    `/api/diagrams/${box.id}`,
    { ...stale, version: oldVersion, revision: oldRevision },
    "PUT",
  );
  assert.equal(conflict.status, 409);
  const concurrentBody = {
    ...draft(),
    version: current.version,
    revision: current.revision,
  };
  const simultaneous = await Promise.all([
    call(`/api/diagrams/${box.id}`, concurrentBody, "PUT"),
    call(`/api/diagrams/${box.id}`, concurrentBody, "PUT"),
  ]);
  assert.deepEqual(simultaneous.map((r) => r.status).sort(), [200, 409]);
  current = await ok(`/api/diagrams/${box.id}`);
  // Replacing a link in a second box must leave the first box and cable identity intact.
  const firstConnections = JSON.stringify(current.connections);
  const firstVersion = current.version;
  const firstState = current;
  current = await ok(`/api/diagrams/${box2.id}`);
  assert.equal(current.accesses[0].end, "B");
  d = draft();
  await save(box2.id, d);
  assert.equal((await ok(`/api/diagrams/${box.id}`)).version, firstVersion);
  assert.equal(
    JSON.stringify((await ok(`/api/diagrams/${box.id}`)).connections),
    firstConnections,
  );
  current = firstState;
  const dioState: DiagramData = await ok(`/api/diagrams/${dio.id}`);
  assert.equal(dioState.equipment.terminals.length, 16);
  current = await ok(`/api/diagrams/${box.id}`);
  // Multi-splitter batches preserve old links and port IDs; colors are endpoint data.
  const originalConnections = structuredClone(current.connections);
  const extraSplitters = [randomUUID(), randomUUID(), randomUUID()];
  d = draft();
  for (const [i, splitter] of extraSplitters.entries()) {
    d.splitters.push({
      id: splitter,
      code: `SPL-BATCH-${i}`,
      name: `Lote ${i}`,
      ports: [8, 4, 2][i],
    });
    d.links.push({
      id: randomUUID(),
      a: getPort(a.id, 14 + i),
      b: splitterPorts(splitter, [8, 4, 2][i])[0].id,
      kind: "PATCH",
      tray: "Lote de entradas",
    });
    d.links.push({
      id: randomUUID(),
      a: splitterPorts(splitter, [8, 4, 2][i])[1].id,
      b: getPort(b.id, 14 + i),
      kind: "PATCH",
      tray: "Lote de saídas",
    });
  }
  const colorPort = `${extraSplitters[0]}:in`;
  d.portColors = { [colorPort]: "#aa3344" };
  await save(box.id, d);
  for (const existing of originalConnections)
    assert.deepEqual(
      current.connections.find((c) => c.id === existing.id),
      existing,
    );
  let identified = current.assets
    .find((x) => x.id === extraSplitters[0])!
    .terminals.find((p) => p.id === colorPort)!;
  assert.equal(identified.identificationColor, "#aa3344");
  const count = current.connections.length;
  d = draft();
  d.links.push({
    id: randomUUID(),
    a: getPort(a.id, 20),
    b: `${extraSplitters[1]}:out:2`,
    kind: "PATCH",
    tray: "Livre mas deve reverter",
  });
  d.links.push({
    id: randomUUID(),
    a: getPort(a.id, 21),
    b: colorPort,
    kind: "PATCH",
    tray: "Ocupada",
  });
  d.portColors = { [colorPort]: "#bb5566" };
  await save(box.id, d, 409);
  current = await ok(`/api/diagrams/${box.id}`);
  assert.equal(current.connections.length, count);
  assert.equal(
    current.assets
      .find((x) => x.id === extraSplitters[0])!
      .terminals.find((p) => p.id === colorPort)!.identificationColor,
    "#aa3344",
  );
  d = draft();
  d.portColors = { [a1]: "#123456" };
  await save(box.id, d, 400);
  d = draft();
  d.portColors = { [colorPort]: null };
  await save(box.id, d);
  identified = current.assets
    .find((x) => x.id === extraSplitters[0])!
    .terminals.find((p) => p.id === colorPort)!;
  assert.equal(identified.identificationColor, null);
  // Compatible splitter output -> splitter input, using existing terminals.
  d = draft();
  d.links.push({
    id: randomUUID(),
    a: `${extraSplitters[0]}:out:2`,
    b: input,
    kind: "PATCH",
    tray: "Cascata",
  });
  await save(box.id, d);
  const fiberId = current.assets.find((x) => x.id === a.id)!.fibers[0].id;
  const colorRevision = current.revision,
    oldDraft = draft();
  await db.fiberStrand.update({
    where: { id: fiberId },
    data: { color: "#123456" },
  });
  await save(box.id, oldDraft, 409);
  current = await ok(`/api/diagrams/${box.id}`);
  assert.notEqual(current.revision, colorRevision);
  assert.equal(
    endpointColor({
      port: current.assets
        .find((x) => x.id === a.id)!
        .terminals.find((p) => p.id === a1)!,
      asset: current.assets.find((x) => x.id === a.id)!,
    }),
    "#123456",
  );
  assert.deepEqual(
    (await ok(`/api/diagrams/${box.id}`)).connections,
    current.connections,
  );
  // Legacy edits are also detected, even without a diagram version increment.
  await db.asset.update({
    where: { id: a.id },
    data: { version: { increment: 1 } },
  });
  await save(box.id, draft(), 409);
  current = await ok(`/api/diagrams/${box.id}`);
  await db.membership.update({
    where: { userId_organizationId: { userId: user, organizationId: org } },
    data: { role: "VIEWER" },
  });
  assert.equal((await ok(`/api/diagrams/${box.id}`)).editable, false);
  await save(box.id, draft(), 403);
  const afterGeo = JSON.stringify(
    (
      await db.asset.findMany({
        where: {
          organizationId: org,
          id: { notIn: [splitId, ...extraSplitters] },
        },
        orderBy: { id: "asc" },
      })
    ).map((a) => [a.id, a.geometry]),
  );
  assert.equal(afterGeo, beforeGeo);
  assert.equal((await call("/api/network")).status, 200);
  assert.equal((await call("/api/map")).status, 200);
  console.log(
    "PASS diagrama HTTP: caixa existente, associação real, fibras/cores, fusão entre cores distintas, lote invertido atômico, ocupação/rollback, remoção, passagem física, sangria/corte, splitter 1:8, entrada, layout/tema, salvar/reabrir, autor, concorrência, edição legada, outra caixa preservada, DIO, permissões, isolamento e rotas/mapa preservados.",
  );
} finally {
  const where = { organizationId: { in: [org, other] } };
  await db.$transaction(async (tx) => {
    await tx.connectionTerminal.deleteMany({ where });
    await tx.networkConnection.deleteMany({ where });
  });
  await db.internalLink.deleteMany({ where });
  await db.opticalTerminal.deleteMany({ where });
  await db.cableAccess.deleteMany({ where });
  await db.opticalDiagram.deleteMany({ where });
  await db.fiberStrand.deleteMany({ where: { asset: where } });
  await db.asset.updateMany({ where, data: { parentId: null } });
  await db.cableSegment.deleteMany({ where });
  await db.asset.deleteMany({ where });
  await db.auditLog.deleteMany({ where });
  await db.membership.deleteMany({ where });
  await db.administrativeAudit.deleteMany({ where });
  await db.license.deleteMany({ where });
  await db.organization.deleteMany({ where: { id: { in: [org, other] } } });
  await db.account.deleteMany({ where: { userId: user } });
  await db.session.deleteMany({ where: { userId: user } });
  await db.user.deleteMany({ where: { id: user } });
  await db.$disconnect();
}
