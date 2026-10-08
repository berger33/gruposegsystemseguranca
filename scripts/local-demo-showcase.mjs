// Presentation fixtures for the isolated, persistent local demo only.
// All records are labelled as synthetic and deliberately avoid real personal,
// legal, financial, client-contact, or location data.
import { createHash, randomUUID } from 'node:crypto';

const SYNTHETIC = 'DEMONSTRAÇÃO FICTÍCIA — sem validade operacional';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export async function seedShowcase(client, { staff, employeeId, employeeIdentityId, accounts }) {
  const actor = (role) => staff.find((item) => item.role === role)?.id;
  const ti = actor('ti'), rh = actor('rh'), marcelo = actor('marcelo'), comercial = actor('comercial');
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const [crmCompanyA, crmCompanyB, crmContactA, crmContactB, opportunityA, opportunityB, unitA, unitB] =
    Array.from({ length: 8 }, () => randomUUID());

  await client.query(`INSERT INTO crm_companies
    (id,display_name,segment,city,state,type,status,notes,origin,created_by,created_by_id,responsible_id,responsible_name)
    VALUES
    ($1,'DEMO FICTÍCIA — Horizonte Serviços','Serviços demonstrativos','Cidade fictícia','SP','prospect','active',$2,'demonstração','comercial',$3,$3,'Comercial demonstração'),
    ($4,'DEMO FICTÍCIA — Nexo Corporativo','Serviços demonstrativos','Cidade fictícia','SP','client','active',$2,'demonstração','marcelo',$5,$5,'Administração demonstração')`,
  [crmCompanyA, SYNTHETIC, comercial, crmCompanyB, marcelo]);
  await client.query(`INSERT INTO crm_company_units (id,company_id,display_name,city,is_main)
    VALUES ($1,$2,'Unidade demonstrativa A','Cidade fictícia',true),($3,$4,'Unidade demonstrativa B','Cidade fictícia',true)`,
  [unitA, crmCompanyA, unitB, crmCompanyB]);
  await client.query(`INSERT INTO crm_contacts
    (id,company_id,display_name,email,role,buying_role,origin,is_primary,created_by_id)
    VALUES ($1,$2,'Contato fictício — Horizonte','contato.horizonte@example.invalid','decisor','decisor','massa sintética',true,$3),
           ($4,$5,'Contato fictício — Nexo','contato.nexo@example.invalid','influenciador','influenciador','massa sintética',true,$6)`,
  [crmContactA, crmCompanyA, comercial, crmContactB, crmCompanyB, marcelo]);
  await client.query(`INSERT INTO crm_opportunities
    (id,company_id,contact_id,unit_id,title,service_name,need_description,responsible_id,responsible_name,
     forecast_date,estimated_value,next_action,next_action_date,origin,priority,stage,created_by_id)
    VALUES ($1,$2,$3,$4,'DEMO — Prospecção de portaria','Portaria demonstrativa',$5,$6,'Comercial demonstração',
            CURRENT_DATE+30,12500,'Preparar levantamento fictício',NOW()+INTERVAL '2 days','demonstração','media','qualificacao',$6),
           ($7,$8,$9,$10,'DEMO — Renovação de vigilância','Vigilância demonstrativa',$11,$12,'Administração demonstração',
            CURRENT_DATE+45,18750,'Revisar escopo demonstrativo',NOW()+INTERVAL '5 days','demonstração','alta','proposta_elaboracao',$12)`,
  [opportunityA, crmCompanyA, crmContactA, unitA, `${SYNTHETIC}.`, comercial, opportunityB, crmCompanyB, crmContactB, unitB,
    `${SYNTHETIC}. Valores e prazos servem apenas para visualizar o funil.`, marcelo]);
  await client.query(`INSERT INTO crm_opportunity_stages (id,opportunity_id,next_stage,changed_by_id,changed_by_role,reason)
    VALUES ($1,$2,'qualificacao',$3,'comercial',$4),($5,$6,'proposta_elaboracao',$7,'marcelo',$4)`,
  [randomUUID(), opportunityA, comercial, SYNTHETIC, randomUUID(), opportunityB, marcelo]);
  await client.query(`INSERT INTO crm_tasks
    (id,opportunity_id,company_id,title,description,responsible_id,due_date,status,priority,created_by_id)
    VALUES ($1,$2,$3,'DEMO — Preparar roteiro de reunião',$4,$5,NOW()+INTERVAL '2 days','aberta','media',$5),
           ($6,$7,$8,'DEMO — Revisar proposta fictícia',$4,$9,NOW()+INTERVAL '4 days','em_andamento','alta',$9)`,
  [randomUUID(), opportunityA, crmCompanyA, SYNTHETIC, comercial, randomUUID(), opportunityB, crmCompanyB, marcelo]);
  await client.query(`INSERT INTO crm_interactions
    (id,company_id,opportunity_id,contact_id,type,title,details,occurred_at,created_by_id)
    VALUES ($1,$2,$3,$4,'nota','DEMO — Registro de prospecção',$5,NOW()-INTERVAL '1 day',$6),
           ($7,$8,$9,$10,'reuniao','DEMO — Reunião simulada',$5,NOW()-INTERVAL '3 days',$11)`,
  [randomUUID(), crmCompanyA, opportunityA, crmContactA, SYNTHETIC, comercial,
    randomUUID(), crmCompanyB, opportunityB, crmContactB, marcelo]);

  // A pending correction is useful to demonstrate the employee -> HR review
  // path. There are no fabricated coordinates, punches, address claims or GPS.
  const timeEntryId = randomUUID();
  await client.query(`INSERT INTO hr_time_entries
    (id,employee_id,entry_date,clock_in,clock_out,hours_worked,source,status,justification,competence,created_by,created_by_id)
    VALUES ($1,$2,CURRENT_DATE,'08:00','16:00',8,'manual','pendente',$3,
            to_char(CURRENT_DATE,'YYYY-MM'),'demo_local',$4)`,
  [timeEntryId, employeeId, `${SYNTHETIC}. Marcação sem localização associada.`, employeeIdentityId]);
  await client.query(`INSERT INTO emp_journey_corrections
    (id,employee_id,time_entry_id,original_snapshot,requested_changes,reason,created_by,created_by_id)
    VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$7)`,
  [randomUUID(), employeeId, timeEntryId,
    JSON.stringify({ entry_date: today, clock_in: '08:00', clock_out: '16:00', hours_worked: 8 }),
    JSON.stringify({ clock_out: '16:30', hours_worked: 8.5, justification: `${SYNTHETIC}.` }),
    `${SYNTHETIC}. Solicitação pré-carregada apenas para demonstrar análise pelo RH.`, employeeIdentityId]);

  // Internal compliance references are private declarations, never files or
  // evidence of a real licence, legal requirement, verification or expiry.
  const obligationId = randomUUID(), documentId = randomUUID(), complianceTaskId = randomUUID();
  const demoProtocol = `COMP-EXT-${today}-DEMO`;
  await client.query(`INSERT INTO ext_compliance_obligations
    (id,obligation_type,title,description,declared_source,applicability_scope,applicability_justification,
     validity_rule,renewal_lead_days,criticality,status,responsible_identity,created_by_identity)
    VALUES ($1,'outro','DEMO — Revisão de referência interna',$2,$3,'Ambiente local isolado',$4,
            'Prazo demonstrativo; validar com responsável antes de qualquer uso.',30,'baixa','a_vencer',$5,$6)`,
  [obligationId, `${SYNTHETIC}. Não representa obrigação legal ou regulatória.`, `${SYNTHETIC}; fonte não oficial.`,
    `${SYNTHETIC}. Nenhuma obrigação foi atribuída à empresa.`, ti, ti]);
  await client.query(`INSERT INTO ext_compliance_documents
    (id,protocol,title,description,compliance_type,status,document_number,issuer,responsible_name,responsible_identity,
     issue_date,expiry_date,is_private,created_by_identity,origin,effective_start_date,validity_rule,evaluation_date,
     reference_type,declared_reference,reference_source,obligation_id,version_no)
    VALUES ($1,$2,'DEMO — Referência sem arquivo',$3,'outro','a_vencer','DEMO-REF-001','Fonte fictícia',
     'TI demonstração',$4,CURRENT_DATE-30,CURRENT_DATE+30,true,$4,'ext07_canonica',CURRENT_DATE-30,
     'Prazo fictício de demonstração',CURRENT_DATE,'outro_declarado','DEMO-REF-001',$5,$6,1)`,
  [documentId, demoProtocol, `${SYNTHETIC}. Este registro não contém arquivo, licença, protocolo público ou verificação.`, ti,
    `${SYNTHETIC}; referência ilustrativa.`, obligationId]);
  await client.query(`INSERT INTO ext_compliance_tasks
    (id,obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,created_by_identity)
    VALUES ($1,$2,$3,$4,'Revisão demonstrativa sem regra jurídica',CURRENT_DATE,CURRENT_DATE+15,$5::jsonb,$6,$6)`,
  [complianceTaskId, obligationId, documentId, `DEMO-${today}`, JSON.stringify({ synthetic: true, note: SYNTHETIC }), ti]);
  await client.query(`INSERT INTO ext_compliance_action_plans
    (id,obligation_id,document_id,task_id,plan_type,title,description,root_cause,status,due_date,responsible_identity,created_by_identity)
    VALUES ($1,$2,$3,$4,'preventivo','DEMO — Conferir referência fictícia',$5,$6,'aberto',CURRENT_DATE+20,$7,$7)`,
  [randomUUID(), obligationId, documentId, complianceTaskId, `${SYNTHETIC}. Nenhuma tarefa real é atribuída.`,
    `${SYNTHETIC}. Registro criado para visualizar o fluxo de ação.`, ti]);

  // A single internal guide plus draft plans make those areas navigable while
  // keeping human approvals, exercises, and external delivery unclaimed.
  await client.query(`INSERT INTO ext_knowledge_base
    (id,slug,title,content,category,status,version,is_published,published_at,approved_by_identity,tags,access_roles,
     created_by_identity,origin,summary,review_notes,reviewed_by_identity,reviewed_at,published_by_identity)
    VALUES ($1,'demo-rotina-interna','DEMO — Como apresentar um fluxo interno',$2,'Demonstração','publicado',1,true,NOW(),$3,
     ARRAY['demonstração','fluxo'],ARRAY['rh','marcelo','ti'],$3,'ext08_canonica',$4,$5,$3,NOW(),$3)`,
  [randomUUID(), `${SYNTHETIC}. Use este artigo para percorrer telas, conferir estados e explicar a navegação. Não é política interna, orientação jurídica ou procedimento aprovado da empresa.`,
    ti, 'Roteiro sintético para explorar a demonstração.', `${SYNTHETIC}. Conteúdo ilustrativo publicado somente no banco local de demonstração.`]);
  const expansionId = randomUUID();
  await client.query(`INSERT INTO ext_expansion_plans
    (id,protocol,title,description,premises,target_location,capacity,estimated_cost_cents,estimated_revenue_cents,
     status,is_estimate,estimate_note,created_by_identity,justification,idempotency_key,request_fingerprint)
    VALUES ($1,$2,'DEMO — Cenário de expansão fictício',$3,$4,'Localidade fictícia',3,100000,150000,'rascunho',true,$5,$6,$7,$8,$9)`,
  [expansionId, `EXP-EXT-${today}-DEMO`, `${SYNTHETIC}. Nenhuma unidade será aberta.`,
    `${SYNTHETIC}. Premissas inventadas para visualizar o formulário.`,
    'Estimativa didática apenas; não é projeção comercial nem aprovação.', marcelo,
    `${SYNTHETIC}. Permanece em rascunho para decisão humana.`, `demo-${today}-expansion`, sha256(`demo-expansion-${today}`)]);
  await client.query(`INSERT INTO ext_expansion_scenarios
    (plan_id,scenario_name,premises,projected_cost_cents,projected_revenue_cents,is_estimate,estimate_note)
    VALUES ($1,'DEMO — Cenário base',$2,100000,150000,true,$3)`,
  [expansionId, `${SYNTHETIC}. Valores demonstrativos sem previsão ou compromisso.`, 'Valores fictícios para apresentação, não usar para decisão.']);
  const continuityId = randomUUID();
  await client.query(`INSERT INTO ext_continuity_plans
    (id,protocol,title,description,client_account_id,contacts,contingency_steps,recovery_steps,status,
     responsible_name,responsible_identity,created_by_identity,justification,idempotency_key,request_fingerprint)
    VALUES ($1,$2,'DEMO — Plano de continuidade fictício',$3,$4,'[]'::jsonb,$5::jsonb,$6::jsonb,'rascunho',
     'TI demonstração',$7,$7,$8,$9,$10)`,
  [continuityId, `CONT-EXT-${today}-DEMO`, `${SYNTHETIC}. Sem exercício ou contato real.`, accounts[0],
    JSON.stringify([{ step: 'Etapa ilustrativa', note: SYNTHETIC }]), JSON.stringify([{ step: 'Recuperação ilustrativa', note: SYNTHETIC }]),
    ti, `${SYNTHETIC}. Plano permanece em rascunho.`, `demo-${today}-continuity`, sha256(`demo-continuity-${today}`)]);

  // These presets are deliberately marked as examples and remain pending or
  // draft; there are no payments, approvals, observations, or real incidents.
  const costCenterId = randomUUID(), supplierId = randomUUID(), proposalId = randomUUID(), contractId = randomUUID();
  await client.query(`INSERT INTO fin_cost_centers (id,name,description)
    VALUES ($1,'DEMO — Centro de custo fictício',$2)`, [costCenterId, `${SYNTHETIC}.`]);
  await client.query(`INSERT INTO fin_suppliers (id,name,category)
    VALUES ($1,'DEMO — Fornecedor fictício','outro')`, [supplierId]);
  await client.query(`INSERT INTO crm_proposals
    (id,company_id,opportunity_id,title,status,scope_description,conditions,notes,created_by,created_by_id)
    VALUES ($1,$2,$3,'DEMO — Proposta sem aceite','rascunho',$4,$5,$6,'marcelo',$7)`,
  [proposalId, crmCompanyB, opportunityB, `${SYNTHETIC}. Escopo ilustrativo sem oferta real.`,
    `${SYNTHETIC}. Não enviar ao cliente.`, `${SYNTHETIC}. Rascunho sem aprovação, aceite ou envio.`, marcelo]);
  await client.query(`INSERT INTO crm_contracts
    (id,proposal_id,proposal_version,company_id,opportunity_id,title,status,origin,version,total_cost,total_price,
     idempotency_key,created_by,created_by_id,notes)
    VALUES ($1,$2,1,$3,$4,'DEMO — Minuta sem validade','rascunho','manual',1,0,0,$5,'marcelo',$6,$7)`,
  [contractId, proposalId, crmCompanyB, opportunityB, `demo-${today}-contract`, marcelo, `${SYNTHETIC}. Não é contrato assinado ou ativo.`]);
  await client.query(`INSERT INTO fin_expenses
    (id,protocol,expense_type,category,description,amount_cents,threshold_cents,requester_name,requester_identity,
     approver_name,approver_identity,status,evidence_file_name,evidence_file_url,evidence_storage_key,
     is_segregated,segregation_checked,contract_id,cost_center_id,supplier_id,created_by_identity,idempotency_key)
    VALUES ($1,$2,'despesa','Demonstração',$3,12500,100000,'RH demonstração',$4,'Administração demonstração',$5,
     'pendente','DEMO-metadado-sem-arquivo.txt','synthetic://demo/finance/expense-001.txt',
     'synthetic/demo/finance/expense-001.txt',true,false,$6,$7,$8,$4,$9)`,
  [randomUUID(), `DES-FIN-${today}-DEMO`, `${SYNTHETIC}. Não é cobrança, compra ou compromisso financeiro.`,
    rh, marcelo, contractId, costCenterId, supplierId, `demo-${today}-expense`]);
  await client.query(`INSERT INTO ops_occurrence_book
    (id,protocol,category,severity,title,description,occurred_at,location,status,responsible_id,responsible_name,
     is_private,is_personal_data_restricted,created_by)
    VALUES ($1,$2,'operacional','baixa','DEMO — Ocorrência fictícia',$3,NOW(),'Local fictício','aberto',$4,'Supervisor demonstração',true,false,'demo_local')`,
  [randomUUID(), `DEMO-OPS-${today.slice(2)}-01`, `${SYNTHETIC}. Não descreve incidente real e não possui geolocalização.`, actor('supervisor')]);

  // Keep documents separate by role. Client references are account-scoped so
  // the fixture itself never publishes one client's material to another.
  const ragAreas = [
    { key: 'publico', scope: 'publico', title: 'DEMO — Perguntas gerais', account: null,
      content: `${SYNTHETIC}. Este conteúdo explica como navegar pela demonstração e como pedir atendimento humano. Não contém preço, cobertura, licença ou prazo oficial.`, keywords: ['demonstração','navegação','atendimento'] },
    { key: 'rh', scope: 'rh', title: 'DEMO — Jornada fictícia do RH', account: null,
      content: `${SYNTHETIC}. A demonstração permite consultar um cadastro fictício, visualizar uma solicitação de ajuste de ponto e acompanhar uma revisão do RH. Datas, horários e regras não representam política da empresa.`, keywords: ['demonstração','rh','ponto','ajuste','funcionário'] },
    { key: 'marcelo', scope: 'marcelo', title: 'DEMO — Visão gerencial fictícia', account: null,
      content: `${SYNTHETIC}. O painel permite percorrer oportunidades, tarefas e indicadores de exemplo. Valores e registros são fictícios; decisões comerciais e financeiras devem usar dados reais autorizados.`, keywords: ['demonstração','marcelo','comercial','oportunidades','indicadores'] },
    { key: 'cliente', scope: 'cliente', title: 'DEMO — Orientação do portal Empresa A', account: accounts[0],
      content: `${SYNTHETIC}. Nesta conta fictícia, o portal pode mostrar contratos demonstrativos, documentos de exemplo e chamados simulados. Não é contrato ou informação operacional.`, keywords: ['demonstração','portal','contrato','chamado'] },
    { key: 'cliente', scope: 'cliente', title: 'DEMO — Orientação do portal Empresa B', account: accounts[1],
      content: `${SYNTHETIC}. Esta orientação pertence somente à conta fictícia Empresa B e não deve aparecer na conta Empresa A. Conteúdo sem validade operacional.`, keywords: ['demonstração','portal','isolamento','empresa b'] },
  ];
  for (const area of ragAreas) {
    const indexId = (await client.query(`INSERT INTO ai_rag_indexes
      (rag_key,name,description,scope,model_type,model_name,ollama_host,max_queue_size,max_tokens,temperature,
       created_by_identity,is_active,is_approved,is_published,status,approved_by_identity,approved_by_name,approved_at)
      VALUES ($1,$2,$3,$4,'ollama_qwen3_1_7b','qwen3:1.7b','http://127.0.0.1:11434',20,512,0.2,$5,true,true,true,'publicado',$5,'TI demonstração',NOW())
      ON CONFLICT (rag_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,scope=EXCLUDED.scope,
        is_active=true,is_approved=true,is_published=true,status='publicado',approved_by_identity=EXCLUDED.approved_by_identity,
        approved_by_name=EXCLUDED.approved_by_name,approved_at=EXCLUDED.approved_at,updated_at=NOW()
      RETURNING id`, [area.key, `DEMO — Base ${area.scope}`, `${SYNTHETIC}. Base isolada para a área ${area.scope}; não é política aprovada da empresa.`, area.scope, ti])).rows[0].id;
    await client.query(`INSERT INTO ai_rag_history
      (rag_index_id,previous_status,next_status,previous_version,next_version,reason,changed_by_identity,changed_by_name)
      VALUES ($1,NULL,'publicado',NULL,1,$2,$3,'TI demonstração')`,
    [indexId, `${SYNTHETIC}. Publicação apenas para demonstração local.`, ti]);
    const docId = (await client.query(`INSERT INTO ai_rag_documents
      (rag_index_id,rag_key,title,content,source,source_type,keywords,created_by_identity,client_account_id,
       is_approved,is_published,status,embedding_status,token_count,approved_by_identity)
      VALUES ($1,$2,$3,$4,$5,'procedimento',$6,$7,$8,true,true,'publicado','pendente',$9,$7)
      RETURNING id`, [indexId, area.key, area.title, area.content,
        `fixtures/${area.scope}/DEMO-LEIA-ANTES.txt`, area.keywords, ti, area.account, Math.max(1, Math.ceil(area.content.length / 4))])).rows[0].id;
    await client.query(`INSERT INTO ai_rag_chunks (document_id,rag_index_id,rag_key,chunk_index,content,token_count,metadata)
      VALUES ($1,$2,$3,0,$4,$5,$6::jsonb)`,
    [docId, indexId, area.key, area.content, Math.max(1, Math.ceil(area.content.length / 4)),
      JSON.stringify({ synthetic: true, scope: area.scope, client_account_id: area.account })]);
  }

  // One visible A/B draft, with no observations or conclusion. EXT-11's API
  // rejects synthetic observations, so none are generated by this fixture.
  const experimentId = randomUUID();
  const experimentPayload = { synthetic: true, status: 'rascunho', variants: ['A', 'B'], observations: 0 };
  await client.query(`INSERT INTO ext_analytics_experiments
    (id,protocol,hypothesis,description,variant_a,variant_b,metric_name,status,is_privacy_compliant,privacy_note,
     created_by_identity,origin,idempotency_key,request_fingerprint,data_minimization_note)
    VALUES ($1,$2,$3,$4,'A — Conteúdo atual','B — Conteúdo alternativo','resposta agregada','rascunho',true,$5,$6,
            'ext11_canonica',$7,$8,$5)`,
  [experimentId, `AB-EXT-${today}-DEMO`, `${SYNTHETIC}. Uma alternativa de conteúdo pode melhorar a leitura?`,
    `${SYNTHETIC}. Nenhum tráfego, conversão, participante ou resultado foi criado.`,
    `${SYNTHETIC}. Sem dados pessoais ou tráfego externo.`, marcelo, `demo-${today}-analytics`, sha256(JSON.stringify(experimentPayload))]);
  await client.query(`INSERT INTO ext_analytics_experiment_events
    (experiment_id,event_type,summary,payload,idempotency_key,request_fingerprint,created_by_identity)
    VALUES ($1,'experiment_create',$2,$3::jsonb,$4,$5,$6)`,
  [experimentId, `${SYNTHETIC}. Rascunho criado para apresentação, sem execução.`, JSON.stringify(experimentPayload),
    `demo-${today}-analytics-event`, sha256(`event-${today}-${experimentId}`), marcelo]);

  return {
    companies: 2, opportunities: 2, tasks: 2, interactions: 2,
    hrCorrectionsPending: 1, complianceObligations: 1, complianceTasks: 1,
    knowledgeArticles: 1, expansionDrafts: 1, continuityDrafts: 1,
    expensesPending: 1, occurrencesDemo: 1, ragIndexes: 4, ragDocuments: 5,
    analyticsDrafts: 1, gpsPunches: 0,
  };
}
