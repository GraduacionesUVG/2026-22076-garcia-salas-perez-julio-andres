import type { ServerSupabase } from '@/src/modules/auth/auth.guard';
import { withDependencyResult } from './dependency-errors';

export type Workflow = 'delimitation' | 'research-design' | 'sample-config';
export type WorkflowVersionData<V, C> = { version: V; children: C[]; created: boolean };
export type WorkflowRestoreData<P, C, V, VC> = {
  target: WorkflowVersionData<V, VC>;
  backup: WorkflowVersionData<V, VC> | null;
  backup_created: boolean;
  parent: P;
  children: C[];
};

export function workflowDatabaseError(error: unknown, workflow: Workflow): unknown {
  const e = error as { code?: string; message?: string; details?: string } | null;
  if (e?.code !== 'P0001') return error;
  const prefix = workflow.replaceAll('-', '_').toUpperCase();
  if (e.message === 'WORKFLOW_REVISION_CONFLICT') {
    let latest: unknown = null;
    try { latest = JSON.parse(e.details ?? 'null'); } catch { /* No provider diagnostics in the response. */ }
    return Object.assign(new Error(`${prefix}_REVISION_CONFLICT`), { status: 409, code: `${prefix}_REVISION_CONFLICT`, latest });
  }
  if (e.message === 'WORKFLOW_WRITE_CONFLICT') return Object.assign(new Error(e.message), { status: 409, code: e.message });
  if (e.message === 'WORKFLOW_FORBIDDEN') return Object.assign(new Error('Forbidden'), { status: 403 });
  if (e.message === 'WORKFLOW_VERSION_NOT_FOUND') return Object.assign(new Error(workflow === 'delimitation' ? 'VERSION_NOT_FOUND' : `${prefix}_VERSION_NOT_FOUND`), { status: 404 });
  return error;
}

/** The same busy-write mapping is used by ordinary writes and transaction RPCs. */
export async function withWorkflowResult<T extends { error: unknown; status?: number }>(workflow: Workflow, operation: () => PromiseLike<T>): Promise<T> {
  const result = await withDependencyResult(operation);
  if (result.error) {
    const mapped = workflowDatabaseError(result.error, workflow);
    if (mapped !== result.error) throw mapped;
  }
  return result;
}

export async function workflowRpc<T>(db: ServerSupabase, workflow: Workflow, rpc: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await withWorkflowResult(workflow, () => db.rpc(rpc, { p_workflow: workflow, ...args }));
  if (error) throw error;
  return data as T;
}
