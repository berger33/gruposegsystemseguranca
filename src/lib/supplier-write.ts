// UX-PRO-07C-2 — classificação e reconciliação das escritas de `/admin/fornecedores`.
//
// Sem transporte próprio: as nove mutações canônicas continuam saindo pela
// `supplierRequest` existente, com o mesmo verbo, URL, corpo e cabeçalho
// `Idempotency-Key`. O que este módulo acrescenta é a leitura honesta do
// resultado da escrita: classificar a falha (negativa de sessão/papel,
// transitória, recusa definitiva) com o código real do servidor, declarar
// quando o resultado não pode ser afirmado e validar o corpo 2xx contra a
// chave canônica de cada mutação antes de qualquer sucesso.
//
// Nada aqui altera endpoint, payload, permissão, transição canônica, auditoria
// ou o vocabulário canônico de códigos (`supplier-vocabulary.mjs`).

import { describeSupplierError } from './supplier-vocabulary.mjs';
import type { SupplierErrorDescriptor } from './supplier-request';

export type SupplierWriteErrorKind =
  | 'network'    // a requisição não chegou ao servidor: resultado incerto
  | 'auth'       // 401: a sessão não autorizou a escrita
  | 'denied'     // 403: o papel não tem acesso à escrita
  | 'transient'  // 5xx/408/429: falha temporária, resultado incerto
  | 'invalid'    // 2xx sem a chave canônica: escrita não confirmada, resultado incerto
  | 'refused';   // 409/400/404: o servidor recusou sem aplicar, resultado conhecido

export type SupplierWriteError = {
  kind: SupplierWriteErrorKind;
  title: string;
  detail: string;
  /** Causa canônica do vocabulário para o código devolvido pelo servidor. */
  cause: string;
  code: string | null;
  status: number;
  /** true quando não é possível afirmar se a escrita foi aplicada. */
  uncertain: boolean;
};

/** Classifica a falha de uma escrita a partir do descritor canônico do transporte. */
export function describeSupplierWriteError(error: SupplierErrorDescriptor): SupplierWriteError {
  const cause = describeSupplierError(error.code, error.status).title;
  if (error.status === 0) {
    return {
      kind: 'network',
      uncertain: true,
      code: error.code,
      status: error.status,
      cause,
      title: 'A escrita não chegou ao servidor.',
      detail: 'A conexão pode estar indisponível. Não é possível afirmar se a escrita foi aplicada; atualize as listas para conferir o estado atual antes de repetir a ação.',
    };
  }
  if (error.status === 401) {
    return {
      kind: 'auth',
      uncertain: false,
      code: error.code,
      status: error.status,
      cause,
      title: 'A sessão não autorizou esta escrita.',
      detail: 'Entre novamente pela área administrativa. A tela está relendo os dados para confirmar o acesso; nenhuma mudança é presumida.',
    };
  }
  if (error.status === 403 || error.kind === 'denied') {
    return {
      kind: 'denied',
      uncertain: false,
      code: error.code,
      status: error.status,
      cause,
      title: 'Seu papel não tem acesso a esta escrita.',
      detail: 'O servidor recusou a operação. A tela está relendo os dados para confirmar o acesso; nenhuma mudança é presumida.',
    };
  }
  if (error.status >= 500 || error.status === 408 || error.status === 429 || error.kind === 'unavailable') {
    return {
      kind: 'transient',
      uncertain: true,
      code: error.code,
      status: error.status,
      cause,
      title: 'A escrita não foi concluída.',
      detail: 'O servidor informou uma falha temporária. Não é possível afirmar se a escrita foi aplicada; atualize as listas para conferir o estado atual antes de repetir a ação.',
    };
  }
  return {
    kind: 'refused',
    uncertain: false,
    code: error.code,
    status: error.status,
    cause,
    title: 'A escrita foi recusada pelo servidor.',
    detail: 'O servidor recusou a operação sem aplicá-la. Confira os dados informados e o estado atual nas listas antes de tentar de novo.',
  };
}

/** Resposta 2xx sem a chave canônica da operação: nunca é sucesso, nunca é ausência. */
export function invalidSupplierWriteResponse(status: number): SupplierWriteError {
  return {
    kind: 'invalid',
    uncertain: true,
    code: 'invalid_supplier_write_response',
    status,
    cause: 'Resposta 2xx sem a chave canônica da operação.',
    title: 'A resposta da escrita não pôde ser lida.',
    detail: 'O servidor respondeu 2xx sem a chave canônica da operação, então a escrita não pode ser confirmada. Nada foi apresentado como sucesso nem como ausência.',
  };
}

/** Negativa de sessão/papel em escrita: a tela precisa falhar fechado. */
export function supplierWriteFailsClosed(error: SupplierWriteError): boolean {
  return error.kind === 'auth' || error.kind === 'denied';
}

/** Resultado incerto (rede, transitório, resposta ilegível): repetição só quando explícita. */
export function supplierWriteUncertain(error: SupplierWriteError): boolean {
  return error.uncertain;
}

export function supplierWriteErrorDetail(error: SupplierWriteError): string {
  const cause = error.cause ? ` Causa canônica: ${error.cause}.` : '';
  const diagnostic = error.code ? ` Código para diagnóstico: ${error.code}.` : '';
  return `${error.detail}${cause}${diagnostic}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasId(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0;
}

/**
 * Replay idempotente confirmado: o servidor responde 200 com `replayed: true`
 * quando a mesma chave é reenviada. Para validade, regra de alerta, documento e
 * prazo, o `onReplay` devolve o registro vigente — que pode ser `null` se outro
 * fluxo já o substituiu — então a confirmação do replay aceita essa forma.
 */
function confirmedReplay(data: unknown): boolean {
  return isRecord(data) && data.replayed === true;
}

/** Lê um campo de um objeto desconhecido sem presumir a forma do corpo. */
function fieldOf(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

/**
 * Corpo 2xx canônico por mutação. Sem a chave canônica o sucesso não é
 * declarado — a resposta vira `invalid_supplier_write_response`.
 */
export const supplierWriteReceipts = {
  /** Criar cotação, transição de status e decisão: `{quotation}`. */
  quotation: (data: unknown): boolean => hasId(fieldOf(data, 'quotation')),
  /** Pedido derivado e transição de pedido: a tela lê `order.id` e `order.protocol`. */
  order: (data: unknown): boolean => {
    const order = fieldOf(data, 'order');
    return hasId(order) && typeof fieldOf(order, 'protocol') === 'string' && Boolean(fieldOf(order, 'protocol'));
  },
  validity: (data: unknown): boolean => hasId(fieldOf(data, 'validity')) || confirmedReplay(data),
  alertRule: (data: unknown): boolean => hasId(fieldOf(data, 'alert_rule')) || confirmedReplay(data),
  document: (data: unknown): boolean => hasId(fieldOf(data, 'document')) || confirmedReplay(data),
  deadline: (data: unknown): boolean => hasId(fieldOf(data, 'deadline')) || confirmedReplay(data),
} as const;
