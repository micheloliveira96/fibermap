# Migração 013 — projetos independentes e componentes ópticos

## Antes da aplicação

- Fazer backup técnico privado de Asset, FiberStrand, OpticalTerminal, InternalLink, NetworkConnection, ConnectionTerminal, CableAccess, OpticalDiagram, CableSegment, NetworkProject, MapLayer, ImportBatch e AuditLog. Incluir somente os direitos de licença necessários à recuperação; não exportar credenciais, sessões ou senhas.
- Verificar relações entre projetos e empresas. A migração aborta se encontrar topologia incompatível.
- Validar a migração do zero e sobre dados legados em um banco descartável. `node tests/projects-migration.cjs` exige o Docker local e recusa uma DATABASE_URL remota.

## Alterações

A migração acrescenta associações e campos. Não exclui equipamentos, fibras, terminais, fusões ou diagramas. Registros sem projeto recebem o Projeto Principal de sua própria empresa; seus IDs, geometrias, conexões e posições visuais permanecem iguais. A unicidade do código passa a considerar empresa e projeto. As portas existentes das CTOs e DIOs continuam sendo os mesmos pares internos.

Há restrições no banco contra vínculos entre projetos e contra mudança de propriedade dos registros. As novas tabelas têm RLS e acesso somente pelo servidor autenticado; não são liberadas para anon/authenticated. As permissões das licenças que já autorizavam edição de projetos passam a contemplar as ações de gerenciamento.

## Verificação

Comparar cada registro anterior por ID com o backup: geometrias, identificação, fibras, pontas, acopladores, conexões, acessos e layout. Confirmar projetos por empresa, nenhum registro técnico sem projeto e nenhum vínculo entre projetos. Registrar o checksum real da migração em `_prisma_migrations` somente após sucesso confirmado.

## Recuperação

Priorizar correção aditiva para manter alterações feitas após a publicação. Caso a aplicação precise voltar à versão anterior, preservar os novos dados e promover o último deployment validado: inserções legadas recebem o Projeto Principal pelo trigger de compatibilidade. Não executar reversão destrutiva automática de schema, pois projetos novos podem existir.

Se for indispensável restaurar dados técnicos, interromper as escritas, salvar também o estado posterior e preparar uma restauração transacional a partir do backup privado e de sua empresa correspondente. Verificar conflitos de códigos e dependências antes de remover a estrutura de projetos; não misturar projetos nem restaurar credenciais. Revalidar todos os IDs e conexões antes de liberar as escritas.

A exclusão no produto é reversível pela Lixeira. A restauração respeita o limite de projetos da licença; arquivos e equipamentos na lixeira permanecem no armazenamento.
