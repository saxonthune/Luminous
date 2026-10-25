export type Theme = 'ground' | 'light' | 'dark';

export function themeFromUrl(href: string): Theme {
  const value = new URL(href).searchParams.get('theme');
  return value === 'light' || value === 'dark' ? value : 'ground';
}

export function urlWithTheme(href: string, theme: Theme): string {
  const url = new URL(href);
  url.searchParams.set('theme', theme);
  return url.href;
}
