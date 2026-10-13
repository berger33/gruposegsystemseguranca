"use client";

import { useEffect, useState } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./BackupCatalog.module.css";

type Backup = {
  id: string;
  backup_type?: string | null;
  recorded_status?: string | null;
  recorded_is_restore_tested?: boolean;
  status?: string | null;
  storage_location?: string | null;
  checksum?: string | null;
  created_at?: string | null;
  retention_until?: string | null;
};

type Restore = {
  id: string;
  restore_type?: string | null;
  recorded_status?: string | null;
  status?: string | null;
  target_env?: string | null;
  is_isolated?: boolean;
  created_at?: string | null;
};

type RetentionPolicy = {
  id: string;
  category?: string | null;
  retention_days?: number | null;
  description?: string | null;
};

type Catalog = {
  backups: Backup[];
  restores: Restore[];
  policies: RetentionPolicy[];
  expiredCount: number;
};

const emptyCatalog: Catalog = { backups: [], restores: [], policies: [], expiredCount: 0 };
const date = (value?: string | null) => {
  if (!value) return "Não informado";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Data inválida no registro" : parsed.toLocaleString("pt-BR");
};
const yesNo = (value?: boolean) => typeof value !== "boolean" ? "Não informado" : `${value ? "Sim" : "Não"} (declaração histórica)`;

