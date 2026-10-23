import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Download, ExternalLink, BookOpen } from "lucide-react";
import styles from "./page.module.css";
export const metadata = { title: "Ajuda e manual | FiberMap" };
export default async function HelpPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return (
    <main className={styles.page}>
      <header>
        <a href="/" className={styles.brand}>
          FiberMap <span>Central de ajuda</span>
        </a>
        <a href="/conta">Minha conta</a>
      </header>
      <section className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>
            <BookOpen size={16} /> MANUAL DO USUÁRIO
          </span>
          <h1>Sua rede, do mapa à fibra.</h1>
          <p>
            Consulte o passo a passo das funções do FiberMap e os modelos
            visuais de montagem do diagrama óptico.
          </p>
        </div>
        <div className={styles.actions}>
          <a href="/api/help/manual" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} />
            Abrir PDF
          </a>
          <a href="/api/help/manual?download=1" download="Manual_FiberMap.pdf">
            <Download size={18} />
            Baixar PDF
          </a>
        </div>
      </section>
      <section className={styles.topics} aria-label="Conteúdo do manual">
        <article>
          <b>01 · Mapa e inventário</b>
          <p>
            Navegação, satélite, localização, equipamentos, cabos e importação
            de rede.
          </p>
        </article>
        <article>
          <b>02 · Diagrama óptico</b>
          <p>
            Fibras, tubos, fusões, lotes, splitters, sangria e exemplos visuais
            de montagem.
          </p>
        </article>
        <article>
          <b>03 · Gestão e acesso</b>
          <p>
            Conta, empresas, permissões, licenças, auditoria e boas práticas de
            salvamento.
          </p>
        </article>
      </section>
      <section className={styles.reader} aria-label="Leitor do manual">
        <div>
          <strong>Manual completo com modelos visuais</strong>
          <span>
            Se o leitor não aparecer no seu navegador, use Abrir PDF ou Baixar
            PDF.
          </span>
        </div>
        <iframe
          src="/api/help/manual#view=FitH"
          title="Manual do usuário FiberMap em PDF"
        />
      </section>
      <footer>
        Ajuda aberta em uma aba separada. Você pode voltar à sua montagem sem
        perder as alterações.
      </footer>
    </main>
  );
}
