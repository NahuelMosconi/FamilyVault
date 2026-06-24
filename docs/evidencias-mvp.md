# Evidencias del MVP — FamilyVault

> Documento de evidencias para el jurado: demuestra qué está construido y que
> **funciona de punta a punta**. Acompaña a la memoria técnica y al pitch.

---

## 1. Resumen del MVP

FamilyVault es una **dApp funcional** desplegada sobre la testnet **Sepolia** de
Ethereum: un fondo de emergencia familiar custodiado por un contrato inteligente
**multifirma (M de N)**, que libera los fondos **al solicitante** cuando un mínimo
de guardianes aprueba en la cadena.

| Ítem | Estado |
|------|--------|
| Contrato inteligente (Solidity) | ✅ Desplegado en Sepolia |
| Frontend (dApp) en vivo | ✅ Publicado en Vercel |
| Pruebas automáticas (Hardhat) | ✅ 27 tests en verde |
| Flujo completo demostrable | ✅ depositar → reclamar → aprobar → liberar |

## 2. Enlaces de la evidencia (completar al finalizar)

- **dApp en vivo:** `https://family-vault-lime.vercel.app`
- **Repositorio GitHub (público):** `https://github.com/NahuelMosconi/FamilyVault`
- **Contrato desplegado (Sepolia):** `[pegar la dirección final]`
  → `https://sepolia.etherscan.io/address/[dirección]`
- **Transacciones de ejemplo** (depósito / reclamo / aprobación / liberación):
  `[pegar links de Etherscan tras la demo]`
- **Video demo:** `[pegar enlace]`

> Nota: una versión previa del contrato estuvo desplegada en Sepolia en
> `0xFEA4dca7466DA64cA8f4928F6541cA445B49102d` (evidencia de que el sistema fue
> desplegado y operado sobre la red real de prueba). La dirección final corresponde
> al contrato con todas las funcionalidades.

## 3. Capturas de la interfaz

**Tema oscuro:**

![Interfaz — tema oscuro](img/captura-dark.png)

**Tema claro:**

![Interfaz — tema claro](img/captura-light.png)

> Para la entrega final, agregar también capturas de: un reclamo en estado
> **Pendiente** (progreso 2/3), un reclamo **Liberado** y la **transacción en
> Etherscan**.

## 4. Funcionalidades implementadas (alcance real)

- ✅ **Depósitos** al fondo (`depositar` / `receive`), con evento.
- ✅ **Crear reclamo** de emergencia (descripción + monto + hash de evidencia).
- ✅ **Aprobación multifirma** (M de N); al alcanzar el umbral, **libera al solicitante**.
- ✅ **Cancelar reclamo** (estado `Cancelado`) por el solicitante o el admin.
- ✅ **Meta de ahorro** del fondo con barra de progreso (`fijarMeta`).
- ✅ **Recuperación social de guardianes**: reemplazar por consenso a un integrante
  que perdió su clave (`proponerRotacion` / `aprobarRotacion`).
- ✅ **Fábrica multi-familia** (`FamilyVaultFactory`): cada familia crea su bóveda.
- ✅ **Historial on-chain** persistente, **estadísticas** y **aportes por integrante**.
- ✅ Frontend SaaS con **tema claro/oscuro**, notificaciones y confeti al liberar.

### Pendiente (roadmap)
Stablecoin (USDC/DAI), reglas de liberación parciales, rampas a fiat, multi-red,
app móvil con notificaciones, indexador (The Graph) para escala.

## 5. Evidencia de pruebas automáticas (27 tests en verde)

Ejecutar con: `npm install && npx hardhat test`

```
FamilyVault
  Despliegue y configuración
    ✔ guarda guardianes y umbral
    ✔ rechaza un umbral mayor que la cantidad de guardianes
    ✔ rechaza guardianes duplicados
  Depósitos
    ✔ cualquiera puede depositar y el balance se actualiza
    ✔ emite el evento Deposito
    ✔ acepta ETH enviado directo (receive)
  Creación de reclamos
    ✔ un guardián puede crear un reclamo (estado inicial Abierto)
    ✔ un NO guardián no puede crear un reclamo
    ✔ no permite crear un reclamo por más del balance
  Aprobación y liberación (máquina de estados)
    ✔ un NO guardián no puede aprobar
    ✔ la primera aprobación deja el reclamo en Pendiente
    ✔ un guardián no puede aprobar dos veces el mismo reclamo
    ✔ libera los fondos al SOLICITANTE al alcanzar el umbral
    ✔ no se puede aprobar un reclamo ya liberado
    ✔ NO libera fondos antes de alcanzar el umbral
  Cancelación de reclamos
    ✔ el solicitante puede cancelar su reclamo
    ✔ el admin también puede cancelar
    ✔ un tercero no puede cancelar
    ✔ no se puede aprobar un reclamo cancelado
    ✔ no se puede cancelar un reclamo ya liberado
  Meta del fondo
    ✔ solo el admin puede fijar la meta
  Recuperación social (rotación de guardianes)
    ✔ rota un guardián al alcanzar el umbral
    ✔ no permite proponer reemplazar a un no-guardián
    ✔ un no-guardián no puede aprobar una rotación
  Seguridad: defensa anti-reentrancy
    ✔ un receptor malicioso NO puede drenar fondos al reentrar
FamilyVaultFactory
    ✔ crea una bóveda funcional y la registra
    ✔ registra las bóvedas por creador

27 passing
```

El **test de reentrancy** es evidencia directa de la defensa de seguridad: un
contrato atacante intenta reentrar al recibir los fondos y **no logra drenar ETH
de más** (gracias a checks-effects-interactions + candado anti-reentrancy).

## 6. Máquina de estados (evidencia conceptual / materia)

Cada reclamo es un **autómata finito**:

```
Abierto ──► Pendiente ──► Aprobado ──► Liberado        (cancelar) ──► Cancelado
 (creado)   (aprob<M)     (aprob==M)   (al solicitante)
```

Detalle formal (estados, alfabeto, función de transición) en
[`diagrama-estados.md`](diagrama-estados.md).

## 7. Cómo reproducir la demo

Guía paso a paso (instalar MetaMask, Sepolia, faucet, desplegar en Remix y guion
de demo) en [`../contract/DEPLOY.md`](../contract/DEPLOY.md).

Flujo mínimo verificable:
1. Conectar wallet (guardián) → **Depositar** 0.05 ETH.
2. **Reportar emergencia** (crear reclamo) por 0.05 ETH.
3. **Aprobar** con 3 cuentas distintas hasta el umbral (3 de 4).
4. Los fondos se **liberan automáticamente al solicitante** → verlo en Etherscan.
