# Memoria técnica — Bóveda Familiar (FamilyVault)

**Hackathon de Teoría de la Computación II**
Proyecto: dApp de fondo de emergencia familiar multifirma sobre Ethereum (Sepolia).

> Documento de 4–6 páginas con las 9 secciones exigidas por el PDF del hackathon.

---

## 1. Problema y oportunidad

### El problema
Las familias necesitan guardar un **fondo de emergencia** —dinero reservado para
imprevistos graves como un accidente, una enfermedad o la pérdida de un trabajo—
pero hoy no tienen una forma confiable de hacerlo cuando el fondo es **colectivo**.
El núcleo del problema es doble:

1. **Riesgo de mal uso por una sola persona.** Si el dinero está en manos de un
   único integrante (o en una cuenta donde una sola firma alcanza), esa persona
   puede gastarlo, perderlo o desviarlo, con o sin mala intención.
2. **Falta de un mecanismo de acuerdo.** No existe una manera simple y a prueba de
   manipulación de que la familia **acuerde en conjunto** que ocurrió la
   emergencia y recién entonces se libere el dinero.

### Usuarios afectados y magnitud
Afecta a prácticamente cualquier hogar, pero el dolor es más fuerte en:

- **Familias separadas geográficamente / migrantes.** Es un fenómeno masivo: el
  Banco Mundial estima cientos de miles de millones de dólares anuales en remesas
  hacia países en desarrollo, lo que evidencia cuánta gente sostiene
  económicamente a su familia a distancia. Coordinar un fondo común a distancia,
  sin que dependa de la confianza ciega en una persona, es justamente lo difícil.
- **Hogares sin acceso a instrumentos financieros adecuados.** Las cuentas
  bancarias conjuntas suelen permitir que **cualquier titular** retire la
  totalidad, y no ofrecen reglas de "se libera solo si N personas están de
  acuerdo".

### Evidencia y comparación con alternativas
| Alternativa | Cómo falla |
|-------------|------------|
| **Cuenta bancaria compartida** | En la mayoría, cada titular puede vaciarla solo. No hay regla de consenso ni traza inviolable de "por qué se sacó la plata". |
| **Efectivo en casa / "el sobre"** | Inseguro (robo, pérdida, inflación), opaco, y de nuevo dependiente de quien lo guarda. |
| **Custodio de confianza único** (un familiar "responsable") | Punto único de falla: si esa persona se equivoca, abusa, fallece o se pelea con el resto, el fondo queda comprometido. |

La **oportunidad** es usar una tecnología que permita reglas de liberación
**condicionales, automáticas y verificables por todos**, sin depender de un
custodio único ni de un banco: exactamente lo que ofrece un contrato inteligente.

---

## 2. Solución propuesta

### Qué construimos
**FamilyVault** es una **dApp** (aplicación descentralizada) compuesta por:

- Un **contrato inteligente** (`FamilyVault.sol`) que **custodia** el fondo en la
  blockchain y solo lo **libera por consenso multifirma (M de N)**.
- Un **frontend web** que cualquier integrante usa con su wallet **MetaMask** para
  depositar, reportar emergencias, aprobar y ver el estado del fondo en vivo.

### Funcionamiento general
La familia despliega el contrato definiendo dos cosas: el conjunto de
**guardianes** (las direcciones de los integrantes, el "N") y el **umbral M** de
aprobaciones necesarias. No hay beneficiario fijo: los fondos van a **quien crea el
reclamo**. A partir de ahí:

1. Cualquiera **deposita** ETH al fondo.
2. Un guardián **crea un reclamo** describiendo la emergencia (con hash de
   evidencia opcional) y el monto a liberar.
3. Los guardianes **aprueban**. Cada aprobación es una firma criptográfica con su
   clave privada.
4. Al alcanzar **M aprobaciones**, el contrato **transfiere automáticamente** los
   fondos **al solicitante** y lo registra públicamente.

### Características
- **No-custodial:** nadie externo —ni siquiera nosotros— controla el dinero.
- **Multifirma M de N:** ninguna persona sola ni una minoría puede liberar fondos.
- **Transparente e inviolable:** cada acción emite un **evento** auditable en la
  cadena (verificable en Etherscan).
- **Máquina de estados explícita:** cada reclamo tiene un ciclo de vida formal
  (Abierto → Pendiente → Aprobado → Liberado).

