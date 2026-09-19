import { checkNylonDocument, type NylonDiagnostic } from './diagnostics.ts';
import type { NylonDocument } from './types.ts';

export interface NylonDoctorRepair { code: string; message: string }
export type NylonDoctorResult = { ok: true; doc: NylonDocument; repairs: NylonDoctorRepair[]; issues: NylonDiagnostic[] };

/** Doctor diagnoses only. Authored content is never repaired or deleted implicitly. */
export function doctorNylonDocument(doc: NylonDocument): NylonDoctorResult {
  return { ok: true, doc, repairs: [], issues: checkNylonDocument(doc) };
}
