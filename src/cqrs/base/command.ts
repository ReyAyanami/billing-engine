import { v4 as uuidv4 } from 'uuid';

/**
 * Base class for all commands in the CQRS system.
 * Commands represent intentions to change state (write operations).
 */
export abstract class Command {
  /** Unique identifier for this command */
  readonly commandId: string;

  /** When this command was created */
  readonly timestamp: Date;

  /** Correlation ID for tracing related commands/events */
  readonly correlationId: string;

  /** ID of the actor (user/system) issuing this command */
  readonly actorId?: string;

  constructor(correlationId?: string, actorId?: string) {
    this.commandId = uuidv4();
    this.timestamp = new Date();
    this.correlationId = correlationId || uuidv4();
    this.actorId = actorId;
  }

  /**
   * Returns the command type name (e.g., 'CreateAccount', 'TopupCommand')
   * Used for command routing and logging
   */
  getCommandType(): string {
    return this.constructor.name;
  }
}