### Diferencias con las alternativas
A diferencia de una cuenta compartida, **se requiere acuerdo de varios** para
mover el dinero; a diferencia del efectivo, es **seguro y trazable**; y a
diferencia de un custodio único, **no hay punto único de falla ni de confianza**.

---

## 3. MVP desarrollado

### Alcance real (lo que funciona hoy)
El MVP está **funcional de punta a punta sobre la testnet Sepolia**:

- ✅ **Depósito** de ETH al fondo (`depositar()` / `receive()`), con evento.
- ✅ **Creación de reclamos** por guardianes (`crearReclamo`), con descripción,
  hash de evidencia opcional y monto.
- ✅ **Aprobación** por guardianes (`aprobar`), con **anti doble-aprobación** y
  control de acceso.
- ✅ **Liberación automática** de fondos **al solicitante** del reclamo al alcanzar
  el umbral, con patrón **checks-effects-interactions** (no hay beneficiario fijo).
- ✅ **Cancelación** de reclamos (`cancelarReclamo`) por el solicitante o el admin,
  con un estado `Cancelado` que enriquece la máquina de estados.
- ✅ **Meta de ahorro** del fondo (`fijarMeta`) con barra de progreso.
- ✅ **Recuperación social de guardianes** (`proponerRotacion`/`aprobarRotacion`):
  reemplazar por consenso a un guardián que perdió su clave (segunda máquina de estados).
- ✅ **Fábrica multi-familia** (`FamilyVaultFactory`): cualquier familia crea su
  propia bóveda con un llamado — habilita el uso masivo sin base de datos central.
- ✅ **Frontend completo (SaaS):** conexión MetaMask, detección de red, dashboard con
  métricas, depósito, reporte de emergencia con hash en el navegador, lista de reclamos
  filtrable, cancelar, meta, aportes por integrante, recuperación de guardianes,
  notificaciones (toasts) y confeti al liberar, tema claro/oscuro y manejo de errores.
- ✅ **Historial on-chain** que persiste al recargar (lee eventos pasados) + estadísticas.
- ✅ **Tests (Hardhat): 27 pruebas**, incluido un **test de reentrancy** con contrato atacante.

### Qué quedó fuera (futuro)
- Uso de una **stablecoin** (USDC/DAI) en lugar de ETH para evitar volatilidad.
- **Reglas de liberación más finas** (montos parciales, límites por período).
- **Rampas a moneda fiat** y **soporte multi-red**.
- **App móvil** y **notificaciones push** a los guardianes cuando se abre un reclamo.
- **Indexador (The Graph)** para búsquedas eficientes a gran escala.

Estas funcionalidades están detalladas como roadmap; el MVP ya cubre el flujo central
de custodia y liberación por consenso, más recuperación social y multi-familia.

---

## 4. Componentes tecnológicos

### Tecnologías, arquitectura y herramientas
**Arquitectura (dApp pura, sin backend):**

```
   Navegador (MetaMask)                  Blockchain (Sepolia)
 ┌───────────────────────┐   ethers.js   ┌────────────────────────┐
 │  index.html / app.js  │ ───────────►  │   FamilyVault.sol       │
 │  (HTML/CSS/JS vanilla) │ ◄───────────  │  (estado + fondos +     │
 │   firma con MetaMask   │   eventos     │   eventos públicos)     │
 └───────────────────────┘               └────────────────────────┘
```

- **Solidity (`^0.8.20`):** lenguaje del contrato. Su sistema de tipos y el
  *overflow checking* nativo de la 0.8 aportan seguridad.
- **ethers.js v6:** librería JavaScript para hablar con la cadena desde el
  navegador (lecturas, envío de transacciones, escucha de eventos). Se importa
  desde CDN (build UMD). Se respetó la API de v6 (`BrowserProvider`, `getSigner`
  asíncrono, `parseEther`/`formatEther`, `keccak256`), distinta de la v5.
- **MetaMask:** wallet que custodia las claves y **firma** cada transacción. La app
  se conecta vía `window.ethereum`.
- **Sepolia:** testnet de Ethereum para desplegar y probar sin dinero real.
- **Frontend estático + Vercel:** sin servidor propio; se puede hostear gratis y
  obtener una URL pública.

No hay API keys ni secretos: todo lo que va a la cadena es **público**, por lo que
no hay nada que ocultar en el frontend.

### Inteligencia Artificial (como herramienta de desarrollo)
**El producto NO incorpora ninguna funcionalidad de IA.** La IA se usó como
**herramienta de desarrollo** del equipo:

- **Qué modelo:** asistente **Claude** de Anthropic, mediante **Claude Code** (su
  interfaz de agente en la terminal/CLI), que puede leer y escribir archivos del
  proyecto y razonar sobre el código.
- **Por qué se eligió:** capacidad para generar contratos en Solidity aplicando
  **patrones de seguridad reconocidos** (checks-effects-interactions, control de
  acceso, validaciones de estado), explicar las decisiones y producir
  documentación extensa y coherente en español, todo de forma iterativa.
- **Qué valor aportó al proceso:**
  - **Velocidad:** andamiaje del contrato, el frontend y la documentación en poco
    tiempo, dejando al equipo concentrarse en el diseño y la demo.
  - **Patrones de seguridad:** sugerencia y explicación de defensas
    (anti-reentrancy, anti doble-voto) que refuerzan el código.
  - **Generación de código y docs:** ABI, guía de despliegue, memoria, pitch y el
    diagrama de estados.
  - **Aprendizaje:** sirvió como tutor para entender decisiones (p. ej. por qué el
    orden effects-before-interactions evita reentrancy).

Aclaración explícita: la IA **no participa en tiempo de ejecución** del producto;
una vez desplegado, FamilyVault es 100% determinista (contrato + frontend).

### Blockchain
- **Cómo se usó:** la blockchain **custodia los fondos** (el ETH queda en el
  contrato, no en una persona) y ejecuta la **liberación condicional multifirma**:
  el código —no un intermediario— garantiza que el dinero solo sale si se reúnen M
  firmas de guardianes.
- **Qué problema resuelve:** la **liberación condicional sin confiar en un único
  custodio**. Las reglas son públicas, inmutables y se cumplen automáticamente;
  nadie puede "saltearlas".
- **Evidencia de funcionamiento:** contrato **desplegado en Sepolia** con
  **historial público de transacciones** (depósitos, reclamos, aprobaciones y
  liberación) verificable en `sepolia.etherscan.io`. La demo en video muestra el
  ciclo completo. *(Completar con la dirección del contrato y los links de las
  transacciones.)*

### Integración con la materia (líneas temáticas de Teoría de la Computación II)
Identificamos **cinco** ejes y dónde se aplican concretamente:

1. **Autómatas / máquinas de estado.** El **ciclo de vida del reclamo** es un
   autómata finito determinista: estados `{Abierto, Pendiente, Aprobado,
   Liberado}`, alfabeto de eventos (aprobaciones por debajo / que alcanzan el
   umbral) y función de transición. Las guardas `require` rechazan las
   transiciones inválidas, igual que un AFD no acepta símbolos fuera de su
   función de transición. (Ver `docs/diagrama-estados.md`.)
2. **Blockchain.** Modelo de cómputo distribuido y replicado; ejecución
   determinista del contrato en la EVM.
3. **Seguridad informática.** Control de acceso (`soloGuardian`/`soloAdmin`),
   **prevención de reentrancy** (checks-effects-interactions + candado),
   validaciones de estado (anti doble-aprobación, anti doble-liberación).
4. **Criptografía / firmas digitales.** Cada **aprobación es una firma digital**
   con la clave privada del guardián; la red verifica la autoría. La identidad
   (dirección) deriva de criptografía de curva elíptica; la evidencia se referencia
   por su **hash keccak256**.
5. **Lenguajes de programación y sistemas de tipos.** **Solidity** como lenguaje
   tipado estáticamente; `enum`, `struct`, `mapping`, modificadores y el chequeo de
   *overflow* de la 0.8 son herramientas de tipos al servicio de la corrección.

---

## 5. Innovación e impacto

### Aspectos innovadores y originalidad
- Aplica el patrón **multifirma** (conocido en finanzas cripto, p. ej. Gnosis
  Safe) a un caso **doméstico y social**: el fondo de emergencia familiar, con un
  lenguaje y una UX pensados para una familia, no para tesorerías de empresas.
- Modela explícitamente el reclamo como **máquina de estados**, lo que hace el
  comportamiento **auditable y fácil de razonar** (y conecta con la teoría).
- Usa la **atestación social** (los familiares como "oráculo" humano de confianza)
  como solución pragmática al hecho de que la blockchain no puede verificar sola si
  pasó una emergencia.

### Ventajas
- **Protección real:** ninguna persona sola puede tocar los fondos.
- **Transparencia total:** todo queda registrado e inviolable.
- **Sin intermediarios ni costos de un custodio.**

