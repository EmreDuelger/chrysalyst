import type { LlmPort } from '@chrysalyst/core';

/**
 * The backend as a person is told about it: the name to show, and the model
 * chrysalyst will ask it for.
 *
 * Declared by the rule that needs it rather than by the adapter, because the
 * adapter never sends the name — `platform/llm-port`'s contract is that no
 * caller above the port learns which backend is answering, so the name is
 * presentation and stops at the delivery layer.
 */
export interface BackendDescriptor {
  readonly name: string;
  readonly model: string;
}

/** The two things a person can act on, told apart because the actions differ. */
export type BackendFault = 'unreachable' | 'model-missing';

export type BackendReadiness =
  | { readonly ready: true; readonly backend: string; readonly model: string }
  | {
      readonly ready: false;
      readonly backend: string;
      readonly model: string;
      readonly reason: BackendFault;
    };

/**
 * How long a probe may take before the backend counts as unreachable.
 *
 * One owner, here rather than also in the browser: a client inherits the bound
 * by asking a route that is already bounded, so there are never two numbers to
 * keep in agreement. It is a constant and not a parameter because a loopback
 * probe that needs more than two seconds is a fault either way.
 */
export const BACKEND_PROBE_DEADLINE_MS = 2_000;

/**
 * Answers whether an interview can start right now, and which of two faults
 * stops it.
 *
 * Readiness is two questions and `LlmPort.status` answers only the first:
 * `platform/llm-port` has a reachable backend report as available even when it
 * holds no model at all. The second — whether the model chrysalyst will send is
 * in that inventory — is decided here, above the port, because the configured
 * model is a fact about this deployment rather than about the backend. The
 * comparison is exact, since the adapter sends that id verbatim and a gate that
 * passed on a near match would hand the person a failing inference in place of
 * a setup step.
 *
 * Never rejects. A probe that learned nothing and a backend that is down leave
 * the person the same single action, so every rejection — the adapter's
 * cancelled-probe rejection included — answers `unreachable`; letting one
 * escape would answer a machine that is merely not set up yet with a `500`.
 *
 * The deadline is an {@link AbortController} aborted by a `setTimeout` that
 * every settle path clears, and deliberately not `AbortSignal.timeout`: that
 * holds a native timer no fake-timer clock replaces, which would leave the one
 * bound this module exists to guarantee untestable. The signal is created here
 * and handed nowhere else, so the deadline is the only cancellation this probe
 * can suffer and there is no caller cancellation to tell apart from it.
 */
export async function readBackendReadiness(
  llm: LlmPort,
  backend: BackendDescriptor,
): Promise<BackendReadiness> {
  const probe = new AbortController();
  const deadline = setTimeout(() => {
    probe.abort();
  }, BACKEND_PROBE_DEADLINE_MS);

  try {
    const status = await llm.status(probe.signal);
    if (!status.available) {
      return blocked(backend, 'unreachable');
    }
    if (!status.models.includes(backend.model)) {
      return blocked(backend, 'model-missing');
    }
    return { ready: true, backend: backend.name, model: backend.model };
  } catch {
    return blocked(backend, 'unreachable');
  } finally {
    clearTimeout(deadline);
  }
}

function blocked(
  backend: BackendDescriptor,
  reason: BackendFault,
): BackendReadiness {
  return {
    ready: false,
    backend: backend.name,
    model: backend.model,
    reason,
  };
}
