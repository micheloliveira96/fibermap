# FiberMap — mapa e editor óptico

Entrega de 22/10/2026 sobre a fundação Next.js 16, Better Auth, Prisma e PostgreSQL/PostGIS existentes. O editor é a página inicial; o painel anterior permanece em `/inventario`.

O acesso de quem já possui conta fica em `/login`, com e-mail e senha. `/setup` é exclusivo para o primeiro administrador: com ambiente já configurado, encaminha para o login; com sessão ativa, encaminha para o mapa. O formulário inicial também oferece o link “Já tenho cadastro — Entrar”.

## Implementado

- Mapa MapLibre mundial com OpenFreeMap/OpenStreetMap, navegação, escala métrica, coordenadas, busca por nome/código/ID, endereço e latitude/longitude. GPS depende da autorização do navegador. Ruas, claro e escuro disponíveis; satélite aparece somente quando configurado pelo operador.
- Correção da integração MapLibre 6: worker e módulo compartilhado são copiados na compilação e servidos no próprio domínio. Corrigida também a altura do canvas. O teste visual confirmou ruas e bairros reais.
- Projetos persistentes e camadas com nome, cor e visibilidade. Filtros independentes por tipo de infraestrutura. Cores de identificação de fibras configuráveis por projeto e na criação de cada cabo.
- Desenho de cabos por vértices, escolha antecipada de tipo e capacidade, conclusão por botão ou duplo clique, distância Turf, propriedades e gravação PostGIS. Pontos e polígonos de cobertura também são suportados.
- Edição de vértices por arraste com mouse ou toque; inserção e remoção do vértice selecionado; desfazer/refazer de geometrias ainda não salvas. Pontos podem ser movidos com a mesma ferramenta ou pelas coordenadas no painel. Renomeação e propriedades possuem gravação real.
- Fibras individuais e terminais A/B, fabricante, origem/destino documental, comprimento geográfico, físico e reserva separados, situação, cor, observações e data. Capacidades personalizadas até 2.880 fibras.
- POP, OLT, DIO, CTO, caixa, splitter, cliente, poste, duto, reserva e pontos de passagem. Símbolos por tipo. OLT/DIO/splitter podem pertencer a POP/CTO/caixa com vínculo persistente.
- Splitters com entradas e saídas reais; CTO/DIO com continuidade entre frente e traseira. Conexões entre terminais, fusões, passantes e patch cords persistentes; caixa/CTO/POP e bandeja podem ser associados à conexão. Exclusividade por terminal e bloqueio de fibra reservada/danificada/indisponível.
- Consulta de fibras disponíveis, ocupadas, fusionadas, passantes e indisponíveis; estados de fibras sem conexão podem ser alterados. Portas mostram ocupação e permitem rastreamento, com destaque no mapa. Cabos conectados em uma caixa mostram capacidade e quantidade livre.
- Exclusão com confirmação e rejeição de dependências; desconexão auditada; cópia com novos identificadores de portas/fibras, sem copiar conexões. Edição e exclusão usam versão para rejeitar alterações concorrentes desatualizadas.
- Divisão documental da rota em dois segmentos persistentes com comprimentos próprios, preservando o cabo, fibras, terminais e conexões. Exige confirmação quando há conexões. Os segmentos podem ser focalizados no mapa.
- KML/KMZ por seletor ou arraste, prévia, seleção antes de gravar, pastas transformadas em camadas, nomes, descrição em texto, cores e geometrias múltiplas. Conversão técnica explícita na prévia ou depois de salvar um elemento genérico. Ajuste de enquadramento e deduplicação por SHA-256 por organização.
- Validação de XML sem DTD/entidades, coordenadas e validade PostGIS; verificação de caminhos ZIP, expansão, entradas e tamanho. Arquivo original preservado no banco.
- Exportação do mapa visível em KML, KMZ e GeoJSON. Backup próprio da organização com projetos, camadas, arquivos originais, geometrias, fibras, terminais, segmentos, conexões, continuidades e auditoria. O backup não inclui usuários, senhas, sessões nem credenciais da aplicação.
- Histórico visual dos eventos do elemento entre os 100 mais recentes da organização; auditoria completa disponível no backup. Interface clara/escura e painéis recolhíveis.

## Verificação realizada

