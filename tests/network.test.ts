import { describe, expect, it } from 'vitest';
import { graph, strands, trace, type Node } from '../src/lib/network';
describe('Fibras e continuidade óptica', () => {
  it('gera fibras e tubos com padrão configurável', () => { const fibers = strands(24); expect(fibers).toHaveLength(24); expect(fibers[12]).toMatchObject({ number: 13, tube: 2, color: 'Azul', tubeColor: 'Laranja' }); expect(strands(3, ['A','B'])[2].tube).toBe(2); });
  it('rejeita capacidades inválidas', () => { for (const count of [0,-1,1.5,3000]) expect(() => strands(count)).toThrow(); });
  const node = (id: string, kind = 'CTO'): Node => ({ id, kind, label: id, assetId: id });
  it('rastreia cliente até PON sem caminho fixo', () => { const nodes = ['cliente','cto','splitter','distribuição','fusão','backbone','dio'].map(id => node(id)); nodes.push(node('pon','PON')); const edges = nodes.slice(1).map((n,i) => ({ a: nodes[i].id, b: n.id, kind: 'PATCH', lossDb: 0.1 })); const result = trace('cliente', nodes, edges); expect(result[0].outcome).toBe('Porta PON encontrada'); expect(result[0].nodes.map(n => n.id)).toEqual(nodes.map(n => n.id)); expect(result[0].lossDb).toBeCloseTo(.7); });
  it('identifica documentação interrompida', () => { expect(trace('a', [node('a')], [])[0].outcome).toContain('interrompida em a'); });
  it('rastreia cascata de splitters sem seguir saídas irmãs', () => {
    const nodes = [node('pon','PON'),{...node('in1','SPLITTER_IN'),assetId:'sp1'},{...node('out1','SPLITTER_OUT'),assetId:'sp1'},{...node('sibling','SPLITTER_OUT'),assetId:'sp1'},{...node('in2','SPLITTER_IN'),assetId:'sp2'},{...node('out2','SPLITTER_OUT'),assetId:'sp2'},node('client','CUSTOMER')];
    const edge = (a:string,b:string) => ({kind:'PATCH',lossDb:0,terminals:[{terminalId:a},{terminalId:b}]});
    const edges = graph([{id:'sp1',metadata:{insertionLossDb:3.5}},{id:'sp2',metadata:{insertionLossDb:7}}],nodes,[edge('pon','in1'),edge('out1','in2'),edge('out2','client')]);
    const paths = trace('client',nodes,edges);
    expect(paths).toHaveLength(1); expect(paths[0].outcome).toBe('Porta PON encontrada'); expect(paths[0].lossDb).toBe(10.5);
  });
  it('detecta ciclos', () => { const nodes = ['a','b','c'].map(id => node(id)); expect(trace('a', nodes, [{a:'a',b:'b',kind:'PATCH',lossDb:0},{a:'b',b:'c',kind:'PATCH',lossDb:0},{a:'c',b:'a',kind:'PATCH',lossDb:0}]).every(p => p.outcome === 'Ciclo inválido')).toBe(true); });
  it('liga continuidade de fibras e ramificações de splitter', () => { const nodes = [{...node('a','FIBER_A'),fiberId:'f'}, {...node('b','FIBER_B'),fiberId:'f'}, {...node('in','SPLITTER_IN'),assetId:'sp'}, {...node('out1','SPLITTER_OUT'),assetId:'sp'}, {...node('out2','SPLITTER_OUT'),assetId:'sp'}]; const edges = graph([{id:'sp',metadata:{insertionLossDb:3.5}}],nodes,[{kind:'SPLICE',lossDb:.1,terminals:[{terminalId:'b'},{terminalId:'in'}]}]); const paths = trace('a',nodes,edges); expect(paths).toHaveLength(2); expect(paths.every(p => p.lossDb === 3.6)).toBe(true); });
});
