# Guía de despliegue y demo — FamilyVault

Esta guía explica, paso a paso y en español, cómo poner a andar la dApp de punta
a punta: instalar MetaMask, configurar Sepolia, conseguir ETH de prueba,
desplegar el contrato en Remix, conectar el frontend y grabar la demo.

> Todo ocurre en la **testnet Sepolia** de Ethereum. El ETH de Sepolia **no
> tiene valor real**: es de prueba. Nunca uses claves privadas con fondos reales.

---

## 1. Instalar MetaMask y agregar la red Sepolia

1. Instalá la extensión **MetaMask** desde <https://metamask.io/> (Chrome, Brave,
   Firefox o Edge). Creá una billetera y **guardá la frase de recuperación** en
   un lugar seguro.
2. Sepolia viene preconfigurada en MetaMask. Para verla:
   - Abrí MetaMask → menú de redes (arriba a la izquierda).
   - Activá **"Mostrar redes de prueba"** en Configuración → Avanzado si no
     aparece.
   - Seleccioná **Sepolia**.
3. Datos de la red (por si necesitás agregarla manualmente):
   - **Nombre:** Sepolia
   - **Chain ID:** `11155111`
   - **Símbolo:** ETH
   - **RPC URL:** `https://rpc.sepolia.org` (o tu proveedor: Infura/Alchemy)
   - **Explorador:** `https://sepolia.etherscan.io`

---

## 2. Crear varias cuentas (simular guardianes) y pedir ETH de prueba

Para probar el flujo M de N necesitás varias direcciones (los guardianes).

1. En MetaMask, abrí el selector de cuentas → **"Agregar cuenta"**. Creá al menos
   **3 a 5 cuentas** (Cuenta 1, Cuenta 2, …). Cada una es un "integrante de la
   familia".
2. Anotá la dirección pública (`0x...`) de cada cuenta; las vas a necesitar para
   el constructor.
3. Conseguí **ETH de prueba** para las cuentas que vayan a pagar gas (al menos la
   que despliega y las que aprueban). Pedí en un faucet de Sepolia, por ejemplo:
   - <https://sepoliafaucet.com/> (Alchemy)
   - <https://faucet.quicknode.com/ethereum/sepolia>
   - <https://www.infura.io/faucet/sepolia>
   - Buscá "Sepolia faucet" si alguno está caído.
4. Pegá la dirección de tu cuenta y pedí el ETH. Suele llegar en segundos/minutos.
   Con **0.05–0.2 ETH** por cuenta alcanza de sobra para la demo.

> Tip: solo las cuentas que **firman transacciones** (deploy, depositar, aprobar)
> necesitan ETH para el gas. El beneficiario puede no tener gas: solo recibe.

---

## 3. Compilar y desplegar `FamilyVault.sol` en Remix

1. Abrí **Remix IDE**: <https://remix.ethereum.org/>.
2. En el explorador de archivos, creá un archivo `FamilyVault.sol` y pegá el
   contenido de `contract/FamilyVault.sol` de este repo.
3. **Compilar:**
   - Pestaña **Solidity Compiler**.
   - Elegí una versión **0.8.20 o superior** (el pragma es `^0.8.20`).
   - Clic en **Compile FamilyVault.sol**. Debe compilar sin errores.
4. **Desplegar:**
   - Pestaña **Deploy & Run Transactions**.
   - En **Environment**, elegí **"Injected Provider - MetaMask"**. Aceptá la
     conexión. Verificá arriba que dice **Sepolia (11155111)** y la cuenta que
     va a desplegar (será el `admin`).
   - Al lado del botón **Deploy**, abrí el desplegable para cargar los argumentos
     del **constructor**:
     - `_GUARDIANES`: un array con las direcciones, entre corchetes y comillas.
       Ejemplo:
       ```
       ["0xAAA...","0xBBB...","0xCCC...","0xDDD..."]
       ```
     - `_UMBRAL`: el número M de aprobaciones necesarias. Ejemplo: `3` (3 de 4).
   - Clic en **Deploy** (también podés usar el botón naranja **transact**).
     Confirmá la transacción en MetaMask y esperá a que se mine.
5. Aparecerá el contrato desplegado en **"Deployed Contracts"**. Copiá su
   **dirección** (ícono de copiar).

> Nota: **no hay beneficiario fijo** — cuando un reclamo se libera, los fondos van
> a quien lo creó (el solicitante).
>
> Validaciones del constructor (si fallan, revisá los argumentos): debe haber al
> menos un guardián, `1 <= M <= N`, sin direcciones repetidas ni `0x000...0`.
>
> **Multi-familia (opcional):** también podés desplegar `FamilyVaultFactory.sol` y
> llamar a `crearBoveda(guardianes, umbral)` para que cada familia genere su propia
> bóveda desde un único contrato fábrica.

