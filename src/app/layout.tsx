import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'FiberMap · Gestão de redes ópticas', description: 'Planejamento, documentação e rastreamento de redes FTTH.' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="pt-BR"><body>{children}</body></html>; }
