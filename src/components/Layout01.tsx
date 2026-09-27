import styles from "./Layout01.module.css";

export default function Layout01() {
  return (
    <main className={styles.framePage}>
      <iframe
        className={styles.frame}
        src="/visuals/layout-01/index.html"
        title="Layout 01 — Institucional clássica"
        loading="eager"
      />
    </main>
  );
}
