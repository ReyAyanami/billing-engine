/**
 * Account-related enums and types.
 * Separated from entity to support pure event-sourced architecture.
 */

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

export enum AccountType {
  USER = 'user', // End-user account
  SYSTEM = 'system', // Internal system account
  EXTERNAL = 'external', // External financial service
}