/** Catálogo histórico PLT-08. Não executa, promete ou certifica backups. */
export default function BackupClient() {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "denied" | "error">("idle");

  async function loadAll() {
    setState("loading");
    try {
      const responses = await Promise.all([
        fetch("/api/admin/backups", { cache: "no-store" }),
        fetch("/api/admin/backups/restores", { cache: "no-store" }),
        fetch("/api/admin/backups/retention", { cache: "no-store" }),
      ]);
      if (responses.some(response => response.status === 401 || response.status === 403)) {
        setState("denied");
        return;
      }
      if (responses.some(response => !response.ok)) throw new Error("catalog_unavailable");
      const [backups, restores, retention] = await Promise.all(responses.map(response => response.json()));
      setCatalog({
        backups: backups.backups || [],
        restores: restores.restores || [],
        policies: retention.policies || [],
        expiredCount: Number(retention.expired_count) || 0,
      });
      setState("loaded");
    } catch {
      setState("error");
    }
  }

  useEffect(() => { void loadAll(); }, []);

  return (
    <section className={styles.workspace} aria-labelledby="backup-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Operação · PLT-08</p>
          <h2 id="backup-title">Catálogo de backup</h2>
          <p>Consulte declarações históricas de jobs, restaurações e prazos cadastrados.</p>
        </div>
        <button className={styles.refresh} type="button" onClick={() => void loadAll()} disabled={state === "loading"}>
          {state === "loading" ? "Atualizando…" : "Atualizar registros"}
        </button>
      </header>

      <aside className={styles.notice} aria-label="Limite operacional do catálogo">
        <strong>Este catálogo não executa nem verifica backups ou restaurações.</strong>
        <p>Estados, checksums, flags e prazos são metadados legados. Eles não comprovam a existência de arquivos, proteção, retenção física ou recuperação testada; não autorizam uso em produção.</p>
      </aside>

      {state === "loading" && <UiState variant="loading" title="Consultando os registros de backup e retenção" />}
      {state === "denied" && <UiState variant="denied" title="A consulta exige uma sessão de TI ou administração autorizada" detail="Nenhum registro protegido foi exibido." />}
      {state === "error" && <UiState variant="error" title="Não foi possível consultar o catálogo" detail="Nenhuma operação de backup ou restauração foi iniciada." onRetry={() => void loadAll()} />}
      {state === "loaded" && (
        <>
          <div className={styles.metrics} aria-label="Resumo dos registros consultados">
            <div className={styles.metric}><strong>{catalog.backups.length}</strong><span>jobs legados</span></div>
            <div className={styles.metric}><strong>{catalog.restores.length}</strong><span>restaurações declaradas</span></div>
            <div className={styles.metric}><strong>{catalog.policies.length}</strong><span>políticas de retenção declaradas</span></div>
            <div className={styles.metric}><strong>{catalog.expiredCount}</strong><span>registros com prazo declarado vencido</span></div>
          </div>
          <p className={styles.summaryNote}>Contagens refletem os registros devolvidos pelas APIs. Prazo vencido não significa que um arquivo foi eliminado; retenção e descarte físico não são verificados por esta tela.</p>

          <div className={styles.sections}>
            <section className={styles.subsection} aria-labelledby="backup-jobs-title">
              <div className={styles.sectionHeading}><div><h3 id="backup-jobs-title">Jobs registrados</h3><p>O status atual é sempre tratado como não verificado.</p></div><span className={styles.count}>{catalog.backups.length} registros</span></div>
              {catalog.backups.length === 0 ? <UiState variant="empty" title="Nenhum job legado encontrado" detail="A consulta foi concluída; isso não comprova que exista ou não um backup fora do catálogo." /> : (
                <div className={styles.cards}>
                  {catalog.backups.map(backup => (
                    <article className={styles.card} key={backup.id}>
                      <div className={styles.cardHeading}><div><h4>{backup.backup_type || "Tipo não informado"}</h4><span className={styles.muted}>Registrado em {date(backup.created_at)}</span></div><span className={styles.badge}>Não verificado</span></div>
                      <dl className={styles.facts}><div><dt>Status salvo no registro</dt><dd>{backup.recorded_status || "Não informado"}</dd></div><div><dt>Teste de restauração declarado</dt><dd>{yesNo(backup.recorded_is_restore_tested)}</dd></div></dl>
                      <details className={styles.details}><summary>Ver metadados declarados</summary><dl className={styles.facts}><div><dt>Localização declarada</dt><dd className={styles.breakable}>{backup.storage_location || "Não informada"}</dd></div><div><dt>Checksum declarado</dt><dd className={styles.breakable}>{backup.checksum || "Não informado"}</dd></div><div><dt>Prazo registrado</dt><dd>{date(backup.retention_until)}</dd></div><div><dt>Identificador</dt><dd className={styles.breakable}>{backup.id}</dd></div></dl></details>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.subsection} aria-labelledby="backup-restores-title">
              <div className={styles.sectionHeading}><div><h3 id="backup-restores-title">Restaurações registradas</h3><p>Os dados não confirmam que uma restauração tenha sido executada.</p></div><span className={styles.count}>{catalog.restores.length} registros</span></div>
              {catalog.restores.length === 0 ? <UiState variant="empty" title="Nenhuma restauração legada encontrada" detail="A consulta foi concluída; nenhum teste foi iniciado por esta tela." /> : (
                <div className={styles.cards}>
                  {catalog.restores.map(restore => (
                    <article className={styles.card} key={restore.id}>
                      <div className={styles.cardHeading}><div><h4>{restore.restore_type || "Tipo não informado"}</h4><span className={styles.muted}>Registrada em {date(restore.created_at)}</span></div><span className={styles.badge}>Não verificada</span></div>
                      <dl className={styles.facts}><div><dt>Status salvo no registro</dt><dd>{restore.recorded_status || "Não informado"}</dd></div><div><dt>Alvo declarado</dt><dd>{restore.target_env || "Não informado"}</dd></div><div><dt>Isolamento declarado</dt><dd>{yesNo(restore.is_isolated)}</dd></div></dl>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.subsection} aria-labelledby="backup-retention-title">
              <div className={styles.sectionHeading}><div><h3 id="backup-retention-title">Prazos declarados</h3><p>As regras listadas não aplicam retenção nem descarte a arquivos físicos.</p></div><span className={styles.count}>{catalog.policies.length} categorias</span></div>
              {catalog.policies.length === 0 ? <UiState variant="empty" title="Nenhuma política declarativa encontrada" detail="A consulta foi concluída; não há prazos para mostrar no catálogo." /> : (
                <div className={styles.policyList}>
                  {catalog.policies.map(policy => <article className={styles.policy} key={policy.id}><div><h4>{policy.category || "Categoria não informada"}</h4>{policy.description && <p>{policy.description}</p>}</div><strong>{policy.retention_days ?? "—"}<span> dias declarados</span></strong></article>)}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
