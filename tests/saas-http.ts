import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { allPermissions } from "../src/lib/permissions";
const base = process.env.TEST_API_URL;
if (!base || !/^http:\/\/localhost:\d+$/.test(base))
  throw Error("Use um servidor local exclusivo.");
const uid = randomUUID(),
  email = `${uid}@fibermap.invalid`,
  password = randomUUID() + randomUUID(),
  orgs: string[] = [],
  users: string[] = [uid],
  plans: string[] = [];
const api = "/api/administracao",
  platform = api + "?scope=platform",
  company = api + "?scope=company";
async function call(
  cookie: string,
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  org?: string,
) {
  return fetch(base + path, {
    method,
    headers: {
      origin: base!,
      cookie,
      "Content-Type": "application/json",
      ...(org ? { "x-organization-id": org } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function ok(
  cookie: string,
  path: string,
  body?: unknown,
  method?: string,
  status = 200,
) {
  const r = await call(cookie, path, body, method);
  assert.equal(r.status, status, await r.clone().text());
  return r.json();
}
async function login(mail: string) {
  // Exercise the real login limiter without disabling protection in the app.
  await new Promise(resolve=>setTimeout(resolve,11000));
  const r = await call("", "/api/auth/sign-in/email", {
    email: mail,
    password,
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
async function accept(url: string) {
  const token = new URL(url).searchParams.get("token");
  await ok("", "/api/convites", { token, password });
  return token;
}
const license = (planId: string) => ({
  planId,
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  maxUsers: 3,
  maxProjects: 2,
  maxStorageBytes: 1000000,
  features: allPermissions,
  expiryPolicy: "READ_ONLY",
  billingStatus: "MANUAL",
});
try {
  await db.user.create({
    data: {
      id: uid,
      email,
      name: "QA plataforma",
      accounts: {
        create: {
          id: randomUUID(),
          providerId: "credential",
          accountId: uid,
          password: await hashPassword(password),
        },
      },
    },
  });
  await db.platformAdministrator.create({ data: { userId: uid } });
  const p = await login(email);
  assert.equal((await call("", platform)).status, 401);
  const plan = (
    await ok(p, platform, {
      op: "plan",
      data: {
        name: "QA plano temporário",
        description: "Teste isolado",
        priceCents: 12900,
        currency: "BRL",
        period: "MONTHLY",
        maxUsers: 3,
        maxProjects: 2,
        maxStorageBytes: 1000000,
        features: allPermissions,
        active: true,
      },
    })
  ).result;
  plans.push(plan.id);
  const mails: string[] = [];
  let owner = "",
    other = "";
  for (const label of ["A", "B"]) {
    const mail = `${randomUUID()}@fibermap.invalid`;
    mails.push(mail);
    const created = await ok(p, platform, {
      op: "company.create",
      data: {
        name: "QA SaaS " + label,
        profile: {},
        ownerEmail: mail,
        ownerName: "QA proprietário " + label,
        license: license(plan.id),
      },
    });
    orgs.push(created.result.id);
    assert.ok(created.inviteUrl);
    const token = await accept(created.inviteUrl);
    assert.equal(
      (await call("", "/api/convites", { token, password })).status,
      410,
    );
    const cookie = await login(mail);
    if (label === "A") owner = cookie;
    else other = cookie;
  }
  users.push(
    ...(
      await db.user.findMany({
        where: { email: { in: mails } },
        select: { id: true },
      })
    ).map((x) => x.id),
  );
  assert.equal((await call(owner, platform)).status, 403);
  assert.equal((await call(owner, "/admin/plataforma")).status, 200); // server redirects safely to account (fetch follows)
  const list = await ok(owner, company + "&resource=users"),
    ownerMember = list.items[0];
  const adminMail = `${randomUUID()}@fibermap.invalid`,
    adminPermissions = [
      "map.view",
      "network.view",
      "projects.view",
      "cto.create",
      "cto.edit",
      "users.view",
      "users.create",
      "users.edit",
      "users.suspend",
      "users.permissions",
      "audit.view",
    ];
  const invitation = await ok(owner, company, {
    op: "invite",
    data: {
      name: "QA admin",
      email: adminMail,
      role: "ADMIN",
      permissions: adminPermissions,
      delegable: adminPermissions,
    },
  });
  await accept(invitation.inviteUrl);
  const admin = await login(adminMail);
  users.push(
    (await db.user.findUniqueOrThrow({ where: { email: adminMail } })).id,
  );
  assert.equal(
    (
      await call(admin, company, {
        op: "invite",
        data: {
          name: "Par",
          email: "peer@fibermap.invalid",
          role: "ADMIN",
          permissions: ["map.view"],
          delegable: [],
        },
      })
    ).status,
    403,
  );
  const adminList = await ok(admin, company + "&resource=users"),
    adminMember = adminList.items.find((x: any) => x.user.email === adminMail);
  assert.equal(
    (
      await call(admin, company, {
        op: "user.save",
        id: adminMember.id,
        data: {
          name: "Eu",
          role: "OWNER",
          permissions: allPermissions,
          delegable: allPermissions,
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(admin, company, {
        op: "user.status",
        id: ownerMember.id,
        active: false,
      })
    ).status,
    403,
  );
  const workerMail = `${randomUUID()}@fibermap.invalid`,
    view = ["map.view", "network.view", "projects.view"];
  const workerInvite = await ok(admin, company, {
    op: "invite",
    data: {
      name: "QA operador",
      email: workerMail,
      role: "OPERATOR",
      permissions: view,
      delegable: [],
    },
  });
  assert.equal(
    (
      await call(owner, company, {
        op: "invite",
        data: {
          name: "Quarto",
          email: "fourth@fibermap.invalid",
          role: "VIEWER",
          permissions: view,
          delegable: [],
        },
      })
    ).status,
    409,
  );
  await accept(workerInvite.inviteUrl);
  const worker = await login(workerMail);
  users.push(
    (await db.user.findUniqueOrThrow({ where: { email: workerMail } })).id,
  );
  const asset = {
    code: "QA-CTO",
    name: "CTO QA isolada",
    kind: "CTO",
    status: "PLANNED",
    geometry: { type: "Point", coordinates: [-46.63, -23.55] },
    ports: 8,
  };
  assert.equal((await call(worker, "/api/network", asset)).status, 403);
  const cto = await ok(owner, "/api/network", asset, undefined, 201);
  assert.equal(
    (
      await call(
        worker,
        `/api/assets/${cto.id}`,
        { ...cto, version: 1, name: "Proibido" },
        "PATCH",
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(worker, `/api/assets/${cto.id}`, { version: 1 }, "DELETE"))
      .status,
    403,
  );
  assert.equal((await call(worker, "/api/backup")).status, 403);
  assert.equal(
    (await call(worker, "/api/network", undefined, "GET", orgs[1])).status,
    403,
  );
  assert.ok(
    !(await ok(other, "/api/network")).some((a: any) => a.id === cto.id),
  );
  assert.equal(
    (
      await call(
        other,
        `/api/assets/${cto.id}`,
        { ...cto, version: 1 },
        "PATCH",
      )
    ).status,
    404,
  );
  assert.equal((await call(other, "/api/backup")).status, 200);
  // Direct database cross-company relation must also fail, beyond HTTP filtering.
  const project = await db.networkProject.create({
    data: { organizationId: orgs[1], name: "QA projeto B" },
  });
  await assert.rejects(
    db.asset.update({ where: { id: cto.id }, data: { projectId: project.id } }),
  );
  const workerMember = (
    await ok(admin, company + "&resource=users")
  ).items.find((x: any) => x.user.email === workerMail);
  await ok(admin, company, {
    op: "user.save",
    id: workerMember.id,
    data: {
      name: "QA operador",
      role: "OPERATOR",
      permissions: [...view, "cto.create"],
      delegable: [],
    },
  });
  const freshWorker = await login(workerMail);
  await ok(
    freshWorker,
    "/api/network",
    { ...asset, code: "QA-CTO-2" },
    undefined,
    201,
  );
  await ok(owner, company, {
    op: "user.save",
    id: adminMember.id,
    data: {
      name: "QA admin",
      role: "ADMIN",
      permissions: adminPermissions.filter((p) => p !== "cto.create"),
      delegable: adminPermissions.filter((p) => p !== "cto.create"),
    },
  });
  assert.equal(
    (await call(freshWorker, "/api/network", { ...asset, code: "REVOKED" }))
      .status,
    403,
  );
  await ok(p, platform, {
    op: "company.status",
    id: orgs[0],
    status: "SUSPENDED",
  });
  assert.equal((await call(freshWorker, "/api/network")).status, 401); // company suspension revokes sessions
  await ok(p, platform, {
    op: "company.status",
    id: orgs[0],
    status: "ACTIVE",
  });
  owner = await login(mails[0]);
  await ok(p, platform, {
    op: "license",
    id: orgs[0],
    data: {
      ...license(plan.id),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    },
  });
  assert.equal((await call(owner, "/api/network")).status, 200);
  assert.equal(
    (await call(owner, "/api/network", { ...asset, code: "EXPIRED" })).status,
    403,
  );
  await ok(p, platform, { op: "license", id: orgs[0], data: license(plan.id) });
  const concurrent = await Promise.all(
    Array.from({ length: 4 }, (_, n) =>
      call(owner, "/api/map", { type: "project", name: "QA concorrente " + n }),
    ),
  );
  assert.equal(concurrent.filter((r) => r.status === 200).length, 2);
  assert.equal(
    await db.networkProject.count({ where: { organizationId: orgs[0] } }),
    2,
  );
  assert.ok((await ok(p, platform + "&resource=audits")).total > 0);
  assert.ok(
    (await ok(owner, company + "&resource=audits")).items.every(
      (a: any) => a.organizationId === orgs[0],
    ),
  );
  assert.equal(
    (await db.asset.findUniqueOrThrow({ where: { id: cto.id } })).name,
    "CTO QA isolada",
  );
  console.log(
    "PASS SaaS HTTP: superadmin, planos, duas empresas, convites de uso único, proprietário→admin→operador, limite de 3 vagas, acessos diretos, exportação, FK entre empresas, revogação herdada imediata, sessões suspensas, vencimento somente leitura, concorrência de projetos, auditoria e persistência real.",
  );
} finally {
  const where = { organizationId: { in: orgs } };
  await db.connectionTerminal.deleteMany({ where });
  await db.networkConnection.deleteMany({ where });
  await db.internalLink.deleteMany({ where });
  await db.opticalTerminal.deleteMany({ where });
  await db.fiberStrand.deleteMany({
    where: { asset: { organizationId: { in: orgs } } },
  });
  await db.asset.deleteMany({ where });
  await db.importBatch.deleteMany({ where });
  await db.mapLayer.deleteMany({ where });
  await db.networkProject.deleteMany({ where });
  await db.auditLog.deleteMany({ where });
  await db.administrativeAudit.deleteMany({
    where: {
      OR: [where, { actorId: { in: users } }, { entityId: { in: plans } }],
    },
  });
  await db.userInvitation.deleteMany({ where });
  await db.membership.updateMany({ where, data: { parentId: null } });
  await db.membership.deleteMany({ where });
  await db.license.deleteMany({ where });
  await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.platformAdministrator.deleteMany({ where: { userId: uid } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.subscriptionPlan.deleteMany({ where: { id: { in: plans } } });
  await db.$disconnect();
}
