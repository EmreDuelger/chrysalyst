/*
 * The browser's whole knowledge of the `GET /status` route: the wire shape
 * restated from `platform/backend-status`, and the probe that turns a
 * response into a typed {@link BackendReadiness} or a rejection naming what
 * this side could not read.
 *
 * `@chrysalyst/web` declares no workspace package, so it cannot import the
 * server's route or result types and restates the wire shape here instead,
 * the way `interview-api.ts` restates the SSE contract for
 * `interview/interview-http-api`. `tests/fixtures/backend-status.json` is
 * the two sides' shared agreement — this module's test asserts the
 * restatement against it, so a renamed field, a renamed fault or a moved
 * route fails a run rather than only a browser.
 *
 * A response this package cannot read — a status other than `200`, or a
 * body missing a field or naming an unknown fault — is rejected with an
 * English message rather than translated: `007`'s § Non-Goals drew that
 * boundary for `interview-api.ts`'s own rejections, and this module keeps
 * it, because the failure is transport, not the domain's copy.
 */

/** The two things a person can act on, told apart because the actions differ. */
export type BackendFault = 'unreachable' | 'model-missing';

const KNOWN_FAULTS: readonly BackendFault[] = ['unreachable', 'model-missing'];

/** The status route's answer: ready, or blocked with the fault that stops it. */
export type BackendReadiness =
  | { readonly ready: true; readonly backend: string; readonly model: string }
  | {
      readonly ready: false;
      readonly backend: string;
      readonly model: string;
      readonly reason: BackendFault;
    };

/** A seam for a probe implementation, so a caller can be tested without a network. */
export type BackendProbe = () => Promise<BackendReadiness>;

const OK = 200;

/** The route this package asks whether an interview can start. */
export const STATUS_ROUTE = '/status';

/**
 * Requests {@link STATUS_ROUTE} and answers what it reported. Rejects when
 * the route answers anything this package cannot read — an unreachable
 * server, a status other than `200`, or a malformed body — so the shell can
 * show that message rather than guessing.
 */
export async function fetchBackendReadiness(
  fetchImpl: typeof fetch = fetch,
): Promise<BackendReadiness> {
  const response = await fetchImpl(STATUS_ROUTE);
  if (response.status !== OK) {
    throw new Error(
      `Checking the backend failed: GET ${STATUS_ROUTE} answered ${String(response.status)}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new Error(
      `The status response was not JSON: GET ${STATUS_ROUTE} answered ${String(response.status)}`,
      { cause },
    );
  }
  return toBackendReadiness(payload);
}

/** The probe bound to the browser's global `fetch`. */
export const browserBackendProbe: BackendProbe = () => fetchBackendReadiness();

function toBackendReadiness(payload: unknown): BackendReadiness {
  const ready = readBoolean(payload, 'ready');
  const backend = readString(payload, 'backend');
  const model = readString(payload, 'model');
  if (ready) {
    return { ready: true, backend, model };
  }
  return { ready: false, backend, model, reason: readReason(payload) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(payload: unknown, field: string): boolean {
  if (isRecord(payload) && typeof payload[field] === 'boolean') {
    return payload[field];
  }
  throw new Error(
    `The status response carried no boolean "${field}": ${JSON.stringify(payload)}`,
  );
}

function readString(payload: unknown, field: string): string {
  if (isRecord(payload) && typeof payload[field] === 'string') {
    return payload[field];
  }
  throw new Error(
    `The status response carried no string "${field}": ${JSON.stringify(payload)}`,
  );
}

function isBackendFault(value: unknown): value is BackendFault {
  return (
    typeof value === 'string' &&
    (KNOWN_FAULTS as readonly string[]).includes(value)
  );
}

function readReason(payload: unknown): BackendFault {
  const value = isRecord(payload) ? payload.reason : undefined;
  if (isBackendFault(value)) return value;
  throw new Error(
    `The status response carried no known "reason": ${JSON.stringify(payload)}`,
  );
}
