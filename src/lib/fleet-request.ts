export type FleetRequestError = {
  status: number;
  code: string | null;
  payload: unknown;
};
export type FleetRequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FleetRequestError };

export async function fleetRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<FleetRequestResult<T>> {
  try {
    const response = await fetch(input, {
      credentials: "same-origin",
      ...init,
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const code =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : null;
      return { ok: false, error: { status: response.status, code, payload } };
    }
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, error: { status: 0, code: null, payload: null } };
  }
}
