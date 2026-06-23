# Lean Canvas — FamilyVault (Bóveda Familiar)

> El **Lean Canvas** (adaptado por Ash Maurya a partir del Business Model Canvas)
> es una plantilla de una sola página que sintetiza el modelo de negocio de un
> producto en **9 bloques**. A diferencia de un plan de negocios extenso, está
> pensado para iterar rápido y enfocarse en lo más arriesgado: el **problema**,
> las **soluciones** y la **propuesta de valor**. Lo usamos acá para ordenar la
> visión de FamilyVault de cara al jurado del hackathon.

**Contexto del producto.** FamilyVault es una **dApp** (aplicación
descentralizada) en la que una familia crea un **fondo de ahorro de emergencia**
custodiado por un **contrato inteligente** (Solidity) desplegado en la testnet
**Sepolia** de Ethereum. El fondo solo se libera cuando un **mínimo de
integrantes (umbral M de N)** firma/certifica en la cadena que ocurrió una
emergencia. Así **ninguna persona sola** puede usar mal el dinero, y la
liberación queda registrada de forma **transparente e inviolable**. El stack es
**Solidity + frontend HTML/CSS/JS vanilla con ethers.js v6 + MetaMask + Sepolia,
sin backend**. El producto **no tiene funcionalidad de IA**: la IA se usó
únicamente como herramienta para programar.

> Nota sobre los números: este es un proyecto educativo en testnet. Todas las
> magnitudes (TVL, cantidad de bóvedas, usuarios, etc.) son **estimaciones u
> objetivos**, nunca datos reales presentados como tales.

---

## Tabla resumen

| # | Bloque | Síntesis |
|---|--------|----------|
| 1 | **Problema** | No existe una forma confiable de guardar un fondo familiar que una sola persona no pueda vaciar y que se libere solo por acuerdo del grupo. |
| 2 | **Segmentos de clientes** | Familias separadas geográficamente / migrantes; hogares con cultura cripto. Extensible a cooperativas y grupos de ayuda mutua. |
| 3 | **Propuesta de valor única** | Un fondo de emergencia que nadie solo puede tocar y que se libera únicamente cuando la familia lo certifica en conjunto, con total transparencia. |
| 4 | **Solución** | Contrato inteligente multifirma (umbral M de N) que custodia y libera por consenso, con eventos públicos y una máquina de estados del reclamo. Incluye recuperación social de guardianes y una **fábrica multi-familia** (escala sin base de datos central: la blockchain es la base de datos). |
| 5 | **Canales** | Comunidades cripto, universidades, boca a boca, redes sociales y código abierto en GitHub. |
| 6 | **Fuentes de ingresos** | Proyecto open source: donaciones, fee opcional muy bajo, servicios premium de recuperación, versión empresarial. El MVP **no monetiza**. |
| 7 | **Estructura de costos** | Gas (lo paga quien firma cada transacción), hosting estático gratuito, desarrollo y auditoría futura. |
| 8 | **Métricas clave** | TVL custodiado, bóvedas creadas, reclamos liberados correctamente, tiempo a umbral, guardianes activos, retención. |
| 9 | **Ventaja diferencial (injusta)** | Confianza intrínseca del modelo no-custodial, verificable en cadena, sin control unipersonal, más el efecto de red familiar. |

---

## 1. Problema

Las familias **no tienen una forma confiable** de guardar un fondo de emergencia
que cumpla dos condiciones a la vez: (a) que **ninguna persona sola** pueda usarlo
mal, y (b) que **se libere únicamente cuando el grupo acuerda** que hay una
emergencia real.

- **Riesgo de mal uso individual.** Cuando el dinero está bajo el control de una
  sola persona, esa persona puede gastarlo sin consenso, por necesidad propia,
  presión o conflicto. No hay un mecanismo que obligue al acuerdo del grupo.
- **Falta de transparencia.** Los demás integrantes no tienen forma de auditar en
  tiempo real cuánto hay, quién aprobó qué y cuándo se movió el dinero.
- **Distancia y desconfianza.** En familias separadas geográficamente o migrantes,
  coordinar y confiar en quién "guarda la plata" es difícil y genera fricción.

### Alternativas existentes y sus fallas

1. **Cuenta bancaria compartida (titular o cotitular único).** En la práctica,
   **cualquiera de los titulares puede vaciarla** sin permiso del resto. La
   "firma conjunta" real es rara, burocrática y depende del banco; no hay un
   umbral M de N configurable ni registro inviolable.
