# Currency API

## Overview

The Currency API provides endpoints for querying supported currencies. Currencies are pre-configured in the system and define precision rules for decimal calculations.

**Base Path**: `/api/v1/currencies`

---

## Supported Currencies

### Fiat Currencies

| Code | Name | Precision | Symbol |
|------|------|-----------|--------|
| USD | US Dollar | 2 | $ |
| EUR | Euro | 2 | € |
| GBP | British Pound | 2 | £ |

### Non-Fiat Currencies

| Code | Name | Precision | Symbol |
|------|------|-----------|--------|
| BTC | Bitcoin | 8 | ₿ |
| ETH | Ethereum | 8 | Ξ |
| POINTS | Reward Points | 0 | pts |

**Precision**: Number of decimal places for the currency.

---

## Endpoints

### List All Currencies

Get all active currencies supported by the system.

```http
GET /api/v1/currencies
```

#### Response: 200 OK

```json
[
  {
    "code": "USD",
    "name": "US Dollar",
    "type": "fiat",
    "precision": 2,
    "isActive": true,
    "metadata": {
      "symbol": "$"
    }
  },
  {
    "code": "EUR",
    "name": "Euro",
    "type": "fiat",
    "precision": 2,
    "isActive": true,
    "metadata": {
      "symbol": "€"
    }
  },
  {
    "code": "BTC",
    "name": "Bitcoin",
    "type": "non-fiat",
    "precision": 8,
    "isActive": true,
    "metadata": {
      "symbol": "₿"
    }
  }
]
```

#### cURL Example

```bash
curl http://localhost:3000/api/v1/currencies
```

---

### Get Currency by Code

Get details of a specific currency.

```http
GET /api/v1/currencies/:code
```

#### Path Parameters

- `code` (required) - Currency code (e.g., `USD`, `BTC`)

#### Response: 200 OK

```json
{
  "code": "USD",
  "name": "US Dollar",
  "type": "fiat",
  "precision": 2,
  "isActive": true,
  "metadata": {
    "symbol": "$",
    "minorUnit": "cent"
  }
}
```

#### Errors

- `400 Bad Request` - Invalid or inactive currency

#### cURL Example

```bash
curl http://localhost:3000/api/v1/currencies/USD
```

---

## Currency Types

### Fiat

Traditional government-issued currencies:
- USD, EUR, GBP, JPY, etc.
- Typically 2 decimal places
- Well-defined precision rules

### Non-Fiat

Digital currencies and points:
- BTC, ETH (cryptocurrencies)
- POINTS (loyalty/reward points)
- Variable precision (0-8 decimal places)

---

## Precision

Precision defines decimal places for calculations:

```typescript
// USD (precision: 2)
"100.50"  ✓
"100.505" ✗ Too many decimals

// BTC (precision: 8)
"0.12345678"  ✓
"0.123456789" ✗ Too many decimals

// POINTS (precision: 0)
"100"  ✓
"100.5" ✗ No decimals allowed
```

**Validation**: System enforces precision during transaction creation.

---

## Adding New Currencies

Currencies are initialized on application startup:

```typescript
// In CurrencyService.initializeDefaultCurrencies()
const currencies = [
  { code: 'USD', name: 'US Dollar', type: 'fiat', precision: 2 },
  { code: 'EUR', name: 'Euro', type: 'fiat', precision: 2 },
  // Add more here
];
```

**To add a new currency**:
1. Update `initializeDefaultCurrencies()` in `currency.service.ts`
2. Restart application
3. Currency available for new accounts

**Note**: Cannot change currency of existing accounts.

---

## Related Documentation

- [Account API](./accounts.md) - Accounts must specify currency
- [Transaction API](./transactions.md) - Transactions must match currency
- [Multi-Currency Accounts](../concepts/accounts.md#multi-currency) - One currency per account