| Cenário | Evidência |
| --- | --- |
| Tipos e compilação | `npm run typecheck` sem incremental e build de produção aprovados |
| Domínio e importação | 17 testes unitários aprovados, incluindo geometrias, enquadramento sem alteração de coordenadas polares, KML/KMZ, exportação de ida/volta, entidades, ZIP com caminho suspeito e expansão excessiva |
| HTTP com banco real | `tests/editor-http.ts`: projetos/camadas, padrão por projeto, 24 fibras, CTO e splitter de 8 saídas, conexão, segmentação preservando IDs, edição, conflito 409, estados, cópia, exclusão, KML/KMZ e conversão |
| Integridade e acesso | Geometria inválida rejeitada; projeto de outra organização não aceito; seleção de organização sem associação retorna 403; visualizador não altera dados |
| Concorrência e caixa | Duas edições simultâneas da mesma versão produziram 200/409; fusão da fibra 3/B de um cabo à 7/A de outro vinculada a uma caixa/bandeja e relida; mudança de cor da camada persistida |
| Backup | Arquivo original recuperado byte a byte; relações técnicas presentes; credenciais ausentes |
| Regressão óptica | `tests/http.ts`: circuito cliente → CTO → splitter → distribuição → backbone → DIO → PON, 24/12 fibras, ocupação e autorização |
| Navegador | Mapa real, desenho de 3 vértices, cabo de 24 fibras, arraste, inserção de vértice, desfazer/refazer, salvamento e reabertura da versão 2 com comprimento atualizado |
| Importação na interface | KML de 2 geometrias, prévia, conversão explícita para CTO/distribuição e gravação |
| Exportação na interface | Downloads KML e KMZ gerados; ambos reabertos pelo parser com as 2 geometrias e nomes preservados |
| Busca de endereço | Pesquisa real de Lisboa/Portugal retornou resultados e permitiu centralizar o mapa |
| Responsividade | Inspeção em navegador normal e iframe com viewport de 390 × 844; não equivale à homologação em aparelhos físicos |
| Banco hospedado | Migrações aditivas 004–006 aplicadas; registro preexistente preservado; quatro tabelas novas com RLS e acesso anônimo revogado |

Os testes utilizam organizações temporárias locais e removem seus próprios registros ao terminar. Não adicionam rede demonstrativa à organização do usuário.

Para repetir os testes HTTP, inicie o servidor local e defina `TEST_API_URL` para sua URL localhost. Execute `npm run test:editor` e `npm run test:http`. O `BETTER_AUTH_URL` local deve corresponder ao endereço/porta do servidor. Nunca aponte essas rotinas de teste para produção.

## Limites conhecidos e pendências

- Importação: até 1,5 MB de arquivo, 4 MB descompactados, 100 entradas ZIP, 500 geometrias no arquivo e 100 selecionadas por operação; até 5 mil fibras criadas por operação. O mesmo arquivo não é importado duas vezes na organização. Arquivos maiores devem ser divididos previamente.
- Geometrias múltiplas são preservadas como elementos geográficos. A conversão em cabo exige uma LineString simples; a conversão em equipamento exige Point. Coleções heterogêneas são separadas em elementos na importação.
- Ícones/imagens externos ou anexados ao KMZ não são executados ou carregados automaticamente. Seus metadados e arquivo original são preservados no backup; símbolos do FiberMap são usados no mapa. KML exporta nomes, coordenadas e estilos compatíveis de cor/linha/área, sem representar a topologia óptica.
- Dividir uma rota cria segmentos documentais, não novos cabos ou emendas ópticas. Uma rota já dividida deve ter sua geometria editada antes de outra divisão; editar a geometria remove os segmentos antigos. Não existe corte automático de fibras ou renumeração de portas.
- Capacidade e tipo técnico de um elemento já estruturado não são reduzidos/editados para evitar perda de conexões. É possível converter importados genéricos ou criar/copiar outro elemento. Reconfiguração técnica com migração de circuitos é uma etapa posterior.
- Bandejas são identificadores documentais de conexões; não há editor visual de bandejas, racks ou interiores. A alimentação de CTO e o vínculo cliente/porta são representados por terminais/conexões e pelo rastreamento, sem vínculo automático inferido de proximidade no mapa.
- O rastreador soma perdas documentadas de conexões e splitters. Não representa potência medida, orçamento por comprimento/onda, OTDR ou telemetria.
- Busca pública Photon possui cache/limitação por instância e não oferece SLA. O operador pode configurar outro endpoint compatível. Satélite requer provedor licenciado configurado; nenhum serviço pago foi contratado.
- GPS exige permissão humana; toque e localização devem ser homologados nos aparelhos usados em campo. A homologação automática cobre mouse, API, persistência e viewport móvel.
- A cartografia Web Mercator não exibe as calotas polares, além de aproximadamente ±85,05° de latitude. Coordenadas WGS 84 nesses locais continuam armazenadas, com aviso e edição numérica; não deslocam automaticamente a câmera para uma área que o mapa não consegue representar.
- O backup é exportado em formato próprio; restauração automática e estratégia de retenção ainda não possuem interface.
- Isolamento de organizações é verificado em todas as APIs. O banco aceita somente a credencial de servidor com políticas RLS próprias; as sessões Better Auth não são JWTs do Supabase e não concedem acesso direto pelo Data API. O aviso informativo de RLS sem política em `_prisma_migrations` é intencional: o runtime não acessa o histórico de migrações.
- Integração automática GitHub → Vercel permanece pendente de configuração na conta. Esta entrega usa publicação direta do código no projeto Vercel existente.
