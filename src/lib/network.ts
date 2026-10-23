export const colors = ['Azul', 'Laranja', 'Verde', 'Marrom', 'Cinza', 'Branco', 'Vermelho', 'Preto', 'Amarelo', 'Violeta', 'Rosa', 'Turquesa'];
export function strands(count: number, pattern = colors) {
  if (!Number.isInteger(count) || count < 1 || count > 2880 || !pattern.length) throw new Error('Capacidade inválida');
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, tube: Math.floor(i / pattern.length) + 1, color: pattern[i % pattern.length], tubeColor: pattern[Math.floor(i / pattern.length) % pattern.length] }));
}
export type Node = { id: string; label: string; kind: string; assetId: string; fiberId?: string | null; attachmentId?: string | null; routePosition?: number | null; localSide?: string | null };
export type Edge = { a: string; b: string; kind: string; lossDb: number };
export function trace(start: string, nodes: Node[], edges: Edge[]) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (!byId.has(start)) throw new Error('Terminal inexistente');
  const paths: { nodes: Node[]; lossDb: number; outcome: string }[] = [];
  function walk(id: string, parent: string | null, path: string[], lossDb: number) {
    if (path.includes(id)) { paths.push({ nodes: [...path, id].map(x => byId.get(x)!), lossDb, outcome: 'Ciclo inválido' }); return; }
    const nextPath = [...path, id], node = byId.get(id)!;
    if (node.kind === 'PON') { paths.push({ nodes: nextPath.map(x => byId.get(x)!), lossDb, outcome: 'Porta PON encontrada' }); return; }
    if (nextPath.length > 256 || paths.length >= 512) { paths.push({ nodes: nextPath.map(x => byId.get(x)!), lossDb, outcome: 'Limite de segurança atingido' }); return; }
    const upstreamSplitter = node.kind === 'SPLITTER_IN' && parent && byId.get(parent)?.kind === 'SPLITTER_OUT';
    const next = edges.filter(e => !(upstreamSplitter && e.kind === 'SPLITTER')).flatMap(e => e.a === id ? [{ id: e.b, loss: e.lossDb }] : e.b === id ? [{ id: e.a, loss: e.lossDb }] : []).filter(n => n.id !== parent && byId.has(n.id));
    if (!next.length) paths.push({ nodes: nextPath.map(x => byId.get(x)!), lossDb, outcome: 'Documentação interrompida em ' + node.label });
    for (const n of next) walk(n.id, id, nextPath, lossDb + n.loss);
  }
  walk(start, null, [], 0);
  return paths;
}
export function graph(assets: { id: string; metadata: unknown }[], nodes: Node[], connections: { kind: string; lossDb: number; terminals: { terminalId: string }[] }[], internal: { aId: string; bId: string }[] = []): Edge[] {
  const edges: Edge[] = connections.filter(c => c.terminals.length === 2).map(c => ({ a: c.terminals[0].terminalId, b: c.terminals[1].terminalId, kind: c.kind, lossDb: c.lossDb }));
  edges.push(...internal.map(link => ({ a: link.aId, b: link.bId, kind: 'ADAPTER', lossDb: 0 })));
  const fibers = new Map<string, Node[]>();
  for (const n of nodes) if (n.fiberId) fibers.set(n.fiberId, [...(fibers.get(n.fiberId) ?? []), n]);
  for (const pair of fibers.values()) {
    const a=pair.find(n=>!n.attachmentId&&n.kind==='FIBER_A'), b=pair.find(n=>!n.attachmentId&&n.kind==='FIBER_B');
    if(!a||!b) continue;
    const accesses=[...new Set(pair.flatMap(n=>n.attachmentId?[n.attachmentId]:[]))].map(id=>({incoming:pair.find(n=>n.attachmentId===id&&n.localSide==='IN'),outgoing:pair.find(n=>n.attachmentId===id&&n.localSide==='OUT')})).sort((x,y)=>(x.incoming?.routePosition??0)-(y.incoming?.routePosition??0));
    let previous=a;
    for(const access of accesses) {if(!access.incoming||!access.outgoing) continue;edges.push({a:previous.id,b:access.incoming.id,kind:'FIBER',lossDb:0});previous=access.outgoing;}
    edges.push({a:previous.id,b:b.id,kind:'FIBER',lossDb:0});
  }
  for (const asset of assets) {
    const input = nodes.filter(n => n.assetId === asset.id && n.kind === 'SPLITTER_IN');
    const output = nodes.filter(n => n.assetId === asset.id && n.kind === 'SPLITTER_OUT');
    const meta = asset.metadata as { insertionLossDb?: number };
    for (const a of input) for (const b of output) edges.push({ a: a.id, b: b.id, kind: 'SPLITTER', lossDb: meta.insertionLossDb ?? 0 });
  }
  return edges;
}
