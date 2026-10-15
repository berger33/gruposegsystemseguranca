import { SITE_VISUAL_OPTIONS, type SiteVisualId } from "@/lib/site-visuals";
import styles from "./SitePreviewNotice.module.css";

/**
 * Faixa de prévia (UX-PRO-08C): declara, no corpo da página, que a rota é uma
 * prévia interna — não é o site público — e como o layout publicado muda.
 * Componente sem estado (server-safe), usado por /layout-preview e
 * /layout-01..10. Não altera nenhum layout nem o fluxo de publicação.
 */
export default function SitePreviewNotice({
  visual,
  invalidRequested = false,
}: {
  visual: SiteVisualId;
  invalidRequested?: boolean;
}) {
  const option = SITE_VISUAL_OPTIONS.find((o) => o.id === visual);
  return (
    <section
      className={styles.notice}
      data-testid="site-preview-notice"
      aria-label={`Prévia interna do layout ${visual}`}
    >
      <p className={styles.title}>
        <strong>Prévia interna</strong> — Layout {visual}
        {option ? ` · ${option.name}` : ""}
      </p>
      <p className={styles.text}>
        {invalidRequested
          ? `O layout pedido no endereço não foi reconhecido; esta é a prévia do layout ${visual} (padrão). `
          : ""}
        Esta página é apenas uma prévia: não é o site público e não altera o que
        os visitantes veem. O layout publicado só muda em Aparência do site, com
        confirmação, motivo e registro em auditoria.
      </p>
      <nav className={styles.links} aria-label="Ações da prévia">
        <a href="/admin/aparencia">Abrir Aparência do site</a>
        <a href="/">Ver site atual</a>
      </nav>
    </section>
  );
}
