# FiberMap — administração multiempresa

## Entrega

Implementação sobre o projeto, banco e domínios existentes. Cartografia, satélite padrão, zoom e ferramentas de desenho preservados. O editor recebeu apenas verificação de permissões, bloqueio de exportação e link para a conta.

- Plataforma: dashboard com indicadores persistentes, empresas, cadastro completo e logotipo, planos comerciais, licenças, renovação e bloqueio, redefinição autorizada de proprietário, auditoria global e configurações de identidade/suporte.
- Empresa: utilização, licença, dados cadastrais, usuários, convites, permissões individuais e delegáveis, suspensão, revogação de sessões e links de recuperação de subordinados.
- Hierarquia: proprietário > administrador/engenheiro > operador/técnico > visualizador. Nenhum cargo empresarial concede acesso à plataforma. O servidor rejeita edição da própria conta, pares, superiores, pessoas fora da cadeia de delegação e concessões que o emissor não possui. Permissões efetivas são a interseção com as permissões delegáveis de todos os superiores ativos, consultadas a cada requisição.
- Convites: tokens aleatórios de 256 bits, hash SHA-256 armazenado, validade de 48 horas, uso único, revalidação do emissor na aceitação. E-mail existente exige autenticação na conta existente. Recuperação administrativa só alcança subordinados. Transferência do proprietário é exclusiva da plataforma e só conclui após aceitação.
- Licenças: vagas reservadas por convites pendentes; usuários suspensos continuam ocupando vagas. Bloqueio transacional por empresa e gatilhos PostgreSQL limitam usuários, projetos e bytes dos arquivos KML/KMZ. Vencimento configurável para consulta ou bloqueio total; suspensão/cancelamento impede acesso. Nenhum dado de rede é removido por vencimento.
- Autenticação existente Better Auth preservada: senha com hash, limite de tentativas, registro de sucesso/falha, último login persistente, recuperação e revogação de sessões.

## Acessos

- `/login`: entrada; redireciona superadministrador à plataforma, proprietário à empresa e operadores ao mapa.
- `/admin/plataforma`: painel exclusivo; `/empresas`, `/planos`, `/auditoria`, `/configuracoes` abaixo dessa rota.
- `/empresa/administracao`: painel empresarial; `/usuarios` e `/auditoria` abaixo dessa rota.
- `/conta`: navegação conforme a autorização, sem mostrar o painel da plataforma a usuários comuns.
- `/convite`: primeiro acesso empresarial ou recuperação administrativa por link seguro.
- `/recuperar`: recuperação por e-mail e primeiro acesso do administrador provisionado no servidor.

## Bootstrap seguro

Executar uma única vez com conexão administrativa do PostgreSQL (não o papel restrito de execução):

```powershell
$env:PLATFORM_ADMIN_EMAIL='email-do-proprietario'
$env:PLATFORM_ADMIN_NAME='Nome do proprietário'
npm run bootstrap:platform
```

Uma conta existente mantém sua senha. Se não existir, o comando cria a identidade sem senha e apresenta um link privado de uso único, válido por uma hora, para definir a senha. O link não deve ser incluído em commits, logs públicos ou tickets. O comando usa bloqueio transacional e recusa execução se já houver administrador. Não existe rota pública para criar superadministradores. O papel `fibermap_app` não possui INSERT/UPDATE/DELETE em `PlatformAdministrator`; provisionamento/reparo é um procedimento de servidor, auditado. Alterações em credenciais são concluídas pelo titular.

## Dados e migrações

Prisma `007_saas_administration` adiciona os modelos PlatformAdministrator, SubscriptionPlan, License, UserInvitation, AdministrativeAudit, PlatformSettings, perfil/status da Organization e atributos de delegação da Membership. `008_saas_guards` cria licenças para as organizações existentes, promove apenas o único administrador legado de cada organização a proprietário e adiciona constraints, limites, RLS e privilégios. `009_login_history` mantém o último login e indexa tentativas. `010_capacity_record_guard` corrige a avaliação dos campos variáveis do gatilho de capacidade.

IDs e vínculos dos registros de rede legados não mudam. Licenças legadas não são contratos comerciais fictícios: não recebem plano nem preço inventados. A relação fibra-terminal agora usa chave composta para impedir que um terminal aponte para fibra de outro ativo/empresa. Outras relações de rede já possuem chaves compostas por organização. Há um proprietário por empresa e parentId não pode apontar para outra empresa.

Better Auth não é Supabase Auth. Navegadores não recebem conexão PostgreSQL nem acessam tabelas diretamente. Anon/authenticated não têm privilégios nessas tabelas. RLS protege o acesso direto; o papel compartilhado de servidor tem políticas próprias, enquanto o isolamento entre usuários é aplicado por sessão/associação e filtros nas APIs. Não se afirma que a política do papel compartilhado faz isolamento por tenant sozinha. Auditorias são somente append/read para esse papel. Não há websockets, realtime ou armazenamento externo de anexos nesta versão.