---

## 4. Conectar el frontend: dirección y ABI

1. Abrí **`config.js`** en la raíz del proyecto.
2. Pegá la dirección copiada en:
   ```js
   const CONTRACT_ADDRESS = "0xTuDireccionDesplegada";
   ```
3. **ABI:** el repo ya trae el ABI correcto embebido en `config.js`
   (`CONTRACT_ABI`) y también en `contract/FamilyVault.abi.json`. Si recompilás
   y cambiás la interfaz del contrato, reemplazá ambos:
   - En Remix, pestaña **Solidity Compiler** → botón **ABI** (copia el JSON).
   - Pegalo en `contract/FamilyVault.abi.json` y en el array `CONTRACT_ABI` de
     `config.js`.
4. Guardá. Listo: el frontend ya apunta a tu contrato.

---

## 5. Correr el frontend

**Opción local rápida:** abrí `index.html` con un servidor estático para evitar
restricciones del navegador. Por ejemplo, desde la carpeta del proyecto:

```bash
# Con Python instalado
python3 -m http.server 5500
# luego abrí http://localhost:5500
```

(O usá la extensión **Live Server** de VS Code.)

**Opción pública (Vercel):** ver el README, sección "Desplegar el frontend".

---

## 6. Guion de demo para el video

Objetivo: mostrar el flujo completo y la liberación por consenso, todo visible en
Sepolia. Sugerencia de duración: 3–5 minutos.

1. **Presentación (15s):** "Esta es la Bóveda Familiar: un fondo de emergencia
   que ninguna persona sola puede tocar. Se libera solo cuando M de N integrantes
   firman en la blockchain."
2. **Conectar wallet (Cuenta 1 / admin o guardián):**
   - Clic en **Conectar wallet** → aprobar en MetaMask.
   - Mostrar el badge **Sepolia ✓**, la dirección, el panel del fondo: balance,
     umbral (ej. 3 de 5), beneficiario y la lista de guardianes (tu cuenta
     marcada como "vos").
3. **Depositar fondos:**
   - En "Depositar al fondo", ingresar `0.05` ETH → **Depositar** → confirmar en
     MetaMask. Mostrar el overlay de carga y, al minar, el balance actualizado y
     el evento en "Actividad reciente" (con link a Etherscan).
4. **Reportar emergencia (guardián 1):**
   - En "Reportar emergencia": descripción "Accidente de tránsito - gastos
     médicos", monto `0.05` ETH, y (opcional) pegar un texto de evidencia para
     mostrar cómo se calcula el **hash keccak256** localmente.
   - **Crear reclamo** → confirmar. Mostrar el reclamo nuevo en estado
     **Abierto**, con progreso `0/3`.
5. **Aprobar desde varias cuentas (alcanzar el umbral):**
   - Aprobar con el guardián 1: el progreso pasa a `1/3` y el estado a
     **Pendiente**.
   - **Cambiar de cuenta en MetaMask** a la Cuenta 2 (la app se recarga sola).
     Conectar y **Aprobar** el mismo reclamo → `2/3`.
   - Cambiar a la Cuenta 3 y **Aprobar** → `3/3`. Al alcanzar el umbral, el
     contrato **libera los fondos** automáticamente: el estado pasa a
     **Liberado**, el balance del fondo baja y aparece el evento
     **FondosLiberados** con el monto al beneficiario.
6. **Mostrar la transparencia en Sepolia:**
   - Clic en alguno de los links **"↗ ver tx"** del log para abrir
     **sepolia.etherscan.io** y mostrar la transacción y los eventos en cadena.
   - Opcional: abrir la dirección del contrato en Etherscan y mostrar el historial
     completo de transacciones (depósito, reclamo, aprobaciones, liberación).
7. **Cierre (15s):** "Quedó registrado de forma pública e inviolable. Ninguna
   persona sola pudo mover el dinero: hizo falta el consenso de la familia."

> Para el video, conviene tener las cuentas con ETH de prueba **antes** de grabar
> y haber hecho un ensayo, porque cada transacción tarda unos segundos en minar.

---

## Problemas frecuentes

- **"Red incorrecta":** cambiá MetaMask a Sepolia. La app ofrece el cambio
  automático.
- **El botón Aprobar está deshabilitado:** esa cuenta no es guardián, ya aprobó
  ese reclamo, o el reclamo ya está liberado.
- **"monto > balance" al crear reclamo:** depositá primero fondos suficientes; el
  monto a liberar no puede superar el balance del contrato.
- **La transacción falla por gas:** pedí más ETH de prueba al faucet.
- **No aparece "Injected Provider":** asegurate de tener MetaMask desbloqueado y
  recargá Remix.
