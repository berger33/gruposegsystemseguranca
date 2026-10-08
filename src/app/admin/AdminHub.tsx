"use client";

// F01 — hub inicial de /admin: depois do gate, lista somente os módulos do
// papel da sessão. Cada módulo continua protegido pela própria API; o hub é
// navegação, não concessão de acesso.

import AdminGate, { modulesForRole } from "./AdminGate";
import { roleLabel } from "../../lib/admin-entry.mjs";
import { groupAdminModules } from "../../lib/admin-navigation.mjs";
import UiCardLink from "../../components/ui/UiCardLink";
import styles from "./AdminChrome.module.css";

const MODULE_DESCRIPTIONS: Record<string, string> = {
  "/admin/marcelo": "Indicadores, aprovações, metas, relatórios e configurações da administração.",
  "/admin/funcionarios": "Cadastro, admissão, documentos, ausências, benefícios e demais rotinas de RH.",
  "/admin/crm": "Unidades, contatos, oportunidades, agenda, tarefas e cadências comerciais.",
  "/admin/carteira": "Grupos e unidades da carteira com renovações e próximas ações.",
  "/admin/leads": "Pedidos vindos do site público e métricas de origem.",
  "/admin/contratos": "Contratos canônicos, implantação, aditivos, alertas e encerramento.",
  "/admin/financeiro": "Contas, conciliação, cobrança, orçamento, exportações e fechamento.",
  "/admin/operacao": "Postos, alocações, coberturas, turnos, ocorrências e checklists.",
  "/admin/patrimonio": "Estoque, ativos, inventário, ordens de serviço e manutenção.",
  "/admin/clientes": "Cadastros centrais, vínculos, contratos, documentos e chamados do portal.",
  "/admin/compliance": "Obrigações legais, documentos, tarefas e execuções programadas.",
  "/admin/conhecimento": "Conteúdo interno com revisão e publicação controladas.",
  "/admin/expansao": "Planos e cenários de expansão para decisão da equipe.",
  "/admin/analytics": "Experimentos internos com aprovação e observações registradas.",
  "/admin/relatorios": "Relatórios periódicos e histórico de execução.",
  "/admin/inteligencia": "Sugestões comerciais baseadas em evidências internas e decisão humana.",
  "/admin/emergencial": "Configuração e testes internos de canais de apoio; sem envio externo automático.",
  "/admin/frota": "Veículos, responsáveis, abastecimento, manutenção e documentos.",
  "/admin/terceiros": "Terceiros com janelas de acesso autorizadas e revogadas.",
  "/admin/licitacoes": "Editais, propostas versionadas, resultados e alertas.",
  "/admin/fornecedores": "Fornecedores, cotações, decisões e pedidos (jornada interna).",
  "/admin/qualidade": "Não conformidades, causas, ações, verificações e reincidências.",
  "/admin/satisfacao": "Pesquisas, respostas e planos de ação da carteira.",
  "/admin/portal": "Convites, autocadastro, solicitações de acesso e alertas de segurança.",
  "/admin/ti": "Camada técnica (protótipo descritivo; consoles operados por gates dedicados).",
};

export default function AdminHub() {
  return (
    <AdminGate>
      {(session) => (
        <section className={styles.card} data-admin-hub="true">
          <h1>Área administrativa</h1>
          <p className={styles.hint}>
            Sessão ativa como <strong>{roleLabel(session.role)}</strong>. Os módulos abaixo são os previstos para o
            seu papel; cada área confirma a permissão novamente no servidor antes de qualquer leitura ou escrita.
          </p>
          {groupAdminModules(modulesForRole(session.role)).map((group) => (
            <section key={group.id} className={styles.hubSection} aria-labelledby={`hub-${group.id}`}>
              <h2 id={`hub-${group.id}`}>{group.label}</h2>
              <div className={styles.hubGrid}>
                {group.modules.map((mod) => (
                  <UiCardLink key={mod.href} href={mod.href} label={mod.label} description={MODULE_DESCRIPTIONS[mod.href] || "Módulo administrativo."} />
                ))}
              </div>
            </section>
          ))}
          {modulesForRole(session.role).length === 0 ? (
            <p className={styles.hint}>
              Nenhum módulo previsto para este papel. Se precisa de acesso operacional, fale com o TI.
            </p>
          ) : null}
        </section>
      )}
    </AdminGate>
  );
}