### Impacto social y económico
- Ayuda a **familias separadas** a sostener un fondo común con reglas justas.
- Reduce conflictos: el "por qué se usó la plata" queda documentado y consensuado.
- Promueve **inclusión financiera** con herramientas que no dependen de un banco.

### Métricas posibles
TVL (fondos custodiados), cantidad de bóvedas creadas, reclamos liberados
correctamente, tiempo promedio hasta alcanzar el umbral, guardianes activos,
retención. *(Son objetivos/estimaciones, no datos reales del MVP.)*

---

## 6. Viabilidad y sustentabilidad

### Factibilidad técnica
**Ya demostrada:** el contrato compila y funciona en Sepolia, y el frontend cubre
el flujo completo. El stack (Solidity, ethers.js, MetaMask) es estándar y maduro.

### Factibilidad económica (costos de gas, quién paga)
- En **testnet** el gas se paga con ETH de prueba gratuito (faucets).
- En **mainnet**, cada acción (depósito, reclamo, aprobación, liberación) cuesta
  gas, que paga **quien firma esa transacción**. Son operaciones simples y de costo
  acotado. El **hosting** del frontend es gratuito (Vercel) y no hay costos de
  servidor porque no hay backend.

### Factibilidad operativa
La familia se autogestiona: define guardianes y umbral al desplegar. La UX guía el
flujo. No requiere infraestructura ni personal.

### Recursos, aliados y crecimiento
- **Recursos:** equipo de desarrollo; a futuro, una **auditoría de seguridad**.
- **Aliados posibles:** comunidades cripto, ONG de migrantes, cooperativas,
  cátedras universitarias.
- **Crecimiento:** open source en GitHub, plantillas de despliegue, y las features
  del roadmap (stablecoins, recuperación social, app móvil).

### Dos preguntas que el jurado seguramente hará

**(a) Volatilidad del ETH.** Un fondo de emergencia en ETH es **volátil**: su
valor en moneda local puede caer justo cuando se necesita. **Mitigación:** usar una
**stablecoin** como **USDC** o **DAI** (ancladas al dólar) para los ahorros. El
diseño multifirma es idéntico; solo cambia el activo custodiado (de ETH nativo a un
token ERC-20). Está en el roadmap como mejora prioritaria.

**(b) Manejo de claves.** ¿Qué pasa si un guardián **pierde su clave privada**? Sin
mitigación, ese guardián ya no podría aprobar; si se pierden tantas claves que es
imposible reunir M, el fondo podría quedar **bloqueado**. **Mitigaciones:**
(i) elegir el umbral con **margen** (p. ej. 3 de 5 tolera perder hasta 2 claves);
(ii) **recuperación/rotación de guardianes** (*social recovery*): una función,
gobernada por el propio consenso M de N, que permita **reemplazar** la dirección de
un guardián comprometido o perdido por una nueva. Es la siguiente función de
seguridad a implementar.

---

## 7. Trabajo en equipo

### Roles (plantilla para completar)
| Integrante | Rol principal | Responsabilidades |
|------------|---------------|-------------------|
| `[Nombre]` | Contrato / Solidity | Diseño del contrato, máquina de estados, seguridad, despliegue en Sepolia |
| `[Nombre]` | Frontend / dApp | UI, integración ethers.js + MetaMask, manejo de eventos y errores |
| `[Nombre]` | Documentación / Pitch | Memoria, lean canvas, pitch deck, guion y grabación de la demo |
| `[Nombre]` | QA / Coordinación | Pruebas del flujo, gestión del backlog, integración |

### Organización y metodología
- **Metodología ágil** con iteraciones cortas: primero lograr el flujo de punta a
  punta, después pulir.
- **Backlog priorizado** (ver abajo) y reuniones breves de sincronización.
- **Control de versiones con Git/GitHub**; ramas por funcionalidad e integración
  continua manual (revisión antes de mergear).

### Backlog (ejemplo)
1. Contrato como máquina de estados + seguridad + eventos. ✅
2. Frontend con flujo completo (conexión, depósito, reclamo, aprobación). ✅
3. Guía de despliegue (Remix/Sepolia) y guion de demo. ✅
4. Documentación (README, memoria, lean canvas, pitch, diagrama). ✅
5. (Opcional) Tests de Hardhat. ⏳
6. Despliegue en Sepolia + grabación del video. ⏳

---

## 8. Aprendizajes y propuestas descartadas