2. **Efectivo guardado en casa.** **Inseguro** (robo, pérdida, incendio),
   **no auditable** y físicamente accesible para quien viva ahí. Tampoco resiste
   inflación ni permite participación de integrantes a distancia.
3. **Custodio de confianza único** (un familiar "responsable", un escribano, un
   amigo). Crea un **único punto de falla**: si esa persona falla, se enferma,
   desaparece o actúa de mala fe, el fondo queda comprometido. La confianza es
   personal y no verificable.

---

## 2. Segmentos de clientes

- **Familias separadas geográficamente / migrantes.** Integrantes en distintas
  ciudades o países que quieren un fondo común para emergencias (salud, viajes
  urgentes, repatriación) y necesitan coordinar sin que nadie controle solo el
  dinero. Es el segmento donde el dolor es más agudo.
- **Hogares con cultura cripto.** Familias o convivientes ya familiarizados con
  MetaMask y wallets, que entienden el valor de lo no-custodial y prefieren no
  depender de un banco.
- **Cooperativas y grupos de ayuda mutua (extensión).** Cajas de ayuda,
  comisiones barriales, clubes y mutuales pequeñas que necesitan un fondo común
  liberado por consenso de varios firmantes.

### Early adopters

- **Estudiantes y entusiastas Web3** con conocimientos técnicos, dispuestos a
  operar en testnet y tolerar fricción a cambio de probar el concepto.
- **Familias "tech" con un miembro cripto-nativo** que oficia de guía para el
  resto y configura la bóveda.
- **Grupos chicos y muy cohesionados** (3 a 7 personas) donde el umbral M de N es
  fácil de razonar y mantener.

---

## 3. Propuesta de valor única

> **Un fondo de emergencia que nadie puede tocar solo, y que se libera únicamente
> cuando la familia lo certifica en conjunto, con total transparencia.**

- **Custodia sin custodio.** El dinero lo guarda el **contrato**, no una persona;
  nadie puede retirarlo unilateralmente.
- **Liberación por consenso.** Se necesita un **umbral M de N** de firmas de los
  guardianes para liberar los fondos al beneficiario.
- **Transparencia total e inviolable.** Cada aprobación y cada liberación queda
  registrada como **evento público** en la cadena; cualquier integrante puede
  auditar el estado en cualquier momento.

### Concepto de alto nivel (analogía)

**"Una caja fuerte familiar con varias llaves: la puerta solo abre cuando un
mínimo de integrantes giran su llave al mismo tiempo"** — pero digital, sin banco
y verificable por todos.

---

## 4. Solución

Un **contrato inteligente multifirma** que **custodia y libera por consenso
(M de N)**, modelado como una máquina de estados del reclamo.

- **Custodia no-custodial.** El contrato `FamilyVault.sol` recibe y retiene el
  ETH del fondo; no hay administrador con poder de retiro unilateral.
- **Guardianes y umbral.** Al desplegar la bóveda se definen los **N guardianes**
  (direcciones) y el **umbral M** mínimo de aprobaciones requeridas.
- **Ciclo de vida del reclamo (máquina de estados).** Un pedido de liberación
  recorre los estados `Abierto → Pendiente → Aprobado → Liberado`; al alcanzar el
  umbral, la misma transacción transfiere los fondos de forma atómica
  (checks-effects-interactions). Ver `docs/diagrama-estados.md`.
- **Eventos públicos.** Cada `crearReclamo` y cada `aprobar` emite eventos
  on-chain que el frontend lee con **ethers.js v6**, dando trazabilidad completa.
- **Protecciones.** El contrato revierte transiciones inválidas: doble aprobación
  del mismo guardián, aprobación de un reclamo ya liberado y operaciones de
  no-guardianes (`modifier soloGuardian`).
- **Frontend simple y sin backend.** HTML/CSS/JS vanilla + MetaMask; cada usuario
  firma con su propia wallet, sin servidor que custodie claves ni datos.

---

## 5. Canales

- **Comunidades cripto.** Grupos de Discord/Telegram, foros de Ethereum y
  comunidades Web3 en español, donde el público ya entiende wallets y testnets.
- **Universidades y hackathons.** Presentaciones a jurados, ferias de proyectos y
  cátedras de sistemas distribuidos / blockchain; punto de partida natural del
  proyecto.
- **Boca a boca familiar.** El propio modelo es viral dentro del grupo: para usar
  la bóveda, cada guardián debe sumarse (efecto de invitación).
- **Redes sociales.** Demos cortas en video mostrando "crear bóveda → reclamar →
  firmar → liberar", para explicar el concepto de forma visual.
