const ENDPOINT = 'https://revgeocode.search.hereapi.com/v1/revgeocode';
const MAX_ADDRESS_LENGTH = 500;

/** Resolve a punch coordinate to an address without exposing provider failures to the punch flow. */
export async function reverseGeocodeHere(position, {
  apiKey = process.env.HERE_API_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = 4000,
  now = () => new Date(),
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return { address: null, provider: null, status: 'not_configured', resolvedAt: null };
  }
  if (typeof fetchImpl !== 'function') {
    return { address: null, provider: 'HERE', status: 'unavailable', resolvedAt: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set('at', `${position.latitude},${position.longitude}`);
    url.searchParams.set('lang', 'pt-BR');
    url.searchParams.set('limit', '1');
    url.searchParams.set('apiKey', apiKey.trim());
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { address: null, provider: 'HERE', status: 'unavailable', resolvedAt: null };
    }
    const payload = await response.json();
    const address = payload?.items?.find((item) => typeof item?.address?.label === 'string')?.address?.label?.trim();
    if (!address) return { address: null, provider: 'HERE', status: 'not_found', resolvedAt: null };
    return {
      address: address.slice(0, MAX_ADDRESS_LENGTH),
      provider: 'HERE',
      status: 'resolved',
      resolvedAt: now().toISOString(),
    };
  } catch {
    // Do not log the error or URL because HERE credentials are query parameters.
    return { address: null, provider: 'HERE', status: 'unavailable', resolvedAt: null };
  } finally {
    clearTimeout(timer);
  }
}
