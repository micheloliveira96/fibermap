# Verificação da fundação — 22/10/2026

## História verificada

Um administrador entra na aplicação, cadastra infraestrutura por API, conecta os terminais físicos e rastreia um cliente até sua porta PON a partir dos registros relidos no PostgreSQL/PostGIS.

| Fronteira | Evidência |
| --- | --- |
| Login visual | Tela `/login` inspecionada no navegador; formulário PT-BR renderizado |
| Sessão HTTP | Login com conta temporária; API sem sessão retorna 401 |
| API → banco | Nove cadastros via API e geração de 24/12 fibras |
| Banco → resposta | Inventário relido; conexões e continuidades internas relidas |
| Rastreamento | Cliente → CTO → splitter → distribuição → backbone → DIO → PON |
| Integridade | Duplicidade retorna 409; fusão incompatível retorna 400; exclusão com dependências rejeitada pelo banco |
| Autorização | Visualizador não altera infraestrutura (403); organização sem associação não retorna dados (403) |
| Atomicidade | Falha intencional reverte a transação no teste de persistência |
| PostGIS | Geometria SRID 4326 persistida e distância por geography calculada |
| Compilação | Build de produção e TypeScript aprovados |
| Domínio | Sete testes unitários: fibras, cores/tubos, capacidade inválida, rastreamento, interrupção, ciclos e splitters em cascata |
| Dependências | Auditoria npm sem vulnerabilidades após override de deepmerge-ts 8 |
| Configuração inicial | Teste HTTP em banco isolado valida token inválido, origem externa, uso único, senha com hash e login real |

O primeiro deploy na Vercel alcançou READY, porém `/api/health` retornou 503 na conexão direta IPv6. A conexão via Supavisor ainda depende do hostname exato apresentado no painel do projeto. A publicação não deve ser considerada operacional enquanto esse teste não retornar 200.

Os dados e usuários criados pelos testes são removidos ao final. O banco operacional permanece sem infraestrutura fictícia. As fixtures usam coordenadas sintéticas apenas em testes.

## Limites da evidência

Não foi feita homologação do mapa com provedor licenciado, nem teste de desenho em navegador, responsividade em dispositivos reais, exportação pelo navegador, carga, edição concorrente ou recuperação de backup. A tela principal autenticada não foi homologada visualmente. O teste HTTP verifica as APIs que abastecem a interface; não substitui um teste completo de interação com todos os componentes.

O cenário de referência ainda precisa incluir vínculo especializado de bandeja/local da fusão, cabo drop e circuito nomeado, além de relatório de circuito e demais recursos pendentes em ESCOPO.md.
