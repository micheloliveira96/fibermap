# FiberMap - Ajuda, lotes e identificação por cores

Revisão de 23/10/2026.

## Funcionalidades entregues

- Botão Ajuda no mapa, inventário técnico, diagrama, conta e administração.
- Central `/ajuda`, autenticada, com leitor integrado, Abrir PDF e Baixar PDF. Abre em outra aba para preservar a montagem em edição.
- Manual de 34 páginas, edição 03, com sumário navegável, instruções operacionais, caixa montada e sangria ilustradas, lotes com splitters e identificação por cores.
- Fusão em lote entre cabos, fibras e portas de vários splitters, inclusive saídas para fibras e portas compatíveis.
- Filtros de cabo, tubo, intervalo e face de sangria; seleção individual ou de disponíveis por componente; portas ocupadas identificadas.
- Associação sequencial na ordem de seleção, inversão do destino e associação manual editável.
- Prévia colorida com origem, destino, tipo e situação. Duplicidade, incompatibilidade e ocupação bloqueiam a confirmação.
- Fibra-fibra usa SPLICE; conexões com componentes usam PATCH. A montagem inteira é salva transacionalmente.
- Uma única ligação lógica com cores derivadas das extremidades. A mudança de cor ocorre na metade do comprimento real do SVG, inclusive nas curvas.
- Cor configurável por porta; ausência de configuração usa cinza neutro. A cor fica no terminal, sem duplicação em conexões e sem alteração de identificadores técnicos.
- Rótulos, detalhes ao passar o mouse e destaque de seleção que preserva as cores. Desfazer e Refazer incluem lotes e identificação de portas.

## Validação executada

| Etapa | Resultado |
| --- | --- |
| TypeScript | Aprovado |
| Lint | Zero erros; quatro avisos preexistentes em componentes de mapa/inventário |
| Vitest | 34 testes aprovados em seis arquivos |
| Integração do diagrama | Aprovada: fusão, lote de três splitters, entradas/saídas, cascata compatível, rollback por ocupação, cores persistidas/neutras, atualização da cor de fibra e conflito de revisão |
| Persistência e segurança | Aprovadas: salvar/reabrir, IDs/autor/data preservados, concorrência real, permissões, isolamento por empresa e outra caixa preservada |
| Regressão do editor | Aprovada: projetos, camadas, cabos, equipamentos, segmentação, importação, backup e mapa |
| Regressão HTTP da rede | Aprovada: sessão, cadastros, circuito, ocupação e isolamento |
| Regressão SaaS | Aprovada: empresas, hierarquia, convites, licenças, permissões, auditoria e concorrência |
| Navegador local | Lote com três splitters salvo/reaberto; desfazer 5→2 e refazer 2→5 ligações; saídas→fibras por associação manual; duplicidade bloqueada; identificação de porta atualizada/salva; sem erros no console |
| SVG no navegador | Linha azul/vermelha com comprimentos 119,116 / 119,116; linha laranja/laranja uniforme |
| Ajuda e download | Abertura em outra aba, leitor PDF de 34 páginas e download real confirmados. API autenticada retorna bytes idênticos ao PDF e bloqueia acesso anônimo |
| PDF | 34 páginas renderizadas, 33 marcadores, 32 links de sumário, nenhum texto fora dos limites; páginas alteradas revisadas visualmente |
| Migração | `202610230012_port_identification_colors`, aditiva e validada localmente e na produção; mantidos 7 elementos, 139 terminais, 12 conexões e 1 diagrama |

Os testes de edição usaram organizações isoladas no banco local. Não foram inseridos equipamentos de teste na produção. O backup anterior à migração fica fora do repositório público. A verificação de segurança manteve somente o aviso informativo preexistente de ausência de política na tabela privada de controle de migrações.

## Arquivos principais

- `src/app/ajuda/page.tsx` e `page.module.css`: central de ajuda.
- `src/app/api/help/manual/route.ts`: PDF autenticado, visualização e download.
- `resources/Manual_FiberMap.pdf`: manual distribuído; `next.config.ts` inclui o arquivo no pacote de produção.
- `src/components/help-link.tsx` e `help-link.module.css`: botão reutilizável.
- `src/components/optical-editor.tsx`, `workspace.tsx`, `administration.tsx` e `src/app/conta/page.tsx`: pontos de acesso à ajuda.
- `src/components/optical-batch.tsx`: seleção e prévia de lotes.
- `src/components/optical-edge.tsx`: caminho SVG com duas cores e marcador de fusão.
- `src/components/optical-diagram.tsx` e `.css`: integração com o editor e propriedades da porta.
- `src/lib/diagram-types.ts`: identidade, cores e validação de pares.
- `src/lib/diagram-server.ts`: validação, revisão e persistência transacional de cores.
- `prisma/schema.prisma` e migração 012: campo opcional de identificação no terminal.
- `tests/diagram.test.ts` e `tests/diagram-http.ts`: validações e regressões.

## Uso

Entre no FiberMap e clique em **Ajuda** para abrir ou baixar o manual. No diagrama, selecione **Fusão em lote**, escolha as extremidades, confira a prévia, confirme e use **Salvar**. Para mudar a identificação de uma porta, clique nela e escolha **Cor da porta** em Propriedades.
