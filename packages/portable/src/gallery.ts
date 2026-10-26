import { isAbsolute, relative, resolve } from 'node:path';

export interface GalleryEntry {
  slug: string;
  title: string;
  input: string;
  description?: string;
  theme?: string;
  css?: string;
}

/** Manifest order is presentation order. Reject output collisions before generating. */
export function parseGallery(value: unknown): GalleryEntry[] {
  if (!Array.isArray(value)) throw new Error('Gallery manifest must be an ordered JSON array');
  const slugs = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some(key => !['slug', 'title', 'input', 'description', 'theme', 'css'].includes(key))
      || typeof entry.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)
      || typeof entry.title !== 'string' || !entry.title.trim()
      || typeof entry.input !== 'string' || !entry.input.toLowerCase().endsWith('.md')
      || ['description', 'theme', 'css'].some(key => entry[key] !== undefined && typeof entry[key] !== 'string')) {
      throw new Error('Gallery entries require slug, title, input (.md), and optional description, theme, css');
    }
    if (slugs.has(entry.slug)) throw new Error(`Duplicate gallery slug: ${entry.slug}`);
    slugs.add(entry.slug);
  }
  return value;
}

export function galleryInputPath(directory: string, file: string): string {
  const path = resolve(directory, file);
  const rel = relative(resolve(directory), path);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../')) throw new Error(`Gallery input must be inside input directory: ${file}`);
  return path;
}

const escapeMarkdown = (value: string) => value.replace(/[\\`*_[\]<>#]/g, '\\$&').replace(/[\r\n]+/g, ' ');
export function galleryMarkdown(entries: GalleryEntry[]): string {
  return '# Luminous Portable\n\nInteractive documents built from Markdown. Open an example to explore its canvases or view its source.\n\n[Back to Luminous demo](/)\n\n'
    + entries.map((entry, index) => `${index + 1}. [${escapeMarkdown(entry.title)}](./${entry.slug}/index.html)${entry.description ? `\n\n   ${escapeMarkdown(entry.description)}` : ''}`).join('\n\n') + '\n';
}
