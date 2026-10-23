import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../src/lib/db';
const base = process.env.TEST_API_URL;
if (!base || !/^http:\/\/localhost:\d+$/.test(base)) throw new Error('Defina TEST_API_URL para um servidor local exclusivo de verificação.');
const org = randomUUID(), user = randomUUID(), email = `${user}@fibermap.invalid`, password = randomUUID() + randomUUID();
let cookie = '',projectId='';
async function call(path: string, body?: unknown) {
  return fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', origin: base!, cookie, ...(projectId?{'x-project-id':projectId}:{}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
}
try {
  await db.organization.create({data:{id:org,name:'QA HTTP temporário'}});
  await db.user.create({data:{id:user,name:'QA',email}});
  await db.account.create({data:{id:randomUUID(),userId:user,accountId:user,providerId:'credential',password:await hashPassword(password)}});
  await db.membership.create({data:{userId:user,organizationId:org,role:'ADMIN'}});
  assert.equal((await call('/api/network')).status,401);
  const login = await call('/api/auth/sign-in/email',{email,password});
  assert.equal(login.status,200,await login.text());
  cookie = login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  assert.ok(cookie);
  projectId=(await db.networkProject.create({data:{organizationId:org,name:"QA rede HTTP"}})).id;
  const create = async (code:string,kind:string,ports=8,fiberCount=12) => {
    const geometry = ['BACKBONE','DISTRIBUTION'].includes(kind) ? {type:'LineString',coordinates:[[-46.63,-23.55],[-46.64,-23.56]]} : {type:'Point',coordinates:[-46.63,-23.55]};
    const result = await call('/api/network',{code,name:code,kind,status:'INSTALLED',geometry,ports,fiberCount});
    assert.equal(result.status,201,await result.clone().text()); return result.json();
  };
  await create('POP','POP'); await create('OLT','OLT',1); await create('DIO','DIO',1); await create('BB','BACKBONE',8,24); await create('CE','CLOSURE'); await create('DIST','DISTRIBUTION',8,12); await create('CTO','CTO'); await create('SP','SPLITTER'); await create('CLIENT','CUSTOMER');
  const assets = await (await call('/api/network')).json();
  const get = (code:string) => assets.find((a:{code:string})=>a.code===code);
  const terminal = (code:string,label:string) => get(code).terminals.find((t:{label:string})=>t.label===label).id;
  const connect = async (a:string,b:string,kind='PATCH') => { const r = await call('/api/connections',{a,b,kind}); assert.equal(r.status,201,await r.clone().text()); };
  await connect(terminal('OLT','Porta 1'),terminal('DIO','Porta 1'));
  await connect(terminal('DIO','Porta 1 · traseira'),terminal('BB','7/A'));
  await connect(terminal('BB','7/B'),terminal('DIST','3/A'),'SPLICE');
  await connect(terminal('DIST','3/B'),terminal('SP','Entrada 1'));
  await connect(terminal('SP','Saída 4'),terminal('CTO','Porta 4 · traseira'));
  await connect(terminal('CTO','Porta 4'),terminal('CLIENT','Porta 1'));
  const trace = await call('/api/trace?terminal='+terminal('CLIENT','Porta 1'));
  assert.equal(trace.status,200);
  const paths = await trace.json(); assert.equal(paths.length,1); assert.equal(paths[0].outcome,'Porta PON encontrada');
  assert.equal(get('BB').fibers.length,24); assert.equal(get('DIST').fibers.length,12);
  const duplicate = await call('/api/connections',{a:terminal('CTO','Porta 4'),b:terminal('SP','Saída 5'),kind:'PATCH'}); assert.equal(duplicate.status,409);
  const invalid = await call('/api/connections',{a:terminal('CTO','Porta 5'),b:terminal('SP','Saída 5'),kind:'SPLICE'}); assert.equal(invalid.status,400);
  const updated = await (await call('/api/network')).json(); assert.equal(updated.find((a:{code:string})=>a.code==='CTO').terminals.filter((t:{label:string;links:unknown[]})=>!t.label.includes('traseira') && t.links.length).length,1);
  await db.membership.update({where:{userId_organizationId:{userId:user,organizationId:org}},data:{role:'VIEWER'}});
  const denied = await call('/api/network',{code:'DENIED',name:'Denied',kind:'POP',status:'PLANNED',geometry:{type:'Point',coordinates:[0,0]}}); assert.equal(denied.status,403);
  const foreign = await fetch(base+'/api/network',{headers:{cookie,'x-organization-id':randomUUID()}}); assert.equal(foreign.status,403);
  console.log('PASS HTTP: sessão, 9 cadastros, 24/12 fibras, circuito cliente→PON, ocupação, duplicidade, conexão inválida, perfil e isolamento.');
} finally {
  await db.$transaction(async tx=>{await tx.connectionTerminal.deleteMany({where:{organizationId:org}});await tx.networkConnection.deleteMany({where:{organizationId:org}});});
  await db.internalLink.deleteMany({where:{organizationId:org}});await db.opticalTerminal.deleteMany({where:{organizationId:org}});await db.fiberStrand.deleteMany({where:{asset:{organizationId:org}}});await db.asset.deleteMany({where:{organizationId:org}});await db.auditLog.deleteMany({where:{organizationId:org}});await db.projectGrant.deleteMany({where:{organizationId:org}});await db.networkProject.deleteMany({where:{organizationId:org}});await db.membership.deleteMany({where:{organizationId:org}});await db.administrativeAudit.deleteMany({where:{organizationId:org}});await db.license.deleteMany({where:{organizationId:org}});await db.organization.delete({where:{id:org}});await db.user.deleteMany({where:{id:user}});await db.$disconnect();
}
