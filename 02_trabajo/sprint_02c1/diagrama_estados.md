# Estados de reservas y pagos — Sprint 2C.1

```mermaid
stateDiagram-v2
  [*] --> HoldPendiente: crear hold / payment pending
  HoldPendiente --> Confirmada: pay_at_garage / payment pending
  HoldPendiente --> Confirmada: demo_simulated / payment approved, is_test=true
  HoldPendiente --> Vencida: TTL / payment cancelled + eventos + auditoría
  HoldPendiente --> Cancelada: cancelar
  Confirmada --> Confirmada: extender con cotización válida aceptada
  Confirmada --> Cancelada: cancelar según regla vigente
  Confirmada --> CheckIn: evento operativo Sprint 3
  CheckIn --> Completada: check-out operativo Sprint 3
  HoldPendiente --> HoldPendiente: retry de confirmación no cambia método
  Confirmada --> Confirmada: replay del quote aplicado / respuesta idempotente

  state "Mercado Pago" as MP {
    [*] --> Deshabilitado
    Deshabilitado: Sin hold MP ni aprobación por RPC demo
    Deshabilitado --> PendienteSprint2D: backend verificado + webhook autenticado (futuro)
  }
```

Las cotizaciones de extensión tienen ciclo separado: `offered → applied`; pueden pasar a `expired` o `stale`. Una cotización vencida o cuyo precio cambió necesita una nueva cotización y aceptación. La falta de disponibilidad no altera la reserva original.
