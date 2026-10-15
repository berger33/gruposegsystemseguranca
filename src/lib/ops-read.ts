// UX-PRO-07D-1 — leitura de `/admin/operacao` com estado honesto por grupo.
//
// Mantém URL, método, credenciais e corpo das dezessete leituras canônicas de
// operação (grupos principal, estrutura, dimensionamento, versões de escala e
// detalhe da versão). O transporte continua sendo `opsRequest`, com o mesmo
// vocabulário (`describeOpsError`); este módulo só acrescenta o que a leitura
// precisa e o transporte não decide: a resposta `2xx` sem a chave canônica e
// o reconhecimento da falha que precisa fechar o grupo. Nenhuma escrita
// passa por aqui: a ciência de escala continua usando `opsRequest` com o
// mesmo verbo e corpo.

import { opsErrorFootnote, type OpsErrorDescriptor } from './ops-vocabulary.mjs';

export type OpsReadError = OpsErrorDescriptor;

/** Resposta 2xx sem a chave canônica: nunca é ausência de registro. */
export function invalidOpsResponse(status: number): OpsReadError {
  return {
    kind: 'invalid',
    title: 'A resposta da operação não pôde ser lida.',
    detail: 'O servidor respondeu sem a chave canônica da leitura. Isso não significa que o recorte esteja vazio.',
    code: 'invalid_ops_response',
    status,
    canRetry: true,
  };
}

/** A negativa e a ausência de sessão não podem manter dado protegido na tela. */
export function opsReadFailsClosed(error: OpsReadError): boolean {
  return error.status === 401 || error.status === 403 || error.kind === 'auth' || error.kind === 'denied';
}

export function opsReadErrorDetail(error: OpsReadError): string {
  return `${error.detail} ${opsErrorFootnote(error)}`;
}
