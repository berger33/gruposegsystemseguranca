// UX-PRO-07C-2 — classificação explícita das respostas das escritas EXT-04.
// Este módulo não envia nem repete requisições: preserva status/código da API e
// só descreve quando é seguro oferecer uma repetição manual da mesma tentativa.

export type SupplierWriteFailureKind =
  | 'validation'
  | 'conflict'
  | 'auth'
  | 'denied'
  | 'transient'
  | 'invalid_response'
  | 'unexpected';

export type SupplierWriteFailure = {
  kind: SupplierWriteFailureKind;
  title: string;
  detail: string;
  status: number;
  code: string | null;
  uncertain: boolean;
  retrySameRequest: boolean;
};

function failure(
  kind: SupplierWriteFailureKind,
  title: string,
  detail: string,
  status: number,
  code: string | null,
  uncertain: boolean,
  retrySameRequest: boolean,
): SupplierWriteFailure {
  return { kind, title, detail, status, code, uncertain, retrySameRequest };
}

export function classifySupplierWriteFailure(status: number, code: string | null): SupplierWriteFailure {
  if (status === 401) {
    return failure(
      'auth',
      'A sessão não autorizou esta escrita.',
      'Entre novamente pela área administrativa antes de continuar. A jornada foi fechada sem manter dados protegidos na tela.',
      status,
      code,
      false,
      false,
    );
  }
  if (status === 403) {
    return failure(
      'denied',
      'Seu papel não tem autorização para esta escrita.',
      'A recusa veio do servidor; a jornada foi fechada sem manter dados protegidos na tela.',
      status,
      code,
      false,
      false,
    );
  }
  if (status === 409) {
    return failure(
      'conflict',
      'O servidor recusou a escrita por conflito com o estado atual.',
      'Atualize a leitura e confira a situação canônica antes de iniciar uma nova ação.',
      status,
      code,
      false,
      false,
    );
  }
  if ([400, 413, 422].includes(status)) {
    return failure(
      'validation',
      'O servidor recusou os dados desta escrita.',
      'Revise os campos indicados pelo código da API; nenhuma confirmação de sucesso foi apresentada.',
      status,
      code,
      false,
      false,
    );
  }
  if (status === 0 || status === 408 || status === 429 || status >= 500) {
    return failure(
      'transient',
      'Não foi possível confirmar a escrita nesta tentativa.',
      'A falha de rede ou do servidor pode ter ocorrido depois de a operação ser aplicada; o resultado é incerto.',
      status,
      code,
      true,
      true,
    );
  }
  return failure(
    'unexpected',
    'O servidor recusou a escrita.',
    'A resposta não confirma a operação. Consulte o código técnico antes de iniciar uma nova ação.',
    status,
    code,
    false,
    false,
  );
}

/** Um 2xx sem o recurso canônico também pode esconder uma mutação aplicada. */
export function invalidSupplierWriteResponse(status: number): SupplierWriteFailure {
  return failure(
    'invalid_response',
    'O servidor respondeu, mas a escrita não pôde ser confirmada.',
    'O corpo 2xx não contém o recurso e os campos canônicos esperados; o resultado é incerto.',
    status,
    'invalid_supplier_write_response',
    true,
    true,
  );
}

export function supplierWriteFailureDetail(error: SupplierWriteFailure): string {
  const status = error.status === 0 ? 'Sem resposta HTTP.' : `HTTP ${error.status}.`;
  const code = error.code ? `Código do servidor: ${error.code}.` : 'Sem código técnico de resposta HTTP.';
  const uncertainty = error.uncertain
    ? 'Não presuma que a operação foi desfeita.'
    : '';
  const retry = error.retrySameRequest
    ? 'Sem repetição automática: escolha a repetição manual para reenviar o mesmo corpo com a mesma Idempotency-Key.'
    : '';
  return [error.detail, status, code, uncertainty, retry].filter(Boolean).join(' ');
}
