/** REST Card meaning and fallback palettes. Path parameters may also have methods. */
export const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT'] as const;
export type HttpMethod = typeof HTTP_METHODS[number];
export type RestRole = 'prefix' | 'endpoint' | 'parameter';
export const isHttpMethod = (value: unknown): value is HttpMethod => typeof value === 'string' && (HTTP_METHODS as readonly string[]).includes(value);
export function restRole(segment: string, methods: readonly HttpMethod[]): RestRole {
  return /\{[^/{}]+\}/.test(segment) ? 'parameter' : methods.length ? 'endpoint' : 'prefix';
}
export const restStyles = {
  prefix: { label: 'Organizational path prefix', light: { fill: '#e9ebee', stroke: '#8b929c' }, dark: { fill: '#25282e', stroke: '#818995' } },
  endpoint: { label: 'Callable literal resource', light: { fill: '#dcf3ed', stroke: '#2d8978' }, dark: { fill: '#18352f', stroke: '#6bc4ad' } },
  parameter: { label: 'Path parameter; badges indicate callability', light: { fill: '#eee5ff', stroke: '#8255b7' }, dark: { fill: '#30233f', stroke: '#b594e4' } },
};
