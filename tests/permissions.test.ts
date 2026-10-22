import { describe,it,expect } from 'vitest';
import type { Membership } from '@prisma/client';
import { allPermissions,effectivePermissions } from '../src/lib/permissions';
const owner:Membership={id:'o',userId:'u0',organizationId:'a',role:'OWNER',active:true,customPermissions:true,permissions:[],delegable:[],parentId:null};
const admin:Membership={...owner,id:'a',userId:'u1',role:'ADMIN',parentId:'o',permissions:['map.view','cto.create','users.create'],delegable:['map.view','cto.create']};
const worker:Membership={...owner,id:'w',userId:'u2',role:'OPERATOR',parentId:'a',permissions:['map.view','cto.create'],delegable:[]};
describe('Permissões efetivas e revogação em cadeia',()=>{
 it('mantém os poderes do proprietário separados da administração global',()=>expect(effectivePermissions(owner,[owner])).toEqual(allPermissions));
 it('limita o subordinado ao que o superior pode delegar',()=>expect(effectivePermissions(worker,[owner,admin,worker])).toEqual(['map.view','cto.create']));
 it('revoga imediatamente uma permissão retirada do superior',()=>expect(effectivePermissions(worker,[owner,{...admin,permissions:['map.view']},worker])).toEqual(['map.view']));
 it('suspensão do superior bloqueia a cadeia',()=>expect(effectivePermissions(worker,[owner,{...admin,active:false},worker])).toEqual([]));
 it('rejeita ciclos e cargos de mesmo nível na cadeia',()=>expect(effectivePermissions({...worker,role:'ADMIN'},[owner,admin,worker])).toEqual([]));
 it('um visualizador não recebe escrita mesmo com dados inválidos',()=>expect(effectivePermissions({...worker,role:'VIEWER'},[owner,admin,worker])).toEqual(['map.view']));
});
