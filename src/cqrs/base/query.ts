import { v4 as uuidv4 } from 'uuid';

/**
 * Base class for all queries in the CQRS system.
 * Queries represent read operations that don't change state.
 */
export abstract class Query {
  /** Unique identifier for this query */
  readonly queryId: string;

  /** When this query was created */
  readonly timestamp: Date;

  /** Optional correlation ID for tracing */
  readonly correlationId?: string;

  constructor(correlationId?: string) {
    this.queryId = uuidv4();
    this.timestamp = new Date();
    this.correlationId = correlationId;
  }

  /**
   * Returns the query type name (e.g., 'GetBalanceQuery', 'GetTransactionHistoryQuery')
   * Used for query routing and logging
   */
  getQueryType(): string {
    return this.constructor.name;
  }
}