### El "problema del oráculo"
Una blockchain **no puede verificar por sí sola** si en el mundo real ocurrió un
accidente o una emergencia: solo conoce los datos que están en la cadena. Por eso
**descartamos la idea de una verificación automática** del evento (no hay forma
confiable y barata de que el contrato "sepa" que hubo un accidente). En su lugar
adoptamos un modelo de **atestación social**: los **familiares actúan como oráculo
humano de confianza**, y el **umbral M de N** evita el fraude de una sola persona
(no alcanza con que uno mienta; hace falta el acuerdo de varios). Es una decisión
de diseño consciente: cambiamos verificación automática (inviable) por **consenso
humano verificable y resistente al fraude individual**.

### El modelo de seguridad multifirma (qué garantiza y qué no)
Aprendimos a ser precisos sobre el alcance de la seguridad: **ningún esquema
multifirma evita que una mayoría se confabule.** Si M guardianes se ponen de
acuerdo para actuar de mala fe, pueden liberar los fondos —eso es inherente a
cualquier esquema de umbral—. Lo que el sistema **sí garantiza** es que **ninguna
persona sola ni una minoría** pueda tocar el fondo. Para una familia, esa es la
protección real y suficiente: convierte un "cualquiera puede vaciar la cuenta" en
un "hace falta que la familia se ponga de acuerdo".

### Aprendizajes de seguridad y por qué no alcanza una app común
- **Reentrancy:** entendimos por qué transferir ETH es riesgoso si el estado no se
  actualiza antes. Aplicamos **checks-effects-interactions** (marcar `Liberado`
  antes de transferir) y un candado anti-reentrancy como defensa extra. Una
  aproximación ingenua (transferir y después actualizar) habría sido vulnerable.
  **Evidencia:** escribimos un contrato atacante (`AtacanteReentrancy`) que intenta
  reentrar al recibir los fondos; el test de Hardhat demuestra que **no logra drenar
  ETH de más** y el reclamo no se libera dos veces.
- **Por qué no basta una app/base de datos común:** una app tradicional con su
  base de datos **tiene un administrador** que, en última instancia, **controla los
  fondos** y puede modificar registros. Eso reintroduce exactamente el problema que
  queremos evitar: un **custodio único**. La blockchain es necesaria porque permite
  que **ningún custodio único** controle el dinero y que las reglas se cumplan de
  forma **verificable e inmutable** por todos.
- **"¿No debería haber una base de datos para uso masivo?"** No: **la blockchain ES
  la base de datos** (compartida, replicada e inviolable). El uso masivo se resuelve
  sin una DB central con: (a) un **contrato Factory** (`FamilyVaultFactory`) que crea
  una bóveda independiente por familia —ya implementado—; (b) un **indexador** como
  *The Graph* para lecturas veloces (caché de solo lectura, no controla fondos); y
  (c) los **proveedores RPC** para escalar la carga de lectura. Los datos *no críticos*
  (nombres, notificaciones) pueden ir off-chain como comodidad, nunca como autoridad.

### Propuestas descartadas (resumen)
- Verificación automática de la emergencia (oráculo técnico): inviable/costosa →
  reemplazada por atestación social.
- Backend con base de datos para "ayudar": reintroduce custodio único → descartado
  en favor de dApp pura.

---

## 9. Fuentes y referencias

- **Ethereum** — documentación oficial para desarrolladores: <https://ethereum.org/developers/docs/>
- **Solidity** — documentación del lenguaje: <https://docs.soliditylang.org/>
- **ethers.js v6** — documentación: <https://docs.ethers.org/v6/>
- **MetaMask** — documentación de desarrollo: <https://docs.metamask.io/>
- **Remix IDE** — entorno de compilación/despliegue: <https://remix.ethereum.org/>
- **OpenZeppelin** — guías y contratos de referencia sobre seguridad
  (control de acceso, reentrancy): <https://docs.openzeppelin.com/contracts/>
- **Patrón Checks-Effects-Interactions / reentrancy** — Solidity Security
  Considerations: <https://docs.soliditylang.org/en/latest/security-considerations.html>
- **Gnosis Safe (Safe)** — antecedente de billeteras multifirma: <https://safe.global/>
- **Sepolia** — testnet y explorador: <https://sepolia.etherscan.io/>
- **Banco Mundial** — datos sobre remesas (magnitud del fenómeno migrante):
  <https://www.worldbank.org/en/topic/migrationremittancesdiasporaissues>

> Nota: las referencias se citan como documentación de respaldo de las decisiones
> técnicas; las URLs deben verificarse al momento de la entrega.
