/** Identifies one interview session for as long as the store holds it. */
export type SessionId = string;

/**
 * A session at rest: the identity and bookkeeping the store owns, wrapped
 * around the domain state it carries but never interprets.
 */
export interface StoredSession<TState> {
  readonly id: SessionId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly state: TState;
}

/**
 * The boundary through which interview sessions outlive a process.
 *
 * Generic over the state it persists, because a store genuinely does not care
 * what a session contains — the first interview feature supplies that type
 * without touching this port, and nothing here has to guess it in advance.
 * There is no `delete`: no use case asks to remove a session, and an unasked
 * method is one every future adapter would have to implement untested.
 */
export interface SessionStorePort<TState> {
  /** Answers the identifier of every session currently stored. */
  list(): Promise<readonly SessionId[]>;

  /**
   * Answers the stored session, or nothing when the identifier was never
   * saved — a stale link is an ordinary outcome, not a failure.
   */
  load(id: SessionId): Promise<StoredSession<TState> | undefined>;

  /** Persists the session, replacing any earlier revision of the same identifier. */
  save(session: StoredSession<TState>): Promise<void>;
}
