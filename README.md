# FiberMap

Sistema independente de documentação de redes ópticas FTTH em português do Brasil. Fundação funcional em desenvolvimento; consulte [o escopo e as pendências](docs/ESCOPO.md) antes de usar em operação. Não contém rede, clientes ou indicadores fictícios.

## Desenvolvimento local

Node.js 22 LTS ou superior e Docker Desktop com engine Linux.

```powershell
npm ci
Copy-Item .env.example .env
# Substitua BETTER_AUTH_SECRET por um segredo aleatório forte.
docker compose up -d
npm run db:deploy
npm run db:generate
$env:ADMIN_EMAIL = 'admin@sua-empresa.com.br'
$env:ADMIN_PASSWORD = 'defina-uma-senha-forte-e-exclusiva'
$env:ORGANIZATION_NAME = 'Sua organização'
npm run bootstrap
Remove-Item Env:ADMIN_PASSWORD
npm run dev
```

Acesse `/login`. Não há senha padrão nem cadastro público. O bootstrap só cria uma organização e seu administrador. Dados de infraestrutura são acessíveis apenas por sessão válida e associação à organização. APIs aceitam `x-organization-id` para escolher outra organização à qual o usuário pertença; sem esse cabeçalho, usam a primeira associação.

Em uma instalação hospedada vazia, o primeiro administrador pode ser criado em `/setup#token=...`. O servidor recebe somente `FIBERMAP_SETUP_TOKEN_HASH` (SHA-256 de token aleatório forte) e `FIBERMAP_SETUP_EXPIRES_AT` (Unix em milissegundos). Entregue o token original de forma privada ao responsável. O fragmento é removido da URL ao carregar a página e seu token fica no sessionStorage da mesma aba por até uma hora para permitir recarregamento. Nenhuma senha é armazenada no navegador pela aplicação. A criação ocorre por POST com token em cabeçalho, origem validada e transação serializável com trava. Após gravar a conta, o token temporário é removido e o usuário é autenticado e encaminhado ao mapa; se o login não concluir, o link para entrar permanece disponível. Após o primeiro usuário, novas tentativas são recusadas. Remova essas variáveis após concluir o acesso inicial.

## Cartografia

Defina `NEXT_PUBLIC_MAP_STYLE_URL` com um estilo MapLibre de um provedor de mapas baseado em OSM/licenciado, incluindo a atribuição na definição das fontes. Somente chaves públicas restritas por domínio podem aparecer nessa URL. Reinicie/recompile após mudar variáveis públicas. Não há fallback para endpoints públicos de tiles. Sem provedor, aparece orientação de configuração, nunca um mapa inventado. GPS depende de HTTPS (ou localhost) e consentimento do navegador. Desenho de cabo: clique nos vértices e dê dois cliques para finalizar. Comprimento geográfico, quando consultado em SQL, deve usar `ST_Length(spatial::geography)`; não corresponde automaticamente à metragem física de cabo.

## Verificação

```powershell
npm run typecheck
npm test
npm run build
# Banco exclusivo de testes: nunca aponte para produção.
$env:TEST_DATABASE_URL = 'postgresql://.../fibermap_test'
npm run test:integration
# Com servidor local ativo e banco exclusivo de desenvolvimento:
$env:TEST_API_URL = 'http://localhost:3000'
npx tsx tests/http.ts
# Teste de configuração inicial (exige build pronto e banco _test sem usuários):
npx tsx tests/setup-http.ts
```

Testes unitários cobrem geração de fibras, continuidade, ramificações, interrupções e ciclos. O teste de integração é explicitamente separado e exige banco com migrações aplicadas; falhas de configuração não são sucesso.

O teste HTTP cria conta e organização temporárias, percorre as APIs reais e remove seus registros. Use a mesma porta de `BETTER_AUTH_URL`; se 3000 estiver ocupada, ajuste essa variável para a porta anunciada pelo Next.js. Evidências e limites estão em [VERIFICACAO.md](docs/VERIFICACAO.md).

## Banco e segurança

Migrações em `prisma/migrations`. PostGIS precisa estar disponível no serviço PostgreSQL. Chaves estrangeiras com restrição, unicidade global do terminal ocupado e transações protegem conexões. Operações de escrita exigem ADMIN/ENGINEER; TECHNICIAN/VIEWER têm leitura nesta versão. Segredos ficam apenas no servidor. A sessão do Better Auth valida identidade; a associação persistida valida organização e perfil. Infraestrutura nunca é retornada em acesso anônimo.

## Publicação na Vercel

Importe este repositório como Next.js, configure `DATABASE_URL` para PostgreSQL/PostGIS, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` com o domínio HTTPS e `NEXT_PUBLIC_MAP_STYLE_URL`. Aplique `npm run db:deploy` em etapa controlada de release, antes de liberar tráfego; o build gera o Prisma Client e compila a aplicação, não altera o banco. Use pool compatível com o provedor e mantenha aplicação/banco próximos. Não publique credenciais locais do Compose. Este projeto não foi publicado automaticamente e não provisiona serviços pagos.

## Backup e restauração

Use snapshots/PITR do provedor e exportações periódicas criptografadas com `pg_dump -Fc`, armazenadas fora da instância, com acesso restrito. Restaure com `pg_restore --no-owner` em banco novo com PostGIS disponível; aplique migrações faltantes, valide contagens, integridade e acesso por organização antes de trocar a conexão. Teste a restauração periodicamente e defina RPO/RTO e retenção com a operação. Nunca teste restauração sobre produção. Anexos, quando implementados, precisam de backup separado.
