"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import RagWidget from "@/components/RagWidget";
import styles from "@/components/ui/UiWorkspace.module.css";

export default function ClienteAssistentePage() {
  return (
    <UiTaskWorkspace className={styles.workspace}>
      <h1>Assistente Cliente</h1>
      <p className={styles.lede}>
        Respostas baseadas em documentos publicados para as contas vinculadas ao seu acesso. O vínculo é conferido no servidor a cada pergunta; sem vínculo ativo, a consulta retorna ausência de conteúdo publicado — nunca conteúdo de outra conta.
      </p>

      <RagWidget
        ragKey="cliente"
        title="RAG Cliente"
        description="Portal cliente com entrada única, contratos itens vigência escopo claro, documentos categoria validade versão download privado, chamados protocolo SLA, agenda visita, relatórios execução, cobranças somente financeiro integrado, solicitação serviço adicional gera oportunidade CRM, satisfação, renovação, modos convite, segurança conta MFA, reclamação colaborador canal restrito"
        placeholder="Ex: como consultar meus contratos? como baixar documento? como abrir chamado? qual status minha fatura?"
      />

      <section className={styles.footnote}>
        O assistente não substitui os registros oficiais. Sem trecho publicado relacionado, ele informa a ausência e o modelo local não é chamado — nada é inventado para preencher a tela.
      </section>
    </UiTaskWorkspace>
  );
}
