/**
 * Metadata type definitions for events, transactions, and entities
 *
 * These types provide compile-time safety for metadata fields throughout the system.
 * Use specific metadata types instead of `Record<string, any>`.
 */

/**
 * Base metadata value - only allow serializable types
 */
export type MetadataValue = string | number | boolean | Date | null | undefined;

/**
 * Base metadata type - stricter than Record<string, any>
 */
export type Metadata = Record<string, MetadataValue>;

/**
 * Event-specific metadata
 * Used in domain events to track request context
 */
export interface EventMetadata {
  /** ID of the actor/user who triggered this event */
  actorId?: string;

  /** Type of actor (e.g., 'user', 'system', 'admin') */
  actorType?: string;

  /** IP address of the request */
  ipAddress?: string;

  /** User agent string from the request */
  userAgent?: string;

  /** Unique request ID for tracing */
  requestId?: string;

  /** Additional custom fields */
  [key: string]: MetadataValue;
}

/**
 * Transaction-specific metadata
 * Used for transaction entities and operations
 */
export interface TransactionMetadata {
  /** Source system or integration */
  source?: string;

  /** External system transaction ID */
  externalId?: string;

  /** Bank or payment processor reference */
  bankReference?: string;

  /** Payment processor ID */
  processorId?: string;

  /** Raw response from payment processor */
  processorResponse?: string;

  /** Additional custom fields */
  [key: string]: MetadataValue;
}

/**
 * Payment-specific metadata
 * Used for payment transactions (C2B)
 */
export interface PaymentMetadata extends TransactionMetadata {
  /** Order ID from e-commerce system */
  orderId?: string;

  /** Invoice ID */
  invoiceId?: string;

  /** Payment description */
  description?: string;

  /** Merchant's internal reference */
  merchantReference?: string;

  /** Custom data from merchant (serialized as JSON string if needed) */
  customDataJson?: string;
}

/**
 * Refund-specific metadata
 * Used for refund transactions
 */
export interface RefundMetadata extends TransactionMetadata {
  /** Reason for refund */
  reason?: string;

  /** Refund reason code */
  reasonCode?: string;

  /** Type of refund */
  refundType?: 'full' | 'partial';

  /** Who initiated the refund */
  initiatedBy?: string;

  /** Original payment reference */
  originalPaymentReference?: string;
}

/**
 * Transfer-specific metadata
 * Used for internal transfers (P2P)
 */
export interface TransferMetadata extends TransactionMetadata {
  /** Purpose of transfer */
  purpose?: string;

  /** Transfer category */
  category?: string;

  /** Notes or description */
  notes?: string;
}

/**
 * Account metadata
 * Used for account entities
 */
export interface AccountMetadata {
  /** Account creation source */
  creationSource?: string;

  /** KYC verification status */
  kycStatus?: 'pending' | 'verified' | 'rejected';

  /** KYC verification date */
  kycVerifiedAt?: Date;

  /** Account tags for categorization */
  tags?: string[];

  /** Additional custom fields */
  [key: string]: MetadataValue | string[];
}

/**
 * Type guard: Check if value is valid EventMetadata
 */
export function isEventMetadata(value: unknown): value is EventMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const metadata = value as Record<string, unknown>;

  // Check optional fields if present
  if (metadata.actorId !== undefined && typeof metadata.actorId !== 'string') {
    return false;
  }

  if (
    metadata.actorType !== undefined &&
    typeof metadata.actorType !== 'string'
  ) {
    return false;
  }

  return true;
}

/**
 * Type guard: Check if value is valid metadata value
 */
export function isMetadataValue(value: unknown): value is MetadataValue {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  );
}

/**
 * Sanitize metadata to ensure all values are valid MetadataValue types
 * This is useful when receiving metadata from external sources
 */
export function sanitizeMetadata<T extends Metadata>(
  metadata: Record<string, unknown>,
): T {
  const sanitized: Record<string, MetadataValue> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (isMetadataValue(value)) {
      sanitized[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      // Convert objects to JSON strings
      sanitized[key] = JSON.stringify(value);
    } else {
      // Skip invalid values
      continue;
    }
  }

  return sanitized as T;
}
