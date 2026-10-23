# Diagrama Óptico — FiberMap

Implementação integrada ao mapa existente em 23/10/2026. Selecione uma CTO, caixa de emenda ou DIO no mapa e clique em **Diagrama Óptico**.

## Arquitetura inspecionada e reutilizada

- Next.js App Router, React, TypeScript, Prisma e PostgreSQL/PostGIS; mapa MapLibre em `editor-map.tsx`, comandado por `optical-editor.tsx`.
- Cabos e equipamentos são `Asset`; fibras são `FiberStrand`, com identidade única por cabo/número. As pontas A/B usam os `OpticalTerminal` já existentes. Fusões e conexões usam `NetworkConnection` e `ConnectionTerminal` (uma ocupação por terminal).
- Autenticação Better Auth, permissões efetivas por associação e licença em `access.ts`. Não se usa Supabase Auth para autenticar os técnicos.
- Antes deste módulo não havia associação explícita cabo/caixa: existiam localização de conexões, geometria dos cabos e equipamentos internos via `parentId`.

## Funcionamento entregue

O editor XYFlow é carregado sob demanda, sobre o mapa. Tem grade, pan/zoom, minimapa, seleção múltipla com Shift, arraste de componentes, alinhamento vertical, tela cheia, nomes, legenda, tema claro/escuro, indicação de alterações, cancelar, desfazer e refazer. Telas até 800 px ficam em consulta.

Cabos associados são carregados automaticamente. Conexões antigas localizadas na caixa e pontas de rota a até 5 m propõem o vínculo (marcado como “vincular”); o vínculo só é gravado ao salvar. A seleção manual permite associar cabos existentes. Sem cabos, a interface explica como associar ou voltar ao cadastro no mapa. Nenhum cabo fictício é gerado.

Cada cabo mostra código, nome, capacidade, tubos, cores, números e pontos de conexão. Usa o padrão de cores já armazenado nas fibras, incluindo padrões personalizados por projeto. A navegação mostra um tubo por vez e permite recolher o cabo; conexões de outros tubos permanecem persistidas. Capacidades seguem o cadastro existente de 1 a 2.880 fibras, incluindo as capacidades solicitadas.

Arrastar um ponto até outro (ou clicar nas duas fibras) abre prévia com as duas identificações. Cores diferentes são permitidas. O lote aceita início/quantidade por cabo e inversão do destino, valida ocupação e apresenta todas as ligações antes da confirmação. Em sangrias, o lote usa a face de chegada.

**Confirmar prepara a alteração; Salvar grava a montagem inteira atomicamente.** Selecionar uma ligação permite editar a bandeja/identificação ou remover. Remoção de continuidade exige confirmação de corte. Nada substitui silenciosamente uma conexão ocupada.

Splitters 1:2, 1:4, 1:8, 1:16, 1:32 e 1:64 têm entrada e saídas individuais e são equipamentos reais contidos na caixa, com código único e permissão `equipment.create`. Nenhuma integração com OLT/clientes, cálculo de atenuação ou provisionamento foi acrescentado.

## Modelo físico e persistência

- `CableAccess` relaciona equipamento e cabo existente, com ponta A/B ou sangria intermediária. Uma ponta pode pertencer a uma única caixa. A posição percentual da sangria indica a ordem física ao longo do cabo e deve ser informada pelo técnico; não altera a rota geográfica.
- Sangrias usam duas faces locais da **mesma** `FiberStrand`. Fibras contínuas têm passagem direta entre essas faces. Cortar remove apenas essa continuidade; derivação ocorre por conexão com um splitter. Fusão entre cabos é distinta de passagem direta.
- O grafo existente foi adaptado para ordenar acessos intermediários e formar os segmentos da mesma fibra sem fazer uma ponte implícita sobre um corte. As pontas e os outros equipamentos continuam com a mesma identidade.
- Estados locais: disponível, reservada, interrompida e bloqueada. O bloqueio global do cabo continua sendo respeitado. Alterar o estado local não modifica o estado da fibra em outra caixa.
- `OpticalDiagram` guarda somente layout/configurações/versionamento; conectividade fica nas tabelas técnicas. Autor/data/ID são registrados nas conexões e na auditoria.
- Salvamento serializável, bloqueio por empresa, revisão de estado e versão detectam edições concorrentes, inclusive alterações feitas pela API antiga. Falhas revertem toda a operação. IDs/autor/data de conexões inalteradas são preservados.
- APIs validam associação ativa, licença e permissões; chaves estrangeiras compostas impedem referências entre empresas. Novas tabelas têm RLS e não concedem acesso direto às funções de navegador Supabase. O backend usa a função compartilhada já existente e aplica o isolamento por empresa na API.
- O backup existente agora inclui acessos e diagramas. Exclusão de equipamento/cabo com montagem salva é bloqueada para preservar os vínculos físicos.

## Verificações realizadas

`npm run typecheck`, `npm run test` (31 testes), `npm run lint` (zero erros; quatro avisos anteriores nos componentes de mapa/workspace), `npm run build`: aprovados.

`test:diagram`, `test:editor`, `test:http` e `test:saas` executados com banco local e empresas descartáveis. Os testes de diagrama verificam:

| Cenário | Resultado |
| --- | --- |
| Caixa existente / cabos associados | Aprovado |
| Fibras, tubos, cores e numeração | Aprovado |
| Fusão individual entre cores diferentes | Aprovado |
| Lote invertido, ocupação e rollback | Aprovado |
| Remoção de fusão | Aprovado |
| Passagem contínua, sangria e corte | Aprovado |
| Splitter 1:8 e conexão de entrada | Aprovado |
| Organização, viewport, tema e reabertura | Aprovado |
| Autor, versão, conflito simultâneo e edição legada | Aprovado |
| Permissões de consulta/edição e isolamento | Aprovado |
| Outra caixa e rotas geográficas preservadas | Aprovado |
| APIs de mapa/cadastro e regressões SaaS | Aprovado |

No navegador, em dados exclusivamente locais: abrir a caixa pelo mapa, expandir tubo, arrastar splitter, arrastar fibra azul até fibra vermelha, conferir prévia, confirmar, desfazer/refazer, salvar e reabrir com a fusão preservada. A conferência visual detectou e corrigiu a aplicação das dimensões dos nós XYFlow.

## Limites operacionais desta versão

- Um cabo tem um acesso (ponta ou sangria) por equipamento; retorno das duas pontas do mesmo cabo à mesma caixa não é modelado nesta versão.
- Acesso físico já salvo não pode ser removido implicitamente pelo editor. A exclusão de ativos com montagem é protegida; não foi criado um fluxo de descomissionamento físico.
- Imagens cartográficas, GPS, rotas e ferramentas geográficas mantêm a implementação anterior. Avisos locais de recursos cartográficos externos não foram alterados por esta missão.
- Não houve teste de carga com milhares de cabos ou edição por celular; em celular a edição é desativada.
- Os dados de teste não são enviados à produção. A migração 011 é aditiva; produção foi copiada antes de aplicá-la e manteve os 6 ativos, 72 fibras e 176 terminais existentes.

O status final de publicação deve ser confirmado pelo registro de implantação Vercel; build local não equivale a publicação.
