import { expect, it } from 'vitest';
import { setupToken, clearSetupToken } from '../src/lib/setup-client';
function storage() { const map = new Map<string,string>(); return { getItem: (key:string) => map.get(key) ?? null, setItem: (key:string,value:string) => {map.set(key,value);}, removeItem: (key:string) => {map.delete(key);} }; }
it('recupera o token após recarregar a página com fragmento já removido', () => {
  const saved = storage(), token = 'a'.repeat(43), now = 100000;
  expect(setupToken('#token='+token,saved,now)).toBe(token);
  expect(setupToken('',saved,now+1000)).toBe(token);
  expect(setupToken('',saved,now+3600001)).toBe('');
});
it('remove a credencial temporária após concluir a configuração', () => { const saved=storage();setupToken('#token='+'b'.repeat(43),saved,100000);clearSetupToken(saved);expect(setupToken('',saved,100001)).toBe(''); });
it('substitui token antigo por um novo link e não aceita valores malformados', () => { const saved=storage();setupToken('#token='+'a'.repeat(43),saved,100000);expect(setupToken('#token='+'b'.repeat(43),saved,100001)).toBe('b'.repeat(43));expect(setupToken('#token=invalid',storage(),100001)).toBe(''); });
