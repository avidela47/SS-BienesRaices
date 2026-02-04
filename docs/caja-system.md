# Sistema de Caja (Inmobiliaria)

> Documento funcional para implementar un sistema contable simplificado en la app.

## 1) Objetivo
Centralizar y auditar todo el flujo de dinero vinculado a contratos: cobros, pagos, gastos, comisiones, retenciones y garantías, con estados claros y trazabilidad completa.

## 2) Entidades lógicas (alto nivel)

### 2.1 Core
- **MovimientoCaja** (ledger principal)
- **LiquidacionPropietario** (opcional, agrupador por período)
- **Notificacion** (log de WhatsApp/Email)

### 2.2 Relacionadas (ya existen)
- **Contrato**
- **Propiedad**
- **Inquilino** (Person)
- **Propietario** (Person)
- **Usuario** (quien registra)
- **Installment / MonthlyRent / Payment** (fuentes de cobro)

## 3) Tipos de movimientos

### Ingresos
- Alquiler mensual
- Intereses por mora
- Multas
- Ajustes positivos

### Egresos
- Pago a propietario
- Reparaciones
- Servicios (luz/agua/expensas)
- Impuestos
- Ajustes negativos

### Comisiones
- Comisión inmobiliaria
- Gestión de reparaciones
- Comisiones extraordinarias

### Retenciones / Fondos
- Retención administrativa
- Fondo de reserva
- Depósito en garantía
- Reintegro de garantía

## 4) Estados del dinero (estado financiero)
- **PENDIENTE**: generado, aún no cobrado
- **COBRADO**: ingresó a caja
- **RETENIDO**: bloqueado (no transferible)
- **LISTO_PARA_TRANSFERIR**: neto calculado
- **TRANSFERIDO/PAGADO**: egreso realizado
- **ANULADO**: no se borra, se anula

## 5) Titularidad del dinero
- **PENDIENTE**: inquilino
- **COBRADO**: inmobiliaria (custodia)
- **COMISIÓN**: inmobiliaria (propio)
- **LISTO_PARA_TRANSFERIR**: propietario
- **TRANSFERIDO**: propietario (ya pagado)

## 6) Flujo principal (alquiler)

1. Se genera el alquiler → **Movimiento: Ingreso/PENDIENTE**
2. Inquilino paga → **Ingreso/COBRADO** (entra a caja)
3. Se registra comisión → **Comisión/COBRADO**
4. Se descuentan gastos → **Egresos/COBRADO**
5. Se calcula neto propietario → **Egreso/PENDIENTE**
6. Se marca listo → **LISTO_PARA_TRANSFERIR**
7. Se transfiere → **TRANSFERIDO**

## 7) Flujos adicionales

### 7.1 Gastos del inmueble
- Se registran como **Egreso**
- Si se descontará del propietario, se asocia a la misma liquidación

### 7.2 Depósito en garantía
- Entrada: **Retención/COBRADO**
- Salida: **Retención/TRANSFERIDO** o **Reintegro**

### 7.3 Ajustes
- Siempre generan un movimiento separado (positivo o negativo)
- Nunca se edita el movimiento original

## 8) Reglas del sistema
1. **Nada se elimina**: se anula o se revierte con un movimiento inverso
2. **Todo tiene historial** (fecha, usuario, motivo)
3. **Todo movimiento** debe estar vinculado a:
   - Contrato
   - Propiedad
   - Inquilino
   - Propietario
   - Usuario que lo registró
4. **Movimientos inmutables** (si hay error → reversión)

## 9) Caja
- **Caja General**: suma total de movimientos
- **Caja por Propiedad**: filtro por propertyId
- **Caja por Contrato**: filtro por contractId

## 10) Reportes necesarios
- Dinero en caja
- Dinero retenido
- Dinero listo para transferir a propietarios
- Comisiones generadas
- Deudas por contrato
- Movimientos por período
- Rentabilidad por propiedad

## 11) Estados y transiciones

| Estado | Transiciones válidas |
|--------|----------------------|
| PENDIENTE | COBRADO / ANULADO |
| COBRADO | RETENIDO / LISTO_PARA_TRANSFERIR |
| RETENIDO | LISTO_PARA_TRANSFERIR / ANULADO |
| LISTO_PARA_TRANSFERIR | TRANSFERIDO |
| TRANSFERIDO | — |
| ANULADO | — |

## 12) Notificaciones (WhatsApp + Email)

### Disparadores
- **D-3**, **D-2**, **D-1** antes del vencimiento
- **Día de vencimiento**

### Condición
- Solo si el estado del alquiler sigue **PENDIENTE**
- Si pasa a **COBRADO** → se detiene la cadena

### Log
- Se registra: canal, fecha, usuario/automatización, resultado

## 13) Plan de trabajo (paso a paso)

1. **Aprobación de este diseño** (este documento)
2. Definir **modelo de datos** (colecciones y campos mínimos)
3. Crear **API de movimientos** (alta, anular, listar)
4. Integrar con **pagos y cuotas** actuales
5. Crear **reportes básicos**
6. Implementar **notificaciones automáticas** (D-3/D-2/D-1/Día)
7. QA con casos reales
