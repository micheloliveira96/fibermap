import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
import { db } from '@/lib/db';
import { createHash } from 'node:crypto';
const handler=toNextJsHandler(auth);
export const GET=handler.GET;
export async function POST(r:Request){
 const path=new URL(r.url).pathname;
 if(path.endsWith('/request-password-reset')&&(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM))return Response.json({message:'Recuperação por e-mail indisponível. Solicite um link seguro ao administrador.'},{status:503});
 if(!path.endsWith('/sign-in/email'))return handler.POST(r);
 let email='';try{const d=await r.clone().json();email=typeof d.email==='string'?d.email.toLowerCase().slice(0,320):'';}catch{return handler.POST(r);}
 const actorId='login:'+createHash('sha256').update(email).digest('hex');
 const failures=await db.administrativeAudit.count({where:{actorId,action:'LOGIN_FAILURE',createdAt:{gte:new Date(Date.now()-15*60000)}}});
 if(failures>=10)return Response.json({message:'Muitas tentativas. Aguarde 15 minutos.'},{status:429});
 const result=await handler.POST(r);
 const user=result.ok?await db.user.findUnique({where:{email},select:{id:true,memberships:{select:{organizationId:true}}}}):null;
 if(user)await db.user.update({where:{id:user.id},data:{lastLoginAt:new Date()}});
 await db.administrativeAudit.create({data:{actorId:user?.id||actorId,organizationId:user?.memberships[0]?.organizationId,action:result.ok?'LOGIN_SUCCESS':'LOGIN_FAILURE',entityId:user?.id||actorId,detail:{method:'email-password'},result:result.ok?'SUCCESS':'DENIED'}});
 return result;
}
