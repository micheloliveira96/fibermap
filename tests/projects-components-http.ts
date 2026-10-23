import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import {
  accessPorts,
  componentAsset,
  defaultLayout,
  splitterPorts,
  type DiagramData,
  type DiagramDraft,
  type ComponentCreate,
} from "../src/lib/diagram-types";
const base = process.env.TEST_API_URL;
if (
  !base ||
  !/^http:\/\/localhost:\d+$/.test(base) ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw Error("Only isolated local HTTP/database tests are allowed.");
const org = randomUUID(),
  other = randomUUID(),
  user = randomUUID(),
  worker = randomUUID(),
  email = `${user}@fibermap.invalid`,
  workerEmail = `${worker}@fibermap.invalid`,
  password = randomUUID() + randomUUID();
let cookie = "",
  project = "";
async function call(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  pid = project,
  organization = org,
  session = cookie,
) {
  return fetch(base + path, {
    method,
    headers: {
      origin: base!,
      cookie: session,
      "Content-Type": "application/json",
      "x-organization-id": organization,
      ...(pid ? { "x-project-id": pid } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function ok(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  status = 200,
  pid = project,
) {
  const r = await call(path, body, method, pid);
  assert.equal(r.status, status, await r.clone().text());
  return r.json();
}
const point = (x: number) => ({ type: "Point", coordinates: [x, -23.55] });
const route = (x: number, y: number) => ({
  type: "LineString",
  coordinates: [
    [x, -23.55],
    [y, -23.55],
  ],
});
const create = (code: string, kind: string, geometry: unknown, extra = {}) =>
  ok(
    "/api/network",
    { code, name: code, kind, status: "INSTALLED", geometry, ...extra },
    "POST",
    201,
  );
const draft = (d: DiagramData): DiagramDraft => ({
  accesses: structuredClone(d.accesses),
  components: d.components ?? [],
  componentCreates: [],
  splitters: [],
  links: structuredClone(d.connections),
  layout: structuredClone(d.layout),
  portColors: {},
});
async function save(d: DiagramData, changes: DiagramDraft) {
  return ok(
    `/api/diagrams/${d.equipment.id}`,
    { ...changes, version: d.version, revision: d.revision },
    "PUT",
  ) as Promise<DiagramData>;
}
function cablePort(
  d: DiagramData,
  cableId: string,
  fiberNumber: number,
  end?: "A" | "B",
) {
  const a = d.assets.find((a) => a.id === cableId)!,
    access = d.accesses.find((a) => a.cableId === cableId)!;
  return accessPorts(a, access).find(
    (p) =>
      p.fiberId === a.fibers.find((f) => f.number === fiberNumber)!.id &&
      (!end || p.kind === `FIBER_${end}`),
  )!.id;
}
try {
  await db.organization.createMany({
    data: [
      { id: org, name: "QA projetos independentes" },
      { id: other, name: "QA outra empresa projetos" },
    ],
  });
  await db.user.createMany({
    data: [
      { id: user, email, name: "QA responsável" },
      { id: worker, email: workerEmail, name: "QA consulta" },
    ],
  });
  for (const id of [user, worker])
    await db.account.create({
      data: {
        id: randomUUID(),
        userId: id,
        accountId: id,
        providerId: "credential",
        password: await hashPassword(password),
      },
    });
  await db.membership.createMany({
    data: [
      { userId: user, organizationId: org, role: "ADMIN" },
      { userId: worker, organizationId: org, role: "ENGINEER" },
    ],
  });
  const login = await call("/api/auth/sign-in/email", { email, password });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.equal((await call("/api/network")).status, 400);
  const a = await ok(
    "/api/projects",
    { name: "Projeto A", description: "Rede original", region: "Aveiro" },
    "POST",
    201,
  );
  project = a.id;
  assert.equal((await ok("/api/network")).length, 0);
  const pop = await create("POP-01", "POP", point(-46.65));
  const ce = await create("CE-01", "CLOSURE", point(-46.64));
  const cto = await create("CTO-001", "CTO", point(-46.63), { ports: 8 });
  const customer = await create("CLI-01", "CUSTOMER", point(-46.62));
  const backbone = await create("CAB-001", "BACKBONE", route(-46.65, -46.64), {
    fiberCount: 12,
  });
  const distribution = await create(
    "DIST-01",
    "DISTRIBUTION",
    route(-46.64, -46.63),
    { fiberCount: 12 },
  );
  const drop = await create("DROP-01", "DROP", route(-46.63, -46.62), {
    fiberCount: 2,
  });
  const originalGeometries = await db.asset.findMany({
    where: { projectId: project },
    select: { id: true, geometry: true },
    orderBy: { id: "asc" },
  });
  let ceDiagram: DiagramData = await ok(`/api/diagrams/${ce.id}`),
    ceDraft = draft(ceDiagram);
  const fusionId = randomUUID();
  ceDraft.links.push({
    id: fusionId,
    a: cablePort(ceDiagram, backbone.id, 1),
    b: cablePort(ceDiagram, distribution.id, 1),
    kind: "SPLICE",
    tray: "Bandeja 1",
  });
  ceDiagram = await save(ceDiagram, ceDraft);
  let ctoDiagram: DiagramData = await ok(`/api/diagrams/${cto.id}`),
    d = draft(ctoDiagram);
  assert.equal(ctoDiagram.equipment.internalLinks!.length, 8);
  const originalAdapter = ctoDiagram.equipment.internalLinks![0],
    originalAdapterPortIds = [originalAdapter.aId, originalAdapter.bId];
  const splitter = randomUUID(),
    dropAccess = d.accesses.find((a) => a.cableId === drop.id)!;
  dropAccess.bothEnds = true;
  dropAccess.remoteAssetId = customer.id;
  d.components!.push(customer.id);
  d.splitters.push({
    id: splitter,
    code: "SPL-01",
    name: "Splitter da CTO",
    ports: 8,
  });
  const sp = splitterPorts(splitter, 8),
    dropAsset = ctoDiagram.assets.find((a) => a.id === drop.id)!;
  const da = accessPorts(dropAsset, dropAccess).find(
      (p) => p.fiberId === dropAsset.fibers[0].id && p.kind === "FIBER_A",
    )!.id,
    dbp = accessPorts(dropAsset, dropAccess).find(
      (p) => p.fiberId === dropAsset.fibers[0].id && p.kind === "FIBER_B",
    )!.id;
  const customerPort = ctoDiagram.assets.find((a) => a.id === customer.id)!
    .terminals[0].id;
  for (const [from, to] of [
    [cablePort(ctoDiagram, distribution.id, 1), sp[0].id],
    [sp[1].id, originalAdapter.aId],
    [originalAdapter.bId, da],
    [dbp, customerPort],
  ])
    d.links.push({
      id: randomUUID(),
      a: from,
      b: to,
      kind: "PATCH",
      tray: "Atendimento físico",
    });
  ctoDiagram = await save(ctoDiagram, d);
  assert.equal(ctoDiagram.connections.length, 4);
  assert.equal(ctoDiagram.equipment.internalLinks!.length, 8);
  assert.deepEqual(
    (await ok(`/api/assets/${customer.id}/optical-location`)).map(
      (x: { id: string }) => x.id,
    ),
    [cto.id],
  );
  const beforeRename = structuredClone(ctoDiagram.connections);
  for (const [id, name, version] of [
    [cto.id, "CTO renomeada", cto.version],
    [
      splitter,
      "Splitter renomeado",
      ctoDiagram.assets.find((a) => a.id === splitter)!.version,
    ],
    [backbone.id, "Backbone renomeado", backbone.version],
    [pop.id, "POP renomeado", pop.version],
  ] as [string, string, number][]) {
    await ok(`/api/assets/${id}/rename`, { name, version }, "PATCH");
  }
  ctoDiagram = await ok(`/api/diagrams/${cto.id}`);
  assert.equal(ctoDiagram.equipment.name, "CTO renomeada");
  assert.deepEqual(ctoDiagram.connections, beforeRename);
  assert.deepEqual(
    [
      ctoDiagram.equipment.internalLinks![0].aId,
      ctoDiagram.equipment.internalLinks![0].bId,
    ],
    originalAdapterPortIds,
  );
  const adapterUpdate = await ok(
    `/api/adapters/${originalAdapter.id}`,
    { version: originalAdapter.version, name: "Acoplador teste" },
    "PATCH",
  );
  assert.equal(adapterUpdate.adapter.name, "Acoplador teste");
  assert.equal(
    (
      await call(
        `/api/adapters/${originalAdapter.id}`,
        { version: adapterUpdate.adapter.version, status: "RESERVED" },
        "PATCH",
      )
    ).status,
    409,
  );
  let popDiagram: DiagramData = await ok(`/api/diagrams/${pop.id}`),
    pd = draft(popDiagram);
  const components: ComponentCreate[] = [
    {
      id: randomUUID(),
      code: "OLT-01",
      name: "OLT de teste",
      kind: "OLT",
      ports: 4,
      fiberCount: 1,
      slotCount: 2,
      portsPerSlot: 2,
      manufacturer: "Fabricante de teste",
      model: "Modelo físico",
      chassis: "Chassi de teste",
    },
    {
      id: randomUUID(),
      code: "DIO-01",
      name: "DIO físico",
      kind: "DIO",
      ports: 12,
      fiberCount: 1,
    },
    {
      id: randomUUID(),
      code: "CORD-01",
      name: "Cordão PON",
      kind: "PATCHCORD",
      ports: 1,
      fiberCount: 1,
      colorPattern: ["Azul"],
    },
    {
      id: randomUUID(),
      code: "PIG-01",
      name: "Pigtail backbone",
      kind: "PATCHCORD",
      ports: 1,
      fiberCount: 1,
      colorPattern: ["Vermelho"],
    },
  ];
  const [olt, dio, cord, pigtail] = components.map(componentAsset);
  pd.componentCreates = components;
  pd.components!.push(...components.map((c) => c.id));
  for (const c of [cord, pigtail])
    pd.accesses.push({
      id: randomUUID(),
      cableId: c.id,
      end: "A",
      fraction: 0,
      bothEnds: true,
      fiberStates: {},
    });
  const oltPort = olt.terminals[0].id,
    dioFront = dio.internalLinks![0].aId,
    dioRear = dio.internalLinks![0].bId;
  const backbonePort = cablePort(popDiagram, backbone.id, 1);
  for (const [from, to, kind] of [
    [oltPort, cord.terminals[0].id, "PATCH"],
    [cord.terminals[1].id, dioFront, "PATCH"],
    [dioRear, pigtail.terminals[0].id, "PATCH"],
    [pigtail.terminals[1].id, backbonePort, "SPLICE"],
  ] as [string, string, "PATCH" | "SPLICE"][])
    pd.links.push({
      id: randomUUID(),
      a: from,
      b: to,
      kind,
      tray: "Percurso POP",
    });
  pd.layout = {
    ...defaultLayout,
    theme: "dark",
    nodes: {
      [olt.id]: { x: 20, y: 40, tube: 1, collapsed: false },
      [dio.id]: { x: 800, y: 50, tube: 1, collapsed: false },
    },
  };
  popDiagram = await save(popDiagram, pd);
  assert.equal(popDiagram.connections.length, 4);
  assert.equal(
    popDiagram.assets.find((a) => a.id === dio.id)!.internalLinks!.length,
    12,
  );
  const oldLinks = structuredClone(popDiagram.connections),
    oldPorts = popDiagram.assets
      .find((a) => a.id === olt.id)!
      .terminals.map((p) => ({ id: p.id, label: p.label }));
  const portUpdate = await ok(
    `/api/assets/${olt.id}/ports`,
    {
      ports: 8,
      slotCount: 2,
      portsPerSlot: 4,
      version: popDiagram.assets.find((a) => a.id === olt.id)!.version,
      diagramId: pop.id,
      revision: popDiagram.revision,
    },
    "PATCH",
  );
  popDiagram = portUpdate.diagram;
  assert(
    oldPorts.every((old) =>
      popDiagram.assets
        .find((a) => a.id === olt.id)!
        .terminals.some((p) => p.id === old.id && p.label === old.label),
    ),
  );
  assert.deepEqual(popDiagram.connections, oldLinks);
  const dioUpdate = await ok(
    `/api/assets/${dio.id}/ports`,
    {
      ports: 24,
      version: popDiagram.assets.find((a) => a.id === dio.id)!.version,
      diagramId: pop.id,
      revision: popDiagram.revision,
    },
    "PATCH",
  );
  popDiagram = dioUpdate.diagram;
  assert.equal(
    popDiagram.assets.find((a) => a.id === dio.id)!.internalLinks!.length,
    24,
  );
  assert.equal(
    (
      await call(
        `/api/assets/${dio.id}/ports`,
        {
          ports: 12,
          version: popDiagram.assets.find((a) => a.id === dio.id)!.version,
        },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.deepEqual((await ok(`/api/diagrams/${pop.id}`)).connections, oldLinks);
  const persistedGeometries = await db.asset.findMany({
    where: { id: { in: originalGeometries.map((a) => a.id) } },
    select: { id: true, geometry: true },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(persistedGeometries, originalGeometries);
  const snapshot = await ok(`/api/projects/${project}?export=1`);
  assert.equal(snapshot.format, "FiberMapProject");
  assert(!JSON.stringify(snapshot).includes(email));
  assert.equal(snapshot.assets.length, 12);
  const renamed = await ok(
    `/api/projects/${project}`,
    { action: "rename", version: a.version, name: "Projeto A renomeado" },
    "PATCH",
  );
  const duplicated = await ok(
    `/api/projects/${project}`,
    {
      action: "duplicate",
      version: renamed.version,
      name: "Projeto A - cópia",
    },
    "PATCH",
    201,
  );
  const clone = await ok(
    `/api/projects/${duplicated.id}?export=1`,
    undefined,
    "GET",
    200,
    duplicated.id,
  );
  assert.equal(clone.assets.length, snapshot.assets.length);
  assert.equal(clone.connections.length, snapshot.connections.length);
  assert.equal(clone.accesses.length, snapshot.accesses.length);
  assert.equal(clone.diagrams.length, snapshot.diagrams.length);
  const originalIds = new Set(
    snapshot.assets.flatMap((a: any) => [
      a.id,
      ...a.fibers.map((f: any) => f.id),
      ...a.terminals.map((p: any) => p.id),
    ]),
  );
  assert(
    clone.assets
      .flatMap((a: any) => [
        a.id,
        ...a.fibers.map((f: any) => f.id),
        ...a.terminals.map((p: any) => p.id),
      ])
      .every((id: string) => !originalIds.has(id)),
  );
  const imported = await ok(
    "/api/projects",
    { action: "import", name: "Projeto importado", snapshot },
    "POST",
    201,
  );
  assert.equal(
    (await ok("/api/network", undefined, "GET", 200, imported.id)).length,
    12,
  );
  const malformed = structuredClone(snapshot);
  malformed.connections[0].terminals[0].terminalId = "missing";
  const beforeImport = await db.networkProject.count({
    where: { organizationId: org },
  });
  assert.equal(
    (
      await call("/api/projects", {
        action: "import",
        name: "Inválido",
        snapshot: malformed,
      })
    ).status,
    400,
  );
  assert.equal(
    await db.networkProject.count({ where: { organizationId: org } }),
    beforeImport,
  );
  const b = await ok("/api/projects", { name: "Projeto B" }, "POST", 201);
  assert.equal(
    (await ok("/api/network", undefined, "GET", 200, b.id)).length,
    0,
  );
  const savedA = await ok("/api/network");
  project = b.id;
  const sameCode = await create("CTO-001", "CTO", point(-46.6), { ports: 8 });
  assert.equal((await ok("/api/network")).length, 1);
  assert.equal((await call(`/api/diagrams/${cto.id}`)).status, 404);
  assert.equal(
    (
      await call(
        `/api/assets/${cto.id}/rename`,
        { name: "Ataque de projeto", version: cto.version },
        "PATCH",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call("/api/connections", {
        a: customerPort,
        b: (await ok(`/api/diagrams/${sameCode.id}`)).equipment.terminals[0].id,
        kind: "PATCH",
      })
    ).status,
    404,
  );
  await assert.rejects(
    db.$transaction(async (tx) => {
      const conn = await tx.networkConnection.create({
        data: { organizationId: org, projectId: a.id, kind: "PATCH" },
      });
      await tx.connectionTerminal.createMany({
        data: [
          {
            terminalId: ctoDiagram.equipment.internalLinks![1].aId,
            organizationId: org,
            connectionId: conn.id,
          },
          {
            terminalId: (
              await tx.opticalTerminal.findFirstOrThrow({
                where: { assetId: sameCode.id },
              })
            ).id,
            organizationId: org,
            connectionId: conn.id,
          },
        ],
      });
    }),
    /cross projects/,
  );
  project = a.id;
  assert.deepEqual(
    (await ok("/api/network")).map((a: any) => a.id).sort(),
    savedA.map((a: any) => a.id).sort(),
  );
  assert.equal(
    (await ok(`/api/diagrams/${ce.id}`)).connections[0].id,
    fusionId,
  );
  const projectCurrent = await ok(`/api/projects/${project}`);
  const views = await Promise.all([
    call(
      `/api/projects/${project}`,
      {
        action: "save",
        version: projectCurrent.version,
        view: { camera: { lng: -46.6, lat: -23.5, zoom: 15 }, dark: true },
      },
      "PATCH",
    ),
    call(
      `/api/projects/${project}`,
      {
        action: "save",
        version: projectCurrent.version,
        view: { camera: { lng: -46.7, lat: -23.6, zoom: 16 }, dark: false },
      },
      "PATCH",
    ),
  ]);
  assert.deepEqual(views.map((r) => r.status).sort(), [200, 409]);
  let p = await ok(`/api/projects/${project}`);
  assert(p.view.camera);
  p = await ok(
    `/api/projects/${project}`,
    { action: "archive", version: p.version },
    "PATCH",
  );
  assert.equal(
    (
      await call("/api/network", {
        code: "ARCHIVED",
        name: "X",
        kind: "POP",
        status: "INSTALLED",
        geometry: point(-46.6),
      })
    ).status,
    409,
  );
  assert.equal((await ok(`/api/diagrams/${cto.id}`)).editable, false);
  p = await ok(
    `/api/projects/${project}`,
    { action: "restore", version: p.version },
    "PATCH",
  );
  const membership = await db.membership.findFirstOrThrow({
    where: { userId: worker, organizationId: org },
  });
  const workerLogin = await call("/api/auth/sign-in/email", {
    email: workerEmail,
    password,
  });
  assert.equal(workerLogin.status, 200);
  const workerCookie = workerLogin.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  p = await ok(
    `/api/projects/${project}`,
    { action: "access", version: p.version, restricted: true, grants: [] },
    "PATCH",
  );
  assert.equal(
    (await call("/api/network", undefined, "GET", project, org, workerCookie))
      .status,
    403,
  );
  p = await ok(
    `/api/projects/${project}`,
    {
      action: "access",
      version: p.version,
      restricted: true,
      grants: [{ membershipId: membership.id, permissions: ["projects.view"] }],
    },
    "PATCH",
  );
  assert.equal(
    (await call("/api/network", undefined, "GET", project, org, workerCookie))
      .status,
    200,
  );
  assert.equal(
    (
      await call(
        `/api/assets/${cto.id}/rename`,
        { name: "Não permitido", version: cto.version },
        "PATCH",
        project,
        org,
        workerCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/network", undefined, "GET", project, other)).status,
    403,
  );
  const deleteAttempt = await call(
    `/api/projects/${b.id}`,
    { action: "delete", version: b.version, confirm: "errado" },
    "PATCH",
  );
  assert.equal(deleteAttempt.status, 400);
  const deleted = await ok(
    `/api/projects/${b.id}`,
    { action: "delete", version: b.version, confirm: b.name },
    "PATCH",
  );
  assert.equal(
    (await call("/api/network", undefined, "GET", b.id)).status,
    404,
  );
  assert.equal(await db.asset.count({ where: { projectId: b.id } }), 1);
  await ok(
    `/api/projects/${b.id}`,
    { action: "restore", version: deleted.version },
    "PATCH",
  );
  assert.equal(
    (await ok("/api/network", undefined, "GET", 200, b.id)).length,
    1,
  );
  const unscoped = await fetch(base + "/api/network", {
    headers: { cookie, "x-organization-id": org },
  });
  assert.equal(unscoped.status, 400);
  assert.equal((await call("/api/help/manual")).status, 200);
  console.log(
    "PASS projects/components: isolated A/B, same codes, database/API cross-project rejection, scoped tabs and revisions, legacy IDs, renames, 8 couplers IN/OUT, real drop/customer, POP OLT/cord/DIO/pigtail/backbone, port expansion preserving IDs, persistence, snapshot/clone/import remapping and rollback, archive/trash/restore, project grants, company isolation and help.",
  );
} finally {
  if (process.env.KEEP_QA_FIXTURES === "1") {
    await writeFile(
      "tmp/projects-browser-qa.json",
      JSON.stringify({
        organizations: [org, other],
        users: [user, worker],
        email,
        password,
        projectId: project,
      }),
    );
    console.log("Local browser fixtures retained in an ignored file.");
    await db.$disconnect();
  } else {
    const where = { organizationId: { in: [org, other] } };
    await db.$transaction(async (tx) => {
      await tx.connectionTerminal.deleteMany({ where });
      await tx.networkConnection.deleteMany({ where });
    });
    await db.diagramComponent.deleteMany({ where });
    await db.internalLink.deleteMany({ where });
    await db.opticalTerminal.deleteMany({ where });
    await db.cableAccess.deleteMany({ where });
    await db.opticalDiagram.deleteMany({ where });
    await db.fiberStrand.deleteMany({ where: { asset: where } });
    await db.cableSegment.deleteMany({ where });
    await db.asset.updateMany({ where, data: { parentId: null } });
    await db.asset.deleteMany({ where });
    await db.importBatch.deleteMany({ where });
    await db.mapLayer.deleteMany({ where });
    await db.auditLog.deleteMany({ where });
    await db.projectGrant.deleteMany({ where });
    await db.networkProject.deleteMany({ where });
    await db.membership.deleteMany({ where });
    await db.administrativeAudit.deleteMany({ where });
    await db.license.deleteMany({ where });
    await db.organization.deleteMany({ where: { id: { in: [org, other] } } });
    await db.account.deleteMany({ where: { userId: { in: [user, worker] } } });
    await db.session.deleteMany({ where: { userId: { in: [user, worker] } } });
    await db.user.deleteMany({ where: { id: { in: [user, worker] } } });
    await db.$disconnect();
  }
}
