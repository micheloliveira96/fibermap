# FiberMap — execução por etapas

O pedido original termina em “ETAPA 2 — Infraestrutura / POP / -”. Esta entrega inicia a implementação, não equivale à plataforma inteira homologada.

## Implementado nesta fundação

- Next.js App Router, TypeScript, Tailwind, componente Button baseado em Radix/shadcn e Lucide.
- Interface PT-BR responsiva, temas claro/escuro, inventário vazio e indicadores derivados dos registros.
- Better Auth com sessões no PostgreSQL, cadastro público desabilitado, provisionamento administrativo e autorização de leitura/escrita por associação à organização.
- Prisma, migração inicial, PostGIS SRID 4326 e índice espacial.
- Cadastro de pontos e rotas; criação transacional de fibras e terminais A/B; padrão de cores configurável na função de domínio (interface de configuração pendente).
- Cadastro de portas de OLT, DIO, CTO, cliente e splitter. Equipamentos ainda usam uma entidade comum; hierarquias e propriedades especializadas estão pendentes.
- Conexões físicas persistentes com exclusividade por terminal, isolamento por organização, auditoria e transação serializável.
- Rastreamento calculado do grafo, continuidade de fibra, divisão por splitter, interrupções e detecção de ciclos; destaque de equipamentos/cabos nos resultados.
- MapLibre com provedor configurável, zoom, GPS mediante autorização, pesquisa de coordenadas, camadas, inserção de pontos e desenho de linhas por cliques.
- Exportação GeoJSON dos registros filtrados. Inventário e capacidade de fibras.

## Antes da homologação operacional

- Completar homologação do cenário de referência em navegador, incluindo desenho e exportação do circuito. Testes de persistência e de APIs já verificam cliente→PON contra PostgreSQL/PostGIS.
- Ampliar homologação de todos os perfis e concorrência; testes HTTP já verificam bloqueio anônimo, sessão, visualizador e seleção de organização sem associação.
- Provedor de mapas contratado/configurado; geocodificação de endereços com contrato, atribuição e limites próprios.
- Validação física mais detalhada: localização, bandejas, tipos de conectores, limites de PON, corte/segmentação de cabo. O modo passante atual documenta relação entre terminais; não modela passagem em ponto intermediário de uma fibra contínua.
- Hierarquias POP/rack/OLT/placa/PON e DIO/bandeja/adaptador; modelo específico de CTO e vínculo ativo cliente/porta/drop.
- Editor gráfico de fusões, editor de interiores, arrastar pontos/vértices, seleção múltipla e desfazer/refazer.
- Grafo interativo completo: a tela Topologia atual apresenta equipamentos e acesso ao rastreamento; não é ainda um diagrama automático de toda a rede.
- Projetos separados da rede instalada, aprovação e conversão confirmada, listas de materiais.
- Reservas, circuitos, status editável de fibras, capacidades especializadas, fotos e anexos privados.
- Orçamento óptico completo por comprimento/onda, margem e medições: o rastreador soma apenas perdas documentadas de conexões e splitters, sem apresentá-las como potência medida.
- Importação com prévia, PDF/CSV/XLSX/KML, relatórios, gráficos e regiões.
- Histórico visual, edição otimista, desativação e exclusão com dependências; retenção, recuperação de senha, revogação de sessões e administração de membros.
- Testes de navegador em computadores/tablets/celulares, auditoria de segurança e recuperação de backup.
- Finalizar a integração de deploy automático entre o GitHub e o projeto Vercel existente. Repositório remoto público (autorizado), PostgreSQL/PostGIS hospedado e publicação Vercel já foram criados; a conexão de banco e a proteção anônima das APIs foram verificadas.

Nenhuma telemetria, integração SNMP ou interpretação de OTDR está implementada.
