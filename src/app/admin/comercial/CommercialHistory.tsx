"use client";
import { useState, type FormEvent } from "react";
import styles from "./Comercial.module.css";

// UX-PRO-06 (comercial): o histórico continua sendo uma consulta de leitura
// pela mesma rota e com os mesmos tipos e campos. O que muda é a leitura dos
// estados: resultado vazio é dito como vazio; identificador inválido e negativa
// de papel são explicados sem o código técnico e não oferecem repetição; uma
// falha depois de leitura concluída mantém a última versão lida, declara a hora
// e permite repetir. Nenhuma regra de permissão, payload ou auditoria mudou —
// a autorização continua no servidor (GET /api/crm/commercial-versions).

const TIPOS: ReadonlyArray<readonly [string, string]> = [
  ["crm_goals", "Meta"],
  ["crm_commission_rules", "Regra de comissão"],
  ["crm_commissions", "Comissão"],
  ["crm_commercial_library", "Biblioteca"],
];

const CAMPOS_OCULTOS = ["id", "created_by_id", "responsible_id", "approved_by", "file_url"];

type Consulta = { type: string; id: string };
type Falha = {
  classe: "negado" | "identificador" | "repetir";
  mensagem: string;
};
type Versao = { version: number; snapshot: Record<string, any>; created_at?: string };

function horaAgora(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Traduz a resposta sem expor o código técnico do servidor ao usuário. */
function classificarFalha(status: number | null, codigo: string | null, erroDeRede: boolean): Falha {
  if (erroDeRede) {
    return {
      classe: "repetir",
      mensagem: "Não foi possível falar com o servidor (falha de rede).",
    };
  }
  if (status === 401 || status === 403 || codigo === "role_required" || codigo === "session_required") {
    return {
      classe: "negado",
      mensagem:
        "Seu perfil não tem permissão para consultar o histórico de versões. Essa consulta é restrita a Marcelo, admin e TI. Nada foi alterado.",
    };
  }
  if (status === 400 || codigo === "invalid_entity") {
    return {
      classe: "identificador",
      mensagem:
        "Confira o identificador do registro (um código no formato UUID) e o tipo escolhido, e consulte de novo.",
    };
  }
  return {
    classe: "repetir",
    mensagem: `O servidor não conseguiu responder a consulta agora${status ? ` (HTTP ${status})` : ""}.`,
  };
}

export default function CommercialHistory() {
  const [type, setType] = useState("crm_goals");
  const [id, setId] = useState("");
  const [rows, setRows] = useState<Versao[] | null>(null);
  const [hora, setHora] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [falha, setFalha] = useState<Falha | null>(null);
  const [ultima, setUltima] = useState<Consulta | null>(null);
  const [recuperada, setRecuperada] = useState(false);

  async function consultar(consulta: Consulta) {
    if (consultando) return;
    setUltima(consulta);
    setConsultando(true);
    setFalha(null);
    setRecuperada(false);
    const teveLeituraAnterior = rows !== null;
    try {
      const r = await fetch(
        "/api/crm/commercial-versions?type=" + encodeURIComponent(consulta.type) + "&id=" + encodeURIComponent(consulta.id),
      );
      const b = await r.json().catch(() => ({}));
      if (!r.ok) {
        const erro = classificarFalha(r.status, typeof b?.error === "string" ? b.error : null, false);
        throw erro;
      }
      const itens: Versao[] = Array.isArray(b.items) ? b.items : [];
      setRows(itens);
      setHora(horaAgora());
      setRecuperada(teveLeituraAnterior);
    } catch (erro: any) {
      const classificado: Falha = erro && typeof erro === "object" && "classe" in erro
        ? erro
        : classificarFalha(null, null, true);
      // Negativa e identificador inválido não podem manter dado de leitura
      // anterior: quem não tem permissão não vê o que já carregou, e um
      // identificador recusado não corresponde à lista exibida.
      if (classificado.classe !== "repetir") {
        setRows(null);
        setHora("");
      }
      setFalha(classificado);
    } finally {
      setConsultando(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void consultar({ type, id });
  }

  const desatualizado = falha?.classe === "repetir" && rows !== null;

  return (
    <section className={styles.historico}>
      <h2 className={styles.historicoTitulo}>Histórico de versões comerciais</h2>
      <p className={styles.hint}>
        Consulta da gestão por identificador do registro. As versões anteriores são preservadas; nenhuma comissão é
        paga automaticamente. A consulta é feita por Marcelo, admin e TI.
      </p>
      <form onSubmit={submit} className={styles.historicoForm}>
        <label className={styles.campo}>
          Tipo de registro
          <select value={type} onChange={e => setType(e.target.value)} className={styles.controle}>
            {TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className={styles.campo}>
          Identificador do registro
          <input value={id} onChange={e => setId(e.target.value)} required className={styles.controle} />
        </label>
        <button type="submit" disabled={consultando} className={styles.botao} aria-busy={consultando}>
          Consultar versões
        </button>
      </form>

      {consultando && (
        <p role="status" className={styles.status} data-testid="historico-consultando">
          Consultando o histórico de versões…
        </p>
      )}

      {falha && desatualizado && (
        <div role="alert" className={styles.aviso} data-testid="historico-desatualizado">
          <p><strong>Não foi possível atualizar o histórico.</strong> {falha.mensagem}</p>
          <p>
            Os registros abaixo são da última consulta concluída, às {hora}, e podem estar desatualizados. Isso não
            significa que o registro esteja sem versões.
          </p>
          <button
            type="button"
            className={styles.botao}
            disabled={consultando || !ultima}
            onClick={() => ultima && consultar(ultima)}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {falha && !desatualizado && (
        <div role="alert" className={styles.aviso}>
          <p>{falha.mensagem}</p>
          {falha.classe === "repetir" && (
            <>
              <p>Nenhuma versão foi lida nesta tentativa; isso não significa que o registro não tenha histórico.</p>
              <button
                type="button"
                className={styles.botao}
                disabled={consultando || !ultima}
                onClick={() => ultima && consultar(ultima)}
              >
                Tentar novamente
              </button>
            </>
          )}
        </div>
      )}

      {recuperada && !falha && (
        <p role="status" className={styles.status} data-testid="historico-atualizado">
          Histórico atualizado às {hora}.
        </p>
      )}

      {rows !== null && !falha && rows.length === 0 && (
        <p role="status" className={styles.status} data-testid="historico-vazio">
          Nenhuma versão encontrada para este tipo e identificador (consulta de {hora}).
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <div className={styles.versoes}>
          {rows.map(r => (
            <article key={r.version} className={styles.versao}>
              <h3 className={styles.versaoTitulo}>Versão {r.version} — {r.snapshot.status}</h3>
              <p>{r.snapshot.title || r.snapshot.name}</p>
              <dl className={styles.dl}>
                {Object.entries(r.snapshot)
                  .filter(([k, v]) => v !== null && !CAMPOS_OCULTOS.includes(k))
                  .map(([k, v]) => (
                    <div key={k} className={styles.dlLinha}>
                      <dt>{k}</dt>
                      <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                    </div>
                  ))}
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
