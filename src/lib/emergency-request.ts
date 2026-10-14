// UX-PRO-07B — transporte de leitura do apoio emergencial (EXT-15 / F11).
//
// Mantém URL, método, credenciais e ausência de corpo das duas leituras que a
// tela já fazia (`/api/ext/emergency/channels` e `.../channels/:id`). A única
// mudança é devolver a falha classificada, em vez de lançar
// `Falha ao carregar canais` ou de ignorar a resposta, para que a tela nunca
// confunda rede, negativa, resposta inválida ou leitura ainda não feita com
// "nenhum canal configurado".
//
// As escritas (UX-PRO-07B-2) passam por `emergencyWrite`, com o mesmo verbo,
// URL, corpo e cabeçalho `Idempotency-Key` que a tela já enviava; a mudança
// é devolver a falha classificada e o corpo lido para reconciliação honesta.

export type EmergencyErrorKind = 'network' | 'auth' | 'denied' | 'server' | 'unexpected';

export type EmergencyErrorDescriptor = {
  kind: EmergencyErrorKind;
  title: string;
  detail: string;
  code: string | null;
  status: number;
  canRetry: boolean;
};

export type EmergencyResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: EmergencyErrorDescriptor };

function describeEmergencyError(code: string | null, status: number): EmergencyErrorDescriptor {
  if (status === 0) {
    return {
      kind: 'network',
      title: 'O servidor não respondeu à consulta de apoio emergencial.',
      detail: 'A conexão pode estar indisponível. Nenhuma conclusão sobre os canais foi feita.',
      code,
      status,
      canRetry: true,
    };
  }
  if (status === 401) {
    return {
      kind: 'auth',
      title: 'A sessão não autorizou esta leitura.',
      detail: 'Entre novamente pela área administrativa antes de consultar canais de apoio emergencial.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status === 403) {
    return {
      kind: 'denied',
      title: 'Seu papel não tem acesso aos canais de apoio emergencial.',
      detail: 'O menu não concede autorização. O servidor recusou a consulta sem expor os canais configurados.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status >= 500 || status === 408 || status === 429) {
    return {
      kind: 'server',
      title: 'A consulta de apoio emergencial não foi concluída.',
      detail: 'O servidor informou uma falha temporária. Isso não significa que não existam canais configurados.',
      code,
      status,
      canRetry: true,
    };
  }
  return {
    kind: 'unexpected',
    title: 'A consulta foi recusada pelo servidor.',
    detail: 'A resposta não permite concluir se existem canais configurados.',
    code,
    status,
    canRetry: false,
  };
}

export function invalidEmergencyResponse(status: number): EmergencyErrorDescriptor {
  return {
    kind: 'unexpected',
    title: 'A resposta de apoio emergencial não pôde ser lida.',
    detail: 'O servidor respondeu sem os dados esperados. Isso não permite concluir que não exista canal configurado.',
    code: 'invalid_emergency_response',
    status,
    canRetry: true,
  };
}

export function emergencyErrorDetail(error: EmergencyErrorDescriptor): string {
  const diagnostic = error.code ? ` Código para diagnóstico: ${error.code}.` : '';
  return `${error.detail}${diagnostic}`;
}

export async function emergencyRead<T>(url: string): Promise<EmergencyResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
  } catch {
    return { ok: false, status: 0, error: describeEmergencyError(null, 0) };
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
    return { ok: false, status: response.status, error: describeEmergencyError(code, response.status) };
  }

  return { ok: true, status: response.status, data: payload as T };
}

function describeEmergencyWriteError(code: string | null, status: number): EmergencyErrorDescriptor {
  if (status === 0) {
    return {
      kind: 'network',
      title: 'A escrita de apoio emergencial não chegou ao servidor.',
      detail: 'A conexão pode estar indisponível. Não é possível afirmar se a escrita foi aplicada; releia a lista e a trilha para conferir o estado atual antes de repetir a ação.',
      code,
      status,
      canRetry: true,
    };
  }
  if (status === 401) {
    return {
      kind: 'auth',
      title: 'A sessão não autorizou esta escrita.',
      detail: 'Entre novamente pela área administrativa. A tela está recalculando a leitura para confirmar o acesso; nenhuma mudança é presumida.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status === 403) {
    return {
      kind: 'denied',
      title: 'Seu papel não tem acesso a esta escrita de apoio emergencial.',
      detail: 'O servidor recusou a operação. A tela está recalculando a leitura para confirmar o acesso; nenhuma mudança é presumida.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status >= 500 || status === 408 || status === 429) {
    return {
      kind: 'server',
      title: 'A escrita de apoio emergencial não foi concluída.',
      detail: 'O servidor informou uma falha temporária. Não é possível afirmar se a escrita foi aplicada; releia a lista e a trilha para conferir o estado atual antes de repetir a ação.',
      code,
      status,
      canRetry: true,
    };
  }
  return {
    kind: 'unexpected',
    title: 'A escrita foi recusada pelo servidor.',
    detail: 'O servidor recusou a operação sem aplicá-la. Confira o estado atual na lista e na trilha antes de tentar de novo.',
    code,
    status,
    canRetry: false,
  };
}

export function invalidEmergencyWriteResponse(status: number): EmergencyErrorDescriptor {
  return {
    kind: 'unexpected',
    title: 'A resposta da escrita de apoio emergencial não pôde ser lida.',
    detail: 'O servidor respondeu sem os dados esperados, então a escrita não pode ser confirmada. Nada foi apresentado como sucesso nem como ausência de canal.',
    code: 'invalid_emergency_write_response',
    status,
    canRetry: true,
  };
}

export function emergencyWriteErrorDetail(error: EmergencyErrorDescriptor): string {
  const diagnostic = error.code ? ` Código para diagnóstico: ${error.code}.` : '';
  return `${error.detail}${diagnostic}`;
}

export async function emergencyWrite<T>(
  url: string,
  { body, idempotencyKey }: { body: Record<string, unknown>; idempotencyKey: string },
): Promise<EmergencyResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: describeEmergencyWriteError(null, 0) };
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
    return { ok: false, status: response.status, error: describeEmergencyWriteError(code, response.status) };
  }

  return { ok: true, status: response.status, data: payload as T };
}
