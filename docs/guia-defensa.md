# Guía de defensa — Bóveda Familiar (FamilyVault)

> Resumen para preparar la presentación oral y responder al jurado con seguridad.
> No hace falta memorizar: lo importante es **entender** cada punto para poder
> explicarlo con tus palabras.

---

## 1. El "elevator pitch" (30 segundos)

> "FamilyVault es una bóveda de emergencia familiar: una familia guarda un fondo
> en un contrato inteligente, y ese dinero **solo se libera cuando un mínimo de
> integrantes (por ejemplo 3 de 5) firma en la blockchain que ocurrió una
> emergencia**. Así, ninguna persona sola puede usar mal la plata, y cada
> liberación queda registrada de forma pública e inviolable. Está hecho con un
> contrato en Solidity sobre la testnet Sepolia y una web que se conecta con
> MetaMask."

Si tenés que decir UNA sola frase: **"Un fondo de emergencia que nadie solo puede
tocar y que se libera únicamente cuando la familia lo acuerda en la cadena."**

---

## 2. Las 3 ideas que tenés que dejar clarísimas

1. **El problema:** una cuenta compartida la puede vaciar una sola persona; el
   efectivo es inseguro; un custodio único es un punto de falla. Falta una forma
   donde **haga falta el acuerdo de varios** para mover el dinero.
2. **La solución:** un contrato **multifirma M de N** que custodia los fondos y
   los libera **por consenso**, con todo registrado públicamente.
3. **La conexión con la materia:** cada reclamo es una **máquina de estados
   finita** (`Abierto → Pendiente → Aprobado → Liberado`), que es un autómata
   finito (tema central de Teoría de la Computación II).

---

## 3. Cómo funciona (el flujo, para la demo)

1. **Despliegue:** se define quiénes son los guardianes, el umbral M y el
   beneficiario.
2. **Depositar:** cualquiera suma ETH al fondo.
3. **Reportar emergencia:** un guardián crea un *reclamo* (descripción + monto +
   hash de evidencia opcional). Queda en estado **Abierto**.
4. **Aprobar:** los guardianes aprueban. Cada aprobación es una **firma con su
   clave privada**. El estado pasa a **Pendiente**.
5. **Liberación:** al llegar al umbral M, el contrato pasa a **Aprobado** y
   **transfiere automáticamente** los fondos al beneficiario (**Liberado**).

---

## 4. Preguntas típicas del jurado (y cómo responderlas)

### "¿Por qué blockchain y no una app común con base de datos?"
Porque una app tradicional tiene un **administrador** que, en el fondo, controla
los datos y el dinero: eso reintroduce el problema del **custodio único**. La
blockchain permite que **ningún custodio único** controle los fondos y que las
reglas se cumplan de forma **verificable e inmutable** por todos. Nadie —ni
siquiera nosotros— puede saltarse el contrato.

### "¿Qué pasa si la mayoría de los guardianes se ponen de acuerdo para robar?"
Es una limitación inherente a **cualquier** esquema multifirma: si M personas se
confabulan, pueden liberar fondos. Lo que el sistema **sí garantiza** es que
**ninguna persona sola ni una minoría** pueda tocar el dinero. Para una familia,
esa es la protección real: pasamos de "cualquiera puede vaciar la cuenta" a "hace
falta que la familia se ponga de acuerdo".

### "La blockchain no sabe si pasó un accidente de verdad. ¿Cómo lo resuelven?"
Es el **problema del oráculo**: la cadena no puede verificar hechos del mundo
real. Por eso **descartamos la verificación automática** (no es confiable ni
barata) y usamos **atestación social**: los familiares actúan como oráculo humano
de confianza, y el **umbral M de N** evita el fraude de uno solo (no alcanza con
que una persona mienta).

### "¿Cómo evitan que les roben los fondos por un bug (reentrancy)?"
Aplicamos el patrón **checks-effects-interactions**: en la función `aprobar`,
**marcamos el reclamo como `Liberado` ANTES de transferir el ETH**. Así, si el
receptor intentara "reentrar" (volver a llamar al contrato durante la
transferencia), el reclamo ya estaría liberado y la validación lo rechazaría.
Además sumamos un candado `noReentrante` como defensa extra.

### "¿Dónde está la criptografía / las firmas digitales?"
Cada **aprobación es una firma digital**: el guardián firma la transacción con su
**clave privada** y la red verifica que efectivamente fue él. La identidad (la
dirección `0x...`) deriva de criptografía de curva elíptica. La evidencia se
referencia por su **hash keccak256**, sin subir el documento a la cadena.

