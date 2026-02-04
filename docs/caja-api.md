# API de Caja (Cash Movements)

Base: `/api/cash-movements`

## GET /api/cash-movements
Lista movimientos con filtros.

**Query params (opcionales)**
- `from` (YYYY-MM-DD)
- `to` (YYYY-MM-DD)
- `status` (PENDING | COLLECTED | RETAINED | READY_TO_TRANSFER | TRANSFERRED | VOID | ALL)
- `type` (INCOME | EXPENSE | COMMISSION | RETENTION | ADJUSTMENT | ALL)
- `contractId`
- `propertyId`
- `ownerId`
- `tenantPersonId`
- `paymentId`

**Respuesta**
```json
{ "ok": true, "movements": [], "summary": { "total": 0, "byStatus": {}, "byType": {} } }
```

## POST /api/cash-movements
Crea un movimiento.

**Body**
```json
{
  "type": "INCOME",
  "status": "COLLECTED",
  "amount": 120000,
  "currency": "ARS",
  "date": "2026-02-04",
  "contractId": "...",
  "propertyId": "...",
  "ownerId": "...",
  "tenantPersonId": "...",
  "subtype": "RENT",
  "installmentId": "...",
  "paymentId": "...",
  "notes": "Cobro febrero",
  "createdBy": "system"
}
```

## POST /api/cash-movements/:id/void
Anula un movimiento (soft delete).

**Body**
```json
{ "reason": "Error de carga", "voidedBy": "admin" }
```