Antes das migrações, foi salvo snapshot local privado em `tmp/backup-before-saas-production.json` (ignorado pelo Git), com a rede, organizações e associações. Não contém senhas nem sessões. O snapshot registrou 3 ativos, 24 fibras, 80 terminais e 1 organização; as contagens foram conferidas após as migrações. Para recuperação: interromper escritas, exportar primeiro as alterações posteriores, restaurar o snapshot em transação respeitando dependências e validar as contagens antes de reabrir o acesso. Não executar DROP ou restauração automática. Um rollback de aplicação anterior ao SaaS exige também revisar o papel OWNER, que versões antigas não reconhecem como editor. As migrações são aditivas; manter as novas tabelas durante recuperação preserva os dados administrativos.

## Verificação executada

- `npm test`: 28 testes passaram, incluindo revogação herdada, visualizador, suspensão e cadeia inválida.
- `npm run test:saas` com servidor local e PostgreSQL real: superadmin cria plano e duas empresas, convites aceitos uma só vez, proprietário cria admin, admin cria operador, pares/superiores/autopromoção rejeitados; quarto usuário rejeitado com 3 vagas; acesso direto entre empresas e FK cruzada rejeitados; exportação negada ao operador; revogação do superior produz efeito imediato; suspensão encerra sessões; vencimento permite somente consulta; quatro criações concorrentes respeitam o limite de dois projetos; auditorias e persistência conferidas.
- `npm run test:editor`: regressão completa de projetos, camadas, 24 fibras, CTO/splitter, conexões, geometria, versionamento, KML/KMZ, conversão, backup e isolamento passou.
- `npm run test:http`: circuito cliente → CTO → splitter → cabos → DIO → PON e bloqueios passou.
- `npm run typecheck` e build local passaram. Lint: zero erros, quatro avisos em padrões legados de ciclo de vida dos mapas, mantidos fora do escopo desta mudança.
- Navegador local: login/redirecionamento de superadmin, dashboard vazio real, criação/salvamento de plano e modo escuro verificados. Testes são isolados; não gravam contratos fictícios na produção.

## Serviços externos e limites conhecidos

Definir `RESEND_API_KEY` e `EMAIL_FROM` para envio real de convites/recuperação. Sem essas variáveis, o sistema informa que não enviou e oferece link privado para entrega manual ao destinatário. Recuperação pública não simula envio quando o serviço está ausente. Não há cobrança automática por cartão, integração fiscal ou MFA nesta entrega. Assinaturas e cobrança são administrativas/manuais.

O limite de armazenamento mede os arquivos originais importados; logotipos têm limite individual de 100 KB. Não representa o tamanho total do PostgreSQL (índices, auditorias, sessões e geometria). A identidade visual global e o e-mail de suporte ficam persistidos; não configuram remetente de e-mail automaticamente. Permissões de projeto cobrem as operações existentes; não há compartilhamento/exclusão de projetos que não existiam no produto. O editor mantém seus controles e valida ações granulares no backend, exibindo negativa quando o cargo não pode executar uma ação específica.

ESLint usa a API de compatibilidade TypeScript 6 em paralelo ao compilador nativo TypeScript 7. A auditoria de dependências de produção não apontou vulnerabilidades; há aviso na cadeia de globbing do lint de desenvolvimento, sem uso de padrões enviados por usuários. Não foi aplicada a sugestão automática de downgrade incompatível do Next.js.

## Produção

Migrações 007–010 aplicadas no Supabase existente e registradas no ledger Prisma. Nenhum projeto Vercel, banco ou domínio novo criado. Commit e implantação final são registrados no relatório da conversa após confirmação READY e verificação das rotas publicadas.

Publicação confirmada READY: commit `f69c35c8eec9f5315078b1a14dc7f5e0f74e6e04`, branch `main`, implantação `dpl_FAXVHXaBQqgYT8DDU1Ek2GeMV64m` (`fibermap-44s8m8e0a-micheloliveira96.vercel.app`). Os aliases `fibermap-five.vercel.app` e `fibermap-micheloliveira96.vercel.app` foram mantidos. `/api/health` retornou 200; APIs de plataforma, usuários e rede retornaram 401 sem sessão. No navegador de produção, a conta empresarial existente carregou licença ativa e os 3 elementos preservados; tentativa de abrir o painel global redirecionou para a própria conta, sem expor a administração da plataforma. O verificador Supabase manteve apenas o aviso informativo preexistente do ledger Prisma deliberadamente inacessível ao runtime.

O bootstrap de produção foi executado para o e-mail indicado pelo titular. Foi criada a identidade de plataforma sem senha fixa e aberta a tela de primeiro acesso com token privado de uma hora. A configuração da senha e a validação final do login desse titular dependem da ação dele. O mesmo fluxo foi testado com conta descartável em build local de produção, após reinício: definição de senha, rejeição da reutilização do token, login e autorização de plataforma passaram. Não se afirma que o titular já entrou nem que os testes completos com empresas descartáveis foram repetidos em produção; o ciclo de hierarquia/isolamento foi executado no PostgreSQL local real.