### "¿Y la volatilidad? El ETH sube y baja."
Cierto, un fondo en ETH es volátil. La **mitigación** (en el roadmap) es usar una
**stablecoin** como USDC o DAI, ancladas al dólar. El diseño multifirma es
idéntico; solo cambia el activo custodiado.

### "¿Qué pasa si un guardián pierde su clave privada?"
Si se pierden tantas claves que no se puede reunir M, el fondo podría quedar
bloqueado. **Mitigaciones:** (1) elegir el umbral con margen (3 de 5 tolera perder
2 claves); (2) **recuperación/rotación de guardianes** (*social recovery*):
reemplazar por consenso la dirección de un guardián perdido. Es la próxima función
de seguridad a implementar.

### "¿Usaron inteligencia artificial?"
Sí, **como herramienta de desarrollo** (Claude Code), igual que se usa un IDE o
Stack Overflow: para acelerar el código, aplicar patrones de seguridad y generar
documentación. **El producto en sí NO tiene IA**: una vez desplegado, es 100%
determinista (contrato + web). Esto está documentado en la memoria, sección 4.

### "¿Qué tiene que ver con Teoría de la Computación II?"
Identificamos varias líneas, la principal son los **autómatas/máquinas de estado**:
el ciclo de vida del reclamo es un **autómata finito determinista** con estados
`{Abierto, Pendiente, Aprobado, Liberado}`, un alfabeto de eventos (aprobaciones) y
una función de transición. Las validaciones `require` rechazan las transiciones
inválidas, igual que un autómata no acepta símbolos fuera de su función de
transición. También tocamos seguridad informática, criptografía/firmas y sistemas
de tipos (Solidity).

---

## 5. Glosario rápido (por si te preguntan un término)

- **dApp:** aplicación descentralizada; la web habla directo con la blockchain, sin
  servidor propio.
- **Contrato inteligente:** programa que vive en la blockchain y se ejecuta solo,
  sin que nadie pueda alterarlo.
- **Guardián:** integrante de la familia autorizado a crear y aprobar reclamos.
- **Umbral (M de N):** cantidad de aprobaciones necesarias (M) sobre el total de
  guardianes (N).
- **Beneficiario:** dirección que recibe los fondos cuando se libera un reclamo.
- **Reclamo:** pedido de liberación de fondos por una emergencia.
- **Gas:** costo de ejecutar una transacción; lo paga quien la firma. En Sepolia es
  con ETH de prueba (gratis).
- **Testnet / Sepolia:** red de prueba de Ethereum; el ETH no vale dinero real.
- **MetaMask:** billetera que guarda las claves y firma las transacciones.
- **Hash (keccak256):** "huella digital" de un dato; sirve para referenciar
  evidencia sin subirla entera.
- **Reentrancy:** ataque donde un contrato malicioso vuelve a llamar a una función
  antes de que termine; lo prevenimos con checks-effects-interactions.

---

## 6. Estructura del proyecto (qué señalar si piden ver el código)

- `contract/FamilyVault.sol` → el contrato (máquina de estados + seguridad + eventos).
- `app.js` + `index.html` + `style.css` → la web (dApp) con ethers.js y MetaMask.
- `config.js` → dirección del contrato + ABI (cómo la web "habla" con el contrato).
- `test/FamilyVault.test.js` → 15 tests que prueban la lógica (todos en verde).
- `docs/diagrama-estados.md` → el autómata dibujado (mostralo: impacta).
- `docs/memoria-tecnica.md` → la memoria completa.

> Tip para la demo: tené abierto **Etherscan de Sepolia** con las transacciones,
> para mostrar que todo quedó registrado públicamente. Eso es la prueba más fuerte.

---

## 7. Mini-checklist mental antes de presentar

- [ ] Sé explicar el problema en 1 frase.
- [ ] Sé explicar por qué multifirma y no una cuenta compartida.
- [ ] Sé qué es la máquina de estados y nombrar los 4 estados.
- [ ] Sé qué es el problema del oráculo y la atestación social.
- [ ] Sé qué es checks-effects-interactions (anti-reentrancy).
- [ ] Tengo la demo ensayada con cuentas que ya tienen ETH de prueba.
- [ ] Tengo a mano el link del contrato en Etherscan y la web en Vercel.
