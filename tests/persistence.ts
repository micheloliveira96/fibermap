import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { graph, strands, trace } from '../src/lib/network';
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL deve apontar para um banco exclusivo com sufixo _test e migrações aplicadas.');
const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const organizationId = randomUUID();
try {
  await db.organization.create({ data: { id: organizationId, name: 'Teste automatizado isolado' } });
  const asset = async (code: string, kind: 'POP'|'OLT'|'DIO'|'CTO'|'CLOSURE'|'SPLITTER'|'CUSTOMER'|'BACKBONE'|'DISTRIBUTION', count = 0) => {
    const cable = count > 0;
    return db.$transaction(async tx => {
      const a = await tx.asset.create({ data: { organizationId, code, name: code, kind, status: 'INSTALLED', geometry: cable ? { type:'LineString',coordinates:[[-46.63,-23.55],[-46.64,-23.56]] } : {type:'Point',coordinates:[-46.63,-23.55]}, metadata: { insertionLossDb: 10.5 } } });
      await tx.$executeRaw`UPDATE "Asset" SET spatial = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(a.geometry)}),4326) WHERE id = ${a.id}`;
      for (const s of strands(count || 1).slice(0,count)) {
        const f = await tx.fiberStrand.create({ data: { assetId:a.id,...s } });
        await tx.opticalTerminal.createMany({ data: [{organizationId,assetId:a.id,fiberId:f.id,label:`${s.number}/A`,kind:'FIBER_A'}, {organizationId,assetId:a.id,fiberId:f.id,label:`${s.number}/B`,kind:'FIBER_B'}] });
      }
      return a;
    });
  };
  const pop = await asset('POP','POP'), olt = await asset('OLT','OLT'), dio = await asset('DIO','DIO'), backbone = await asset('BB','BACKBONE',24), closure = await asset('CE','CLOSURE'), distribution = await asset('DIST','DISTRIBUTION',12), cto = await asset('CTO','CTO'), splitter = await asset('SP','SPLITTER'), customer = await asset('CLIENTE','CUSTOMER');
  const port = (assetId: string,label: string,kind: 'PON'|'DIO'|'CTO'|'SPLITTER_IN'|'SPLITTER_OUT'|'CUSTOMER') => db.opticalTerminal.create({data:{organizationId,assetId,label,kind}});
  const pon = await port(olt.id,'1/1/3','PON'), dp = await port(dio.id,'12','DIO'), cp = await port(cto.id,'04','CTO'), input = await port(splitter.id,'Entrada','SPLITTER_IN'), client = await port(customer.id,'Drop','CUSTOMER');
  const outputs = [];
  for(let i=1;i<=8;i++) outputs.push(await port(splitter.id,String(i),'SPLITTER_OUT'));
  for(let i=1;i<=8;i++) if(i!==4) await port(cto.id,String(i),'CTO');
  const fiber = async (assetId: string,label: string) => db.opticalTerminal.findFirstOrThrow({where:{assetId,label}});
  const bbA = await fiber(backbone.id,'7/A'), bbB = await fiber(backbone.id,'7/B'), distA = await fiber(distribution.id,'3/A'), distB = await fiber(distribution.id,'3/B');
  const connect = (a: string,b: string,kind: 'PATCH'|'SPLICE'|'DOCUMENTARY'='PATCH') => db.$transaction(async tx => {
    const connection = await tx.networkConnection.create({data:{organizationId,kind,tray:kind==='SPLICE' ? closure.code+'/Bandeja 1' : null}});
    await tx.connectionTerminal.createMany({data:[a,b].map(terminalId=>({terminalId,organizationId,connectionId:connection.id}))});
    return connection;
  });
  await connect(pon.id,dp.id); // DIO adapter has separate front/back terminals.
  const dioBack = await port(dio.id,'12 traseira','DIO');
  await connect(dioBack.id,bbA.id);
  await db.internalLink.create({ data: { organizationId, assetId: dio.id, aId: dp.id, bId: dioBack.id } });
  await connect(bbB.id,distA.id,'SPLICE'); await connect(distB.id,input.id); await connect(outputs[3].id,cp.id); await connect(client.id,(await port(cto.id,'04 face cliente','CTO')).id);
  const ctoFace = await db.opticalTerminal.findFirstOrThrow({where:{assetId:cto.id,label:'04 face cliente'}});
  await db.internalLink.create({ data: { organizationId, assetId: cto.id, aId: cp.id, bId: ctoFace.id } });
  const [allAssets,nodes,connections] = await Promise.all([db.asset.findMany({where:{organizationId}}),db.opticalTerminal.findMany({where:{organizationId}}),db.networkConnection.findMany({where:{organizationId},include:{terminals:true}})]);
  const persistedAdapters = await db.internalLink.findMany({where:{organizationId}});
  const paths = trace(client.id,nodes,graph(allAssets,nodes,connections,persistedAdapters));
  const complete = paths.find(p=>p.outcome==='Porta PON encontrada');
  assert.ok(complete); assert.deepEqual(complete.nodes.map(n=>n.id),[client.id,ctoFace.id,cp.id,outputs[3].id,input.id,distB.id,distA.id,bbB.id,bbA.id,dioBack.id,dp.id,pon.id]);
  assert.equal(await db.fiberStrand.count({where:{assetId:backbone.id}}),24);
  assert.equal(await db.fiberStrand.count({where:{assetId:distribution.id}}),12);
  await assert.rejects(connect(bbB.id,input.id));
  await assert.rejects(db.asset.delete({where:{id:backbone.id}}));
  const before = await db.asset.count({where:{organizationId}});
  await assert.rejects(db.$transaction(async tx=>{ await tx.asset.create({data:{organizationId,code:'ROLLBACK',name:'Rollback',kind:'POP',geometry:{type:'Point',coordinates:[0,0]}}}); throw new Error('Falha simulada'); }));
  assert.equal(await db.asset.count({where:{organizationId}}),before);
  const spatial = await db.$queryRaw<{meters:number}[]>`SELECT ST_Length(spatial::geography) AS meters FROM "Asset" WHERE id = ${backbone.id}`;
  assert.ok(spatial[0].meters > 1000);
  assert.equal(await db.asset.count({where:{organizationId:randomUUID()}}),0);
  assert.ok(pop && closure);
  console.log('PASS: persistência de 24/12 fibras, rota geográfica, rastreamento relido, restrições, rollback e isolamento de consulta.');
} finally {
  await db.$transaction(async tx => { await tx.connectionTerminal.deleteMany({where:{organizationId}}); await tx.networkConnection.deleteMany({where:{organizationId}}); }); await db.internalLink.deleteMany({where:{organizationId}}); await db.opticalTerminal.deleteMany({where:{organizationId}}); await db.fiberStrand.deleteMany({where:{asset:{organizationId}}}); await db.asset.deleteMany({where:{organizationId}}); await db.organization.deleteMany({where:{id:organizationId}}); await db.$disconnect();
}
