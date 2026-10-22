import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db } from './db';
const deploymentHosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter((host): host is string => Boolean(host));
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
  trustedOrigins: ['https://fibermap-five.vercel.app','https://fibermap-micheloliveira96.vercel.app',...deploymentHosts.map(host => `https://${host}`)],
  database: prismaAdapter(db, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({user,url}) => {
      if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw Error('Recuperação por e-mail não configurada.');
      const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:user.email,subject:'Recuperação de acesso FiberMap',text:`Use este link para redefinir sua senha: ${url}\nSe não solicitou, ignore esta mensagem.`}),signal:AbortSignal.timeout(10000)});
      if(!result.ok)throw Error('Não foi possível enviar o e-mail de recuperação.');
    },
  },
  session: { cookieCache: { enabled: false } },
  rateLimit: { enabled: true },
});
