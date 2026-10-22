import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Use TEST_DATABASE_URL em um banco isolado com sufixo _test.');
const db = new PrismaClient({ datasourceUrl: database });
if (await db.user.count()) { await db.$disconnect(); throw new Error('O banco de teste deve estar sem usuários antes do teste de configuração.'); }
const token = randomBytes(32).toString('base64url'), email = `setup-${randomUUID()}@fibermap.invalid`;
const base = 'http://localhost:3188';
const child = spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--port','3188'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,DATABASE_URL:database,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomBytes(48).toString('hex'),FIBERMAP_SETUP_TOKEN_HASH:createHash('sha256').update(token).digest('hex'),FIBERMAP_SETUP_EXPIRES_AT:String(Date.now()+60000)}});
let serverLog = '';
child.stderr.on('data',data=>{serverLog=(serverLog+data.toString()).slice(-4000);});
let serverError: Error | undefined;
child.on('error', error => { serverError = error; });
try {
  let ready = false;
  for (let i=0;i<30;i++) {
    if (serverError || child.exitCode !== null) throw serverError ?? new Error('Servidor de teste não iniciou.');
    try { const health = await fetch(base+'/api/health'); if(health.ok) {ready=true;break;} } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,'Servidor de teste indisponível.');
  const data = {name:'Administrador de teste',organization:'Organização de teste',email,password:randomBytes(24).toString('base64url')};
  const post = (credential:string, origin=base) => fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json','x-setup-token':credential,origin},body:JSON.stringify(data)});
  assert.equal((await post('invalid')).status,403);
  assert.equal((await post(token,'https://example.invalid')).status,403);
  assert.equal((await post(token)).status,201,serverLog);
  assert.equal((await post(token)).status,409);
  const user = await db.user.findUniqueOrThrow({where:{email},include:{memberships:true,accounts:true}});
  assert.equal(user.memberships[0].role,'ADMIN');
  assert.notEqual(user.accounts[0].password,data.password);
  const login = await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password:data.password})});
  assert.equal(login.status,200);
  console.log('PASS: token inválido, origem externa, configuração transacional, uso único, senha com hash e login real.');
} finally {
  child.kill();
  const user = await db.user.findUnique({where:{email},include:{memberships:true}});
  if(user) {
    for(const member of user.memberships) {await db.auditLog.deleteMany({where:{organizationId:member.organizationId}});await db.membership.deleteMany({where:{organizationId:member.organizationId}});await db.organization.delete({where:{id:member.organizationId}});}
    await db.user.delete({where:{id:user.id}});
  }
  await db.$disconnect();
}
