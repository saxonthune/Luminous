export function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function writeParam(name: string, value: string | null): void {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(name, value);
  else params.delete(name);
  const query = params.toString();
  history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
}
