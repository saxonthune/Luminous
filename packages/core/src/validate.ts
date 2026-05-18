import Ajv from 'ajv';
import { BUILTIN_PRIMITIVE_NAMES } from './render/primitive-names.ts';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  scope: 'graph' | 'pack';
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const DISCLOSURE_LEVELS = ['peek', 'card', 'open', 'deep'] as const;
const NODE_ROLES = ['spatial', 'latent', 'hidden'] as const;
const EDGE_ROLES = ['contain', 'arrow', 'summary', 'hidden'] as const;

function err(scope: 'graph' | 'pack', path: string, message: string): ValidationIssue {
  return { severity: 'error', scope, path, message };
}

function warn(scope: 'graph' | 'pack', path: string, message: string): ValidationIssue {
  return { severity: 'warning', scope, path, message };
}

function walkRenderNode(
  node: unknown,
  path: string,
  issues: ValidationIssue[],
  scope: 'pack',
): void {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    issues.push(err(scope, path, 'RenderNode must be an object'));
    return;
  }
  const n = node as Record<string, unknown>;
  if (typeof n['type'] !== 'string') {
    issues.push(err(scope, path + '.type', 'RenderNode must have a string "type"'));
  } else if (!(BUILTIN_PRIMITIVE_NAMES as readonly string[]).includes(n['type'])) {
    issues.push(err(scope, path + '.type', `unknown primitive "${n['type']}" — must be one of: ${BUILTIN_PRIMITIVE_NAMES.join(', ')}`));
  }
  if (n['children'] !== undefined) {
    if (!Array.isArray(n['children'])) {
      issues.push(err(scope, path + '.children', '"children" must be an array'));
    } else {
      (n['children'] as unknown[]).forEach((child, i) => {
        walkRenderNode(child, `${path}.children[${i}]`, issues, scope);
      });
    }
  }
}

interface CompiledKindSchema {
  validate: ((props: unknown) => boolean) & { errors?: unknown };
  errorsText: () => string;
}

