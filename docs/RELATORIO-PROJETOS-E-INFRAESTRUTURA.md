# FiberMap — projetos independentes e infraestrutura óptica

Data: 23/10/2026.

## Entrega

- Meus Projetos após o acesso à empresa: criação vazia, pesquisa, ordenação, responsável, datas, região e contagem de equipamentos/cabos. Posição inicial do mapa opcional.
- Abrir e trocar projeto com contexto explícito por aba e por requisição. Nome do projeto sempre visível, mapa e inventário limitados ao projeto autorizado.
- Renomear, duplicar, arquivar, excluir para lixeira e restaurar. Arquivado abre em consulta. Exclusão exige digitar o nome. Limites da licença continuam aplicados, inclusive ao restaurar.
- Controle de acesso por projeto, subordinado às permissões e hierarquia da empresa. Restrição e concessões verificadas no servidor. Mudanças não apagam concessões de membros acima da hierarquia do operador.
- Salvar Projeto com confirmação do servidor; posição, zoom, tema e cartografia persistidos. Propriedades/geometria de elementos existentes usam debounce e versão. Conflitos suspendem o salvamento automático; rascunhos ficam recuperáveis na sessão da mesma aba/usuário/empresa/projeto. Desenhos novos precisam ter sua geometria concluída e os campos conferidos.
- Exportação JSON versionada e importação para um novo projeto, com validação de referências, permissões, limites e transação. Duplicação gera novos IDs para equipamentos, fibras, terminais, acessos, conexões e diagramas, remapeando referências e posições.
- Renomeação efetiva no mapa e no diagrama, incluindo acopladores, mantendo código, IDs, coordenadas e conexões. Disponível nas propriedades e no botão direito.
- CTOs apresentam Acopladores com IN/Entrada e OUT/Saída, estado livre/parcial/conectado/reservado. Reutilizam os pares InternalLink anteriores; a continuidade interna não vira fusão.
- Cliente existente e cabo drop real associados à CTO, com ambas as pontas e caminho splitter → acoplador → drop → cliente. O mapa permite consultar a montagem a partir do cliente.
- POP usa o editor óptico existente: associação de equipamentos existentes, novas OLTs, DIOs e cordões/pigtails, slots e portas PON, adaptadores frontais/traseiros, conectores, fibras e fusões. A ampliação preserva IDs, identificação física das portas existentes e ligações.
- Configuração de portas, renomeação, conexões, layout e consultas respeitam empresa e projeto; fusões continuam atômicas e protegidas contra edição simultânea. Cores das extremidades e fusão em lote anteriores foram preservadas.
- Ajuda e PDF continuam disponíveis no FiberMap.

## Validação realizada

| Etapa | Resultado |
| --- | --- |
| TypeScript | Passou |
| Lint | Sem erros; quatro avisos anteriores de React em editor-map, network-map, optical-editor e workspace |
| Testes unitários | 34 testes em 6 arquivos passaram |
| Build Next.js | Passou |
| `test:projects` | Passou: projetos A/B, códigos iguais, API e banco contra vínculo cruzado, concorrência, renomeação, acopladores, drop/cliente, POP, expansão, cópia, importação, rollback, arquivo, lixeira, concessões e isolamento |
| `test:editor` | Passou: mapa, camadas, segmentação, identidade das fibras, edição, KML/KMZ, conversão, backup, isolamento e perfis |
| `test:http` | Passou: circuito cliente até PON, ocupação, duplicidade, permissões e isolamento |
| `test:diagram` | Passou: fusões, lote, rollback, passagem, sangria, splitter, persistência, concorrência, DIO e preservação do mapa |
| `test:saas` | Passou: autenticação, hierarquia, empresas, licenças, convites, limites, concorrência e auditoria |
| Persistência em banco descartável | Passou; dados de testes removidos |
| Migração limpa e sobre legado | Passou: 001 a 013, com IDs, geometria, pares, conexões, acessos e layout preservados |
| Navegador local | Login abriu Meus Projetos; mapa carregou os 12 elementos isolados do teste; CTO mostrou os pares IN/OUT e drop até cliente; renomeação gravou e atualizou o nó. Revisão visual corrigiu sobreposição dos títulos dos acopladores. A confirmação nativa de descarte bloqueou interações posteriores da aba de QA; os fluxos de POP, concorrência, importação e cópia foram validados via HTTP e banco. |

As primeiras execuções detectaram e corrigiram consultas de segmentos com filtro inadequado, validação SQL com coluna `end` sem aspas, execução de ALTER com validações deferidas e atualização do formulário do mapa após renomeação no diagrama. Uma repetição do teste de login atingiu o limite de requisições; após o intervalo normal, `test:diagram` passou sem reduzir a proteção.

## Produção e preservação

Backup técnico privado preparado antes da alteração. Migração `202610230013_independent_projects_and_components` aplicada e registrada, checksum SHA-256 `e79d2ecb70fe3f0477086fedb5e367a4dc931b79249afc52e297c544fe5c072b`.

Comparação por ID e campos com o backup confirmou: 9 assets, 49 fibras, 140 terminais, 16 pares internos, 12 conexões com 24 extremidades, 2 acessos e 1 diagrama preservados. Todos os 9 assets foram associados ao Projeto Principal da própria empresa. Não foram adicionados equipamentos de teste em produção. A análise de segurança não encontrou alertas novos; há somente a informação existente sobre a tabela privada `_prisma_migrations` com RLS e sem política pública.

O plano de migração e recuperação está em `MIGRACAO-PROJETOS-013.md`. A situação final da publicação deve ser conferida na Vercel pelo commit e aliases antes de comunicar disponibilidade.

## Limites e operação

- A montagem óptica mantém Salvar explícito para confirmar alterações técnicas em uma única transação; rascunhos da montagem são recuperáveis. Isso evita confirmar silenciosamente uma fusão ainda em revisão.
- O JSON inclui a rede técnica, geometrias, metadados, configurações e layouts; não leva credenciais, sessões ou dados de autenticação. Também não inclui os bytes do arquivo KML/KMZ de origem: mantém sua identificação e a rede já convertida. O backup técnico autenticado anterior continua disponível para consultar o original.
- Recuperação de rascunho usa sessionStorage e depende da disponibilidade do armazenamento e da revisão do servidor; uma revisão conflitante permite baixar o rascunho para conferência, sem sobrescrita automática.
- OLT é documentação física. Não há comunicação, ativação, PPPoE, clientes autenticados ou provisionamento. Rotas geográficas não são alteradas pela montagem óptica.
- O manual PDF existente permanece na edição anterior; este relatório descreve os novos recursos.

## Como utilizar

1. Entre no FiberMap e abra **Meus Projetos**. A rede antiga está em **Projeto Principal**.
2. Use **Novo Projeto** para uma rede vazia, ou o menu do cartão para duplicar, exportar, arquivar e gerenciar acessos.
3. Dentro do mapa, confira **Projeto ativo**, use **Salvar Projeto** e **Trocar Projeto**.
4. Selecione uma CTO e abra **Diagrama Óptico**. Associe o cliente e o drop existentes; conecte splitter à entrada IN, saída OUT ao drop e a outra ponta ao cliente. Confira e salve.
5. Selecione um POP e abra **Diagrama Óptico**. Adicione/associe OLT e DIO, configure slots/portas, adicione cordão e pigtail, conecte os pontos reais, organize e salve.
6. Para mudar nomes, use **Renomear** nas propriedades ou botão direito sobre o componente. Para consultar um cliente, selecione-o no mapa e escolha **Consultar ligação óptica**.
