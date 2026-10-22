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
| Recarregamento da configuração | Três testes adicionais verificam recuperação do token na mesma aba, expiração e remoção após conclusão |

Em 22/10, a falha reportada foi reproduzida na tela: o token havia sido removido da URL e não era recuperado após reload, deixando o botão de criação desabilitado. A correção mantém o token na sessão da aba por até uma hora e autentica após o cadastro. A verificação hospedada com conta temporária confirmou criação (201), login (200), inventário autenticado (200) e página principal autenticada (200); a conta de teste foi removida ao final. A suíte unitária passou com dez testes e o teste HTTP de configuração isolado também passou.

A publicação na Vercel alcançou READY. A conexão direta IPv6 foi substituída pelo Supavisor com o hostname fornecido pelo responsável. Após a correção, `/api/health` retornou 200 e `/api/network` sem sessão retornou 401. O código foi enviado ao repositório público por autorização explícita; segredos e documentos locais de hospedagem não foram enviados. O acesso do primeiro administrador depende da configuração pelo link privado de uso único.

Os dados e usuários criados pelos testes são removidos ao final. O banco operacional permanece sem infraestrutura fictícia. As fixtures usam coordenadas sintéticas apenas em testes.

## Limites da evidência

Não foi feita homologação do mapa com provedor licenciado, nem teste de desenho em navegador, responsividade em dispositivos reais, exportação pelo navegador, carga, edição concorrente ou recuperação de backup. A tela principal autenticada não foi homologada visualmente. O teste HTTP verifica as APIs que abastecem a interface; não substitui um teste completo de interação com todos os componentes.

O cenário de referência ainda precisa incluir vínculo especializado de bandeja/local da fusão, cabo drop e circuito nomeado, além de relatório de circuito e demais recursos pendentes em ESCOPO.md.
