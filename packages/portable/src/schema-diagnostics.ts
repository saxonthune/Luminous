import type { PortableCard } from './graph.js';

// This is intentionally a small vocabulary, not a TypeScript parser or resolver.
const primitive = /^(?:string|number|boolean|bigint|symbol|undefined|null|void|never|unknown|any|int|integer|float|double|uuid|UUID|true|false|-?\d+(?:\.\d+)?|"[^"\n]*"|'[^'\n]*')$/;
export function isPrimitiveType(expression: string): boolean {
  return expression.split('|').every(part => {
    let value = part.trim();
    while (value.endsWith('[]')) value = value.slice(0, -2).trim();
    return primitive.test(value);
  });
}
export function missingSchemaTypes(card: PortableCard, path = card.title): { path: string; type: string }[] {
  if (card.component !== 'schema-card') return [];
  const findings: { path: string; type: string }[] = [];
  for (const field of card.fields ?? []) {
    const fieldPath = `${path}.${field.name}`;
    if (field.schema) findings.push(...missingSchemaTypes(field.schema, fieldPath));
    else if (!isPrimitiveType(field.type)) findings.push({ path: fieldPath, type: field.type });
  }
  return findings;
}