export function validateGraphAndPack(graphText: string, packText: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const ajv = new Ajv({ strict: false });

  // -------------------------------------------------------------------------
  // Pack validation
  // -------------------------------------------------------------------------

  let packObj: Record<string, unknown> | null = null;
  const nodeKindIds = new Set<string>();
  const edgeKindIds = new Set<string>();
  const compiledNodeSchemas = new Map<string, CompiledKindSchema>();
  const compiledEdgeSchemas = new Map<string, CompiledKindSchema>();
  const viewIds = new Set<string>();

  let packParsedOk = false;
  try {
    const parsed = JSON.parse(packText);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      issues.push(err('pack', '', 'pack must be a non-null, non-array JSON object'));
    } else {
      packObj = parsed as Record<string, unknown>;
      packParsedOk = true;
    }
  } catch {
    issues.push(err('pack', '', 'pack is not valid JSON'));
  }

  if (packParsedOk && packObj !== null) {
    if (typeof packObj['id'] !== 'string' || packObj['id'] === '') {
      issues.push(err('pack', 'id', '"id" must be a non-empty string'));
    }
    if (typeof packObj['version'] !== 'string') {
      issues.push(err('pack', 'version', '"version" must be a string'));
    }

    // nodeKinds
    if (packObj['nodeKinds'] !== undefined) {
      if (!Array.isArray(packObj['nodeKinds'])) {
        issues.push(err('pack', 'nodeKinds', '"nodeKinds" must be an array'));
      } else {
        const seenNodeIds = new Set<string>();
        (packObj['nodeKinds'] as unknown[]).forEach((kind, i) => {
          const base = `nodeKinds[${i}]`;
          if (kind === null || typeof kind !== 'object' || Array.isArray(kind)) {
            issues.push(err('pack', base, 'each nodeKind entry must be an object'));
            return;
          }
          const k = kind as Record<string, unknown>;
          if (typeof k['id'] !== 'string') {
            issues.push(err('pack', base + '.id', '"id" must be a string'));
          } else {
            if (seenNodeIds.has(k['id'])) {
              issues.push(err('pack', base + '.id', `duplicate node-kind id "${k['id']}"`));
            }
            seenNodeIds.add(k['id']);
            nodeKindIds.add(k['id']);
          }
          if (typeof k['label'] !== 'string') {
            issues.push(warn('pack', base + '.label', '"label" is missing — deserializePack will default it'));
          }
          // props schema
          if (k['props'] !== undefined) {
            try {
              const validate = ajv.compile(k['props'] as object);
              if (typeof k['id'] === 'string') {
                compiledNodeSchemas.set(k['id'], {
                  validate,
                  errorsText: () => ajv.errorsText(validate.errors),
                });
              }
            } catch (e) {
              issues.push(err('pack', base + '.props', `invalid JSON Schema: ${e instanceof Error ? e.message : String(e)}`));
            }
          }
          // render map
          if (k['render'] !== undefined) {
            if (k['render'] === null || typeof k['render'] !== 'object' || Array.isArray(k['render'])) {
              issues.push(err('pack', base + '.render', '"render" must be an object (map of disclosure level → RenderNode)'));
            } else {
              const renderMap = k['render'] as Record<string, unknown>;
              for (const key of Object.keys(renderMap)) {
                if (!(DISCLOSURE_LEVELS as readonly string[]).includes(key)) {
                  issues.push(err('pack', `${base}.render.${key}`, `render key "${key}" is not a disclosure level (expected ${DISCLOSURE_LEVELS.join('|')}) — 'render' must be a map of level → RenderNode, not a flat RenderNode`));
                } else {
                  walkRenderNode(renderMap[key], `${base}.render.${key}`, issues, 'pack');
                }
              }
            }
          }
        });
      }
    }

    // edgeKinds
    if (packObj['edgeKinds'] !== undefined) {
      if (!Array.isArray(packObj['edgeKinds'])) {
        issues.push(err('pack', 'edgeKinds', '"edgeKinds" must be an array'));
      } else {
        const seenEdgeIds = new Set<string>();
        (packObj['edgeKinds'] as unknown[]).forEach((kind, i) => {
          const base = `edgeKinds[${i}]`;
          if (kind === null || typeof kind !== 'object' || Array.isArray(kind)) {
            issues.push(err('pack', base, 'each edgeKind entry must be an object'));
            return;
          }
          const k = kind as Record<string, unknown>;
          if (typeof k['id'] !== 'string') {
            issues.push(err('pack', base + '.id', '"id" must be a string'));
          } else {
            if (seenEdgeIds.has(k['id'])) {
              issues.push(err('pack', base + '.id', `duplicate edge-kind id "${k['id']}"`));
            }
            seenEdgeIds.add(k['id']);
            edgeKindIds.add(k['id']);
          }
          if (typeof k['label'] !== 'string') {
            issues.push(warn('pack', base + '.label', '"label" is missing — deserializePack will default it'));
          }
          if (k['props'] !== undefined) {
            try {
              const validate = ajv.compile(k['props'] as object);
              if (typeof k['id'] === 'string') {
                compiledEdgeSchemas.set(k['id'], {
                  validate,
                  errorsText: () => ajv.errorsText(validate.errors),
                });
              }
            } catch (e) {
              issues.push(err('pack', base + '.props', `invalid JSON Schema: ${e instanceof Error ? e.message : String(e)}`));
            }
          }
          if (k['render'] !== undefined) {
            if (k['render'] === null || typeof k['render'] !== 'object' || Array.isArray(k['render'])) {
              issues.push(err('pack', base + '.render', '"render" must be an object (map of disclosure level → RenderNode)'));
            } else {
              const renderMap = k['render'] as Record<string, unknown>;
              for (const key of Object.keys(renderMap)) {
                if (!(DISCLOSURE_LEVELS as readonly string[]).includes(key)) {
                  issues.push(err('pack', `${base}.render.${key}`, `render key "${key}" is not a disclosure level (expected ${DISCLOSURE_LEVELS.join('|')}) — 'render' must be a map of level → RenderNode, not a flat RenderNode`));
                } else {
                  walkRenderNode(renderMap[key], `${base}.render.${key}`, issues, 'pack');
                }
              }
            }
          }
        });
      }
    }

    // views
    if (packObj['views'] !== undefined) {
      if (!Array.isArray(packObj['views'])) {
        issues.push(err('pack', 'views', '"views" must be an array'));
      } else {
        (packObj['views'] as unknown[]).forEach((view, i) => {
          const base = `views[${i}]`;
          if (view === null || typeof view !== 'object' || Array.isArray(view)) {
            issues.push(err('pack', base, 'each view entry must be an object'));
            return;
          }
          const v = view as Record<string, unknown>;
          if (typeof v['id'] !== 'string') {
            issues.push(err('pack', base + '.id', '"id" must be a string'));
          } else {
            viewIds.add(v['id']);
          }
          if (v['nodeRoles'] !== undefined && typeof v['nodeRoles'] === 'object' && !Array.isArray(v['nodeRoles'])) {
            const nodeRoles = v['nodeRoles'] as Record<string, unknown>;
            for (const kindId of Object.keys(nodeRoles)) {
              if (!nodeKindIds.has(kindId)) {
                issues.push(err('pack', `${base}.nodeRoles.${kindId}`, `unknown node-kind id "${kindId}"`));
              }
              if (!(NODE_ROLES as readonly unknown[]).includes(nodeRoles[kindId])) {
                issues.push(err('pack', `${base}.nodeRoles.${kindId}`, `invalid node role "${nodeRoles[kindId]}" — must be one of: ${NODE_ROLES.join(', ')}`));
              }
            }
          }
          if (v['edgeRoles'] !== undefined && typeof v['edgeRoles'] === 'object' && !Array.isArray(v['edgeRoles'])) {
            const edgeRoles = v['edgeRoles'] as Record<string, unknown>;
            for (const kindId of Object.keys(edgeRoles)) {
              if (!edgeKindIds.has(kindId)) {
                issues.push(err('pack', `${base}.edgeRoles.${kindId}`, `unknown edge-kind id "${kindId}"`));
              }
              if (!(EDGE_ROLES as readonly unknown[]).includes(edgeRoles[kindId])) {
                issues.push(err('pack', `${base}.edgeRoles.${kindId}`, `invalid edge role "${edgeRoles[kindId]}" — must be one of: ${EDGE_ROLES.join(', ')}`));
              }
            }
          }
        });
      }
    }

    // layers
    if (packObj['layers'] !== undefined && Array.isArray(packObj['layers'])) {
      (packObj['layers'] as unknown[]).forEach((layer, i) => {
        if (layer === null || typeof layer !== 'object' || Array.isArray(layer)) return;
        const l = layer as Record<string, unknown>;
        if (Array.isArray(l['edgeKinds'])) {
          (l['edgeKinds'] as unknown[]).forEach((ek, j) => {
            if (typeof ek === 'string' && !edgeKindIds.has(ek)) {
              issues.push(err('pack', `layers[${i}].edgeKinds[${j}]`, `unknown edge-kind id "${ek}"`));
            }
          });
        }
      });
    }

    // disclosure
    if (packObj['disclosure'] !== undefined && Array.isArray(packObj['disclosure'])) {
      const allKindIds = new Set([...nodeKindIds, ...edgeKindIds]);
      (packObj['disclosure'] as unknown[]).forEach((d, i) => {
        if (d === null || typeof d !== 'object' || Array.isArray(d)) return;
        const disc = d as Record<string, unknown>;
        if (typeof disc['kind'] === 'string' && !allKindIds.has(disc['kind'])) {
          issues.push(err('pack', `disclosure[${i}].kind`, `unknown kind id "${disc['kind']}"`));
        }
      });
    }

    // Warning: kinds not referenced in any view
    if (Array.isArray(packObj['views']) && (packObj['views'] as unknown[]).length > 0) {
      const nodeKindsInViews = new Set<string>();
      const edgeKindsInViews = new Set<string>();
      for (const view of packObj['views'] as unknown[]) {
        if (view === null || typeof view !== 'object' || Array.isArray(view)) continue;
        const v = view as Record<string, unknown>;
        if (v['nodeRoles'] !== null && typeof v['nodeRoles'] === 'object' && !Array.isArray(v['nodeRoles'])) {
          for (const k of Object.keys(v['nodeRoles'] as object)) nodeKindsInViews.add(k);
        }
        if (v['edgeRoles'] !== null && typeof v['edgeRoles'] === 'object' && !Array.isArray(v['edgeRoles'])) {
          for (const k of Object.keys(v['edgeRoles'] as object)) edgeKindsInViews.add(k);
        }
      }
      for (const id of nodeKindIds) {
        if (!nodeKindsInViews.has(id)) {
          issues.push(warn('pack', `nodeKinds[id=${id}]`, `node-kind "${id}" is not assigned a role in any view`));
        }
      }
      for (const id of edgeKindIds) {
        if (!edgeKindsInViews.has(id)) {
          issues.push(warn('pack', `edgeKinds[id=${id}]`, `edge-kind "${id}" is not assigned a role in any view`));
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Graph validation
  // -------------------------------------------------------------------------

  let graphObj: Record<string, unknown> | null = null;
  let graphParsedOk = false;
  try {
    const parsed = JSON.parse(graphText);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      issues.push(err('graph', '', 'graph must be a non-null, non-array JSON object'));
    } else {
      graphObj = parsed as Record<string, unknown>;
      graphParsedOk = true;
    }
  } catch {
    issues.push(err('graph', '', 'graph is not valid JSON'));
  }

  if (graphParsedOk && graphObj !== null) {
    if (graphObj['version'] !== 3) {
      issues.push(err('graph', 'version', `graph "version" must be 3, got ${JSON.stringify(graphObj['version'])}`));
    }

    const nodesOk = Array.isArray(graphObj['nodes']);
    const edgesOk = Array.isArray(graphObj['edges']);
    if (!nodesOk) issues.push(err('graph', 'nodes', '"nodes" must be an array'));
    if (!edgesOk) issues.push(err('graph', 'edges', '"edges" must be an array'));

    if (packParsedOk && packObj !== null) {
      if (graphObj['pack'] !== undefined) {
        if (typeof graphObj['pack'] !== 'string') {
          issues.push(err('graph', 'pack', '"pack" field must be a string if present'));
        } else if (typeof packObj['id'] === 'string' && graphObj['pack'] !== packObj['id']) {
          issues.push(err('graph', 'pack', `graph "pack" "${graphObj['pack']}" does not match pack "id" "${packObj['id']}"`));
        }
      }
    }

    const nodeIds = new Set<string>();
    if (nodesOk) {
      const seenNodeIds = new Set<string>();
      (graphObj['nodes'] as unknown[]).forEach((node, i) => {
        const base = `nodes[${i}]`;
        if (node === null || typeof node !== 'object' || Array.isArray(node)) {
          issues.push(err('graph', base, 'each node must be an object'));
          return;
        }
        const n = node as Record<string, unknown>;
        if (typeof n['id'] !== 'string') {
          issues.push(err('graph', base + '.id', '"id" must be a string'));
        } else {
          if (seenNodeIds.has(n['id'])) {
            issues.push(err('graph', base + '.id', `duplicate node id "${n['id']}"`));
          }
          seenNodeIds.add(n['id']);
          nodeIds.add(n['id']);
        }
        if (typeof n['kind'] !== 'string') {
          issues.push(err('graph', base + '.kind', '"kind" must be a string'));
        } else if (packParsedOk && !nodeKindIds.has(n['kind'])) {
          issues.push(err('graph', base + '.kind', `unknown node kind "${n['kind']}"`));
        } else if (packParsedOk && typeof n['kind'] === 'string' && compiledNodeSchemas.has(n['kind'])) {
          const schema = compiledNodeSchemas.get(n['kind'])!;
          const propsVal = n['props'] ?? {};
          if (!schema.validate(propsVal)) {
            issues.push(err('graph', base + '.props', `props do not match schema for kind "${n['kind']}": ${schema.errorsText()}`));
          }
        }
      });
    }

    if (edgesOk) {
      const seenEdgeIds = new Set<string>();
      (graphObj['edges'] as unknown[]).forEach((edge, i) => {
        const base = `edges[${i}]`;
        if (edge === null || typeof edge !== 'object' || Array.isArray(edge)) {
          issues.push(err('graph', base, 'each edge must be an object'));
          return;
        }
        const e = edge as Record<string, unknown>;
        if (typeof e['id'] !== 'string') {
          issues.push(err('graph', base + '.id', '"id" must be a string'));
        } else {
          if (seenEdgeIds.has(e['id'])) {
            issues.push(err('graph', base + '.id', `duplicate edge id "${e['id']}"`));
          }
          seenEdgeIds.add(e['id']);
        }
        if (typeof e['kind'] !== 'string') {
          issues.push(err('graph', base + '.kind', '"kind" must be a string'));
        } else if (packParsedOk && !edgeKindIds.has(e['kind'])) {
          issues.push(err('graph', base + '.kind', `unknown edge kind "${e['kind']}"`));
        } else if (packParsedOk && typeof e['kind'] === 'string' && compiledEdgeSchemas.has(e['kind'])) {
          const schema = compiledEdgeSchemas.get(e['kind'])!;
          const propsVal = e['props'] ?? {};
          if (!schema.validate(propsVal)) {
            issues.push(err('graph', base + '.props', `props do not match schema for kind "${e['kind']}": ${schema.errorsText()}`));
          }
        }
        if (typeof e['from'] !== 'string') {
          issues.push(err('graph', base + '.from', '"from" must be a string'));
        } else if (!nodeIds.has(e['from'])) {
          issues.push(err('graph', base + '.from', `"from" references unknown node id "${e['from']}"`));
        }
        if (typeof e['to'] !== 'string') {
          issues.push(err('graph', base + '.to', '"to" must be a string'));
        } else if (!nodeIds.has(e['to'])) {
          issues.push(err('graph', base + '.to', `"to" references unknown node id "${e['to']}"`));
        }
      });
    }

    if (packParsedOk && graphObj['defaultView'] !== undefined) {
      if (typeof graphObj['defaultView'] !== 'string') {
        issues.push(err('graph', 'defaultView', '"defaultView" must be a string if present'));
      } else if (!viewIds.has(graphObj['defaultView'])) {
        issues.push(err('graph', 'defaultView', `"defaultView" "${graphObj['defaultView']}" does not match any view id in the pack`));
      }
    }
  }

  return {
    valid: issues.every(i => i.severity !== 'error'),
    issues,
  };
}
