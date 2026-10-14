// UX-PRO-07A — transporte de leitura de patrimonio.
//
// Mantem URL, metodo, credenciais e corpo das seis APIs AST. A unica mudanca
// e devolver uma falha classificada, em vez de lancar `HTTP n`, para que a
// tela nunca confunda rede/negativa com lista vazia.

export type AssetErrorKind = 'network' | 'auth' | 'denied' | 'server' | 'unexpected';

export type AssetErrorDescriptor = {
  kind: AssetErrorKind;
  title: string;
  detail: string;
  code: string | null;
  status: number;
  canRetry: boolean;
};

export type AssetResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: AssetErrorDescriptor };

function describeAssetError(code: string | null, status: number): AssetErrorDescriptor {
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
      detail: 'Entre novamente pela área administrativa antes de consultar dados de patrimônio.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status === 403) {
    return {
      kind: 'denied',
      title: 'Seu papel não tem acesso a este recorte.',
      detail: 'O menu não concede autorização. O servidor recusou a consulta sem expor os registros.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status >= 500 || status === 408 || status === 429) {
    return {
      kind: 'server',
      title: 'A consulta de patrimônio não foi concluída.',
      detail: 'O servidor informou uma falha temporária. Isso não significa que o recorte esteja vazio.',
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

export function invalidAssetResponse(status: number): AssetErrorDescriptor {
  return {
    kind: 'unexpected',
    title: 'A resposta de patrimônio não pôde ser lida.',
    detail: 'O servidor respondeu sem uma lista válida. Isso não permite concluir que o recorte esteja vazio.',
    code: 'invalid_items_response',
    status,
    canRetry: true,
  };
}

export function assetErrorDetail(error: AssetErrorDescriptor): string {
  const diagnostic = error.code ? ` Código para diagnóstico: ${error.code}.` : '';
  return `${error.detail}${diagnostic}`;
}

export async function assetRequest<T>(url: string): Promise<AssetResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
  } catch {
    return { ok: false, status: 0, error: describeAssetError(null, 0) };
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
    return { ok: false, status: response.status, error: describeAssetError(code, response.status) };
  }

  return { ok: true, status: response.status, data: payload as T };
}
