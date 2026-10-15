// UX-PRO-07C-1 — transporte de leitura de `/admin/fornecedores`.
//
// Mantém URL, método, credenciais e corpo das quatro leituras canônicas EXT-04
// (`references`, `quotations`, `orders` e detalhe da cotação). A única mudança
// é devolver uma falha classificada em vez de lançar `HTTP n`, para que a tela
// nunca confunda rede, negativa ou resposta ilegível com ausência de registros.
// Nenhuma escrita passa por aqui: as nove mutações continuam usando
// `supplierRequest`, com o mesmo verbo, corpo e Idempotency-Key.

export type SupplierReadKind = 'network' | 'auth' | 'denied' | 'server' | 'unexpected';

export type SupplierReadError = {
  kind: SupplierReadKind;
  title: string;
  detail: string;
  code: string | null;
  status: number;
  canRetry: boolean;
};

export type SupplierReadResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: SupplierReadError };

function describeSupplierReadError(code: string | null, status: number): SupplierReadError {
  if (status === 0) {
    return {
      kind: 'network',
      title: 'O servidor não respondeu à consulta.',
      detail: 'A conexão pode estar indisponível. Nenhuma conclusão sobre os registros foi feita.',
      code,
      status,
      canRetry: true,
    };
  }
  if (status === 401) {
    return {
      kind: 'auth',
      title: 'A sessão não autorizou esta leitura.',
      detail: 'Entre novamente pela área administrativa antes de consultar a jornada de fornecedores.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status === 403) {
    return {
      kind: 'denied',
      title: 'Seu papel não tem acesso a esta jornada.',
      detail: 'O menu não concede autorização. O servidor recusou a consulta sem expor os registros.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status >= 500 || status === 408 || status === 429) {
    return {
      kind: 'server',
      title: 'A consulta de fornecedores não foi concluída.',
      detail: 'O servidor informou uma falha temporária.',
      code,
      status,
      canRetry: true,
    };
  }
  return {
    kind: 'unexpected',
    title: 'A consulta foi recusada pelo servidor.',
    detail: 'A resposta não permite concluir se existem registros neste recorte.',
    code,
    status,
    canRetry: false,
  };
}

/** Resposta 2xx sem a chave canônica: nunca é ausência de registro. */
export function invalidSupplierResponse(status: number): SupplierReadError {
  return {
    kind: 'unexpected',
    title: 'A resposta de fornecedores não pôde ser lida.',
    detail: 'O servidor respondeu sem a chave canônica da leitura.',
    code: 'invalid_supplier_response',
    status,
    canRetry: true,
  };
}

export function supplierReadErrorDetail(error: SupplierReadError): string {
  const diagnostic = error.code ? ` Código para diagnóstico: ${error.code}.` : '';
  return `${error.detail}${diagnostic}`;
}

/** A negativa e a ausência de sessão não podem manter dado protegido na tela. */
export function supplierReadFailsClosed(error: SupplierReadError): boolean {
  return error.kind === 'auth' || error.kind === 'denied';
}

export async function supplierRead<T>(url: string): Promise<SupplierReadResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
  } catch {
    return { ok: false, status: 0, error: describeSupplierReadError(null, 0) };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error: string }).error
      : null;
    return { ok: false, status: response.status, error: describeSupplierReadError(code, response.status) };
  }

  return { ok: true, status: response.status, data: payload as T };
}