- **Código abierto en GitHub.** Repo público con README, contrato verificado en
  Etherscan (Sepolia) y guía de despliegue: atrae desarrolladores y genera
  confianza por inspección del código.

---

## 6. Fuentes de ingresos / sostenibilidad

Al ser un **proyecto educativo y open source**, el **MVP no monetiza**: el
objetivo es validar el concepto y el modelo de confianza, no facturar. A futuro,
se plantean modelos posibles (hipótesis a validar, no compromisos):

- **Donaciones.** Aportes voluntarios de la comunidad y patrocinios para sostener
  el desarrollo y eventuales auditorías.
- **Fee opcional muy bajo sobre la liberación.** Una comisión mínima y
  **transparente** sobre el monto liberado, configurable y **desactivable**, que
  no rompa la propuesta no-custodial.
- **Servicios premium de recuperación social.** Asistencia para rotar guardianes
  perdidos o recuperar el acceso ante pérdida de claves (social recovery),
  ofrecida como servicio opcional.
- **Versión empresarial para cooperativas / mutuales.** Funcionalidades extra
  (paneles, reportería, soporte, integraciones) para organizaciones que manejan
  fondos comunes más grandes.

> Honestidad ante el jurado: hoy esto es un MVP en testnet sin ingresos reales;
> los modelos anteriores son caminos a explorar, no flujos de caja existentes.

---

## 7. Estructura de costos

- **Gas (transacciones on-chain).** Lo paga **quien firma cada transacción**:
  el que despliega la bóveda, el que crea un reclamo y cada guardián que aprueba.
  No hay costo centralizado de operación. En Sepolia el gas es de testnet (ETH
  sin valor real).
- **Hosting estático.** El frontend es estático y se publica en plataformas
  gratuitas (por ejemplo **Vercel** en su plan free), por lo que el costo de
  hosting tiende a **cero**.
- **Desarrollo.** El costo principal es el **tiempo del equipo** (diseño del
  contrato, frontend, pruebas). En el contexto del hackathon es trabajo del grupo.
- **Auditoría de seguridad (futura).** Si el proyecto pasara a mainnet con fondos
  reales, una **auditoría profesional del contrato** sería el costo más relevante
  y necesario, dado que custodia dinero.

---

## 8. Métricas clave

- **Fondos custodiados (TVL).** Total de ETH bajo custodia en las bóvedas activas
  (objetivo de crecimiento; en testnet es valor simbólico).
- **Cantidad de bóvedas creadas.** Número de contratos/bóvedas desplegadas por
  usuarios distintos.
- **Reclamos liberados correctamente.** Reclamos que alcanzaron el umbral M y
  liberaron fondos sin incidentes: mide que el flujo central funciona.
- **Tiempo promedio hasta alcanzar el umbral.** Cuánto tarda un reclamo en juntar
  las M firmas; indica la fricción de coordinación entre guardianes.
- **Guardianes activos.** Direcciones que efectivamente firman/aprueban,
  no solo las registradas.
- **Retención.** Familias que siguen usando su bóveda en el tiempo (fondos que
  permanecen, nuevas bóvedas creadas por el mismo grupo o por referidos).

> Todas las cifras son **objetivos o estimaciones** para un proyecto en etapa de
> prototipo; no se presentan números inventados como resultados reales.

---

## 9. Ventaja diferencial (injusta)

Lo que **no se puede copiar fácilmente** no es una feature, sino el **modelo de
confianza** que está en la base de FamilyVault:

- **Confianza intrínseca y no-custodial.** Los fondos los guarda el código, no una
  empresa ni una persona; **ningún actor único controla el dinero**. Esto es
  estructural, no un agregado de marketing.
- **Verificable en cadena y de código abierto.** Cualquiera puede leer el contrato
  en Etherscan y el código en GitHub y comprobar que hace exactamente lo que dice.
  La confianza se basa en **verificación**, no en promesas.
- **Sin punto único de falla.** El umbral M de N elimina al "custodio único":
  ni un robo de una sola clave ni una sola persona malintencionada pueden vaciar
  el fondo.
- **Efecto de red familiar.** Una vez que una familia configura su bóveda y suma a
  sus guardianes, el costo de migrar y la cohesión del grupo generan permanencia;
  cada nuevo integrante refuerza la red y dificulta el cambio a alternativas
  centralizadas.

---

*Documento elaborado para el hackathon universitario. FamilyVault es un prototipo
educativo desplegado en la testnet Sepolia; no maneja fondos reales ni constituye
asesoramiento financiero.*
