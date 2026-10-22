export const kinds = { POP: 'POP', OLT: 'OLT', DIO: 'DIO', BACKBONE: 'Backbone', DISTRIBUTION: 'Distribuição', DERIVATION: 'Derivação', DROP: 'Drop', CLOSURE: 'Caixa de emenda', CTO: 'CTO', SPLITTER: 'Splitter', CUSTOMER: 'Cliente', POLE: 'Poste', DUCT: 'Duto', RESERVE: 'Reserva técnica', COVERAGE:'Cobertura', WAYPOINT:'Ponto de passagem', IMPORTED:'Importado' };
export const statuses = { PLANNED: 'Planejado', INSTALLED: 'Instalado', MAINTENANCE: 'Em manutenção', DISABLED: 'Desativado' };
export type Geometry = { type: 'Point'; coordinates: [number, number] } | { type: 'LineString'; coordinates: [number, number][] };
export type Terminal = { id: string; label: string; kind: string; links: unknown[] };
export type Asset = { id: string; code: string; name: string; kind: keyof typeof kinds; status: keyof typeof statuses; geometry: Geometry; version: number; terminals: Terminal[]; fibers: { id: string; number: number; color: string; status: string; terminals: Terminal[] }[] };
