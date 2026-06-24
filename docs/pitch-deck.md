# FamilyVault — Bóveda Familiar

**Pitch Deck**

---

> ### Cómo usar este deck
>
> - **Duración sugerida:** 5 a 7 minutos.
> - **Ritmo:** ~30 a 40 segundos por diapositiva (11 diapositivas).
> - **Formato:** cada diapositiva tiene viñetas para mostrar en pantalla y una nota *"Qué decir / cómo presentar"* que es el guion del orador (no se proyecta).
> - **Consejo:** dejá la demo en vivo (Diapositiva 4) preparada y abierta en otra pestaña antes de empezar. Si falla la red, tené un video de respaldo.
> - **Honestidad:** todos los números marcados como *estimación* u *objetivo* son proyecciones, no métricas reales medidas. No los presentes como datos confirmados.

---

## Diapositiva 1 — Portada

- **FamilyVault — Bóveda Familiar**
- *Tagline:* **"El fondo de emergencia que ninguna persona sola puede vaciar — y que toda la familia puede liberar cuando de verdad hace falta."**
- dApp de ahorro de emergencia familiar custodiado por contrato inteligente.
- Equipo: *[nombres del equipo]*
- Contexto: Hackathon Universitario — materia **Teoría de la Computación II**.
- Fecha: *[fecha del evento]*

> **Qué decir / cómo presentar:** Abrí con energía y una sola idea: "Imaginen un fondo de emergencia familiar que está seguro hasta de la propia familia." Presentá el nombre, el tagline y al equipo en menos de 30 segundos. No entres todavía en detalles técnicos: generá curiosidad.

---

## Diapositiva 2 — El Problema

- Las familias quieren guardar plata para emergencias (un accidente, una urgencia médica, una crisis), pero **no tienen una forma confiable** de hacerlo de manera compartida.
- Las alternativas actuales fallan:
  - **Cuenta bancaria compartida:** cualquier titular puede vaciarla solo. Cero protección contra el mal uso o la presión.
  - **Efectivo en casa:** inseguro (robo, pérdida, incendio) y no rinde nada.
  - **Custodio único** (una persona "de confianza" guarda todo): punto único de falla. Si esa persona desaparece, abusa o es presionada, el fondo se pierde.
- El problema central: **confiar el dinero a una sola voluntad** o **no protegerlo en absoluto**.

> **Qué decir / cómo presentar:** Contá una microhistoria concreta: "Una familia junta plata para emergencias y la pone en la cuenta del hermano mayor. Un día él la usa para otra cosa." El jurado tiene que sentir el dolor del problema. Cerrá con la tensión: "Toda opción obliga a elegir entre confianza ciega o falta de protección."

---

## Diapositiva 3 — La Solución

- **FamilyVault:** un fondo de emergencia familiar **multifirma**, custodiado por un contrato inteligente.
- Los fondos **solo se liberan por consenso**: hace falta que un mínimo de integrantes (**umbral M de N**) certifique en la cadena que ocurrió la emergencia.
- Ninguna persona sola puede mover el dinero. Tampoco hace falta confiar en un banco ni en un custodio.
- Cada liberación queda **registrada de forma transparente e inviolable** en la blockchain: cualquiera de la familia puede auditarla.
- Resultado: **seguridad + transparencia + control compartido**, sin intermediarios.

> **Qué decir / cómo presentar:** Esta es la diapositiva del "ajá". Decilo simple: "El dinero solo se mueve cuando la familia, en conjunto, dice que sí." Enfatizá las tres palabras clave: consenso, transparencia, inviolable. No expliques todavía el *cómo* técnico: eso viene ahora.

---

## Diapositiva 4 — Cómo funciona / Demo

- **Flujo de uso (todo on-chain, en la testnet Sepolia):**
  1. **Depositar:** uno o varios guardianes envían fondos al contrato.
  2. **Reportar emergencia:** un guardián crea un **reclamo** (claim) describiendo el caso y el monto a liberar.
  3. **Aprobar:** los demás guardianes revisan y **firman su aprobación** desde sus propias wallets.
  4. **Liberar:** al alcanzar el **umbral M de N** aprobaciones, los fondos se **liberan automáticamente al solicitante** (quien creó el reclamo).
- Todo es **verificable públicamente** en Sepolia / Etherscan: depósitos, reclamos, aprobaciones y la liberación final.

> **Qué decir / cómo presentar:** Si es posible, **demo en vivo**. Mostrá MetaMask firmando una aprobación y, al completar el umbral, la transacción de liberación en Etherscan. Narrá cada paso: "Acá el segundo guardián firma… y al llegar a 2 de 3, el contrato libera solo." Tené video de respaldo por si la red falla. Mantené la demo corta y guionada.

---

## Diapositiva 5 — Tecnología y Máquina de Estados

- **Stack:**
  - **Blockchain:** Ethereum, testnet **Sepolia**.
  - **Contrato inteligente:** **Solidity** (toda la lógica de custodia y consenso vive acá).
  - **Frontend:** HTML/CSS/JavaScript **vanilla** + **ethers.js v6** (desde CDN).
  - **Wallet:** **MetaMask** firma cada transacción.
  - **Sin backend ni API keys:** dApp pura. El frontend habla directo con la blockchain; MetaMask firma. Hosting estático en **Vercel**.
- **Cada reclamo es una Máquina de Estados Finita (autómata finito):**

  `Abierto → Pendiente → Aprobado → Liberado`

  - **Abierto:** se crea el reclamo.
  - **Pendiente:** está juntando aprobaciones de guardianes.
  - **Aprobado:** se alcanzó el umbral M de N.
  - **Liberado:** los fondos salieron al solicitante (estado final/absorbente).
  - **Cancelado:** el reclamo se anuló antes de liberarse (estado final).
- Las transiciones son **deterministas y validadas por el contrato**: solo se puede avanzar por los caminos permitidos.

> **Qué decir / cómo presentar:** Esta es la conexión directa con **Teoría de la Computación II**: el reclamo es literalmente un autómata finito. Mostrá el diagrama de estados y subrayá que el contrato **rechaza toda transición inválida**, igual que un autómata rechaza una cadena que no pertenece al lenguaje. Es el puente entre la teoría de la materia y un producto real.

---

## Diapositiva 6 — Seguridad

- **Control de acceso:** solo las direcciones registradas como **guardianes** pueden crear reclamos y aprobar. Cualquier otra wallet es rechazada.
- **Patrón checks-effects-interactions (anti-reentrancy):** primero se validan condiciones, después se actualiza el estado interno y recién al final se transfieren los fondos. Evita ataques de reentrada.
- **Validaciones de estado:**
  - **No aprobar dos veces:** un guardián no puede sumar su firma al mismo reclamo más de una vez.
  - **No liberar dos veces:** una vez en estado *Liberado*, el reclamo no puede volver a pagar.
- **Criptografía de clave pública:** cada aprobación es una **firma digital** hecha con la **clave privada** del guardián en MetaMask. Nadie puede falsificar la aprobación de otro.

> **Qué decir / cómo presentar:** Hablá con seguridad técnica pero claro. La idea fuerte: "El contrato no confía en nadie por defecto; verifica todo." Mencioná reentrancy como un riesgo clásico de smart contracts que ya está mitigado. Cerrá con la frase: "Cada aprobación es una firma criptográfica: imposible de falsificar."

---

## Diapositiva 7 — Innovación e Impacto

- **Atestación social como oráculo de confianza:** en vez de depender de un dato externo, la "verdad" de la emergencia la certifica la propia familia por consenso. La confianza se vuelve un mecanismo on-chain.
- **Protección real para familias separadas geográficamente:** guardianes en distintas ciudades o países pueden custodiar y liberar un fondo común sin viajar ni depender de un banco intermediario.
- **Transparencia total:** todo movimiento es auditable por cualquier integrante, en cualquier momento.
- **Impacto social y económico:** una herramienta de resiliencia financiera familiar, especialmente útil donde el acceso bancario es limitado o la confianza institucional es baja.

> **Qué decir / cómo presentar:** Elevá la mirada del código al impacto humano. El concepto estrella es **"atestación social como oráculo"**: la familia misma es la fuente de verdad. Conectalo con inclusión financiera y con el mundo real de familias migrantes o distribuidas. Que el jurado vea que esto no es solo un ejercicio técnico.

---

## Diapositiva 8 — Modelo / Viabilidad

- **Factibilidad técnica ya demostrada:** el contrato está desplegado y funcionando en **Sepolia**. No es un concepto: es un prototipo operativo.
- **Costos:** en testnet el gas es prácticamente nulo. En mainnet existiría un costo de gas por transacción; *estimamos* que es bajo frente al valor que protege (cifra a validar con datos reales de la red — es una proyección, no una métrica medida).
- **Mitigaciones de riesgos conocidos:**
  - **Volatilidad de cripto:** usar **stablecoins (USDC / DAI)** en lugar de ETH, para que el fondo mantenga su valor.
  - **Pérdida de claves:** mecanismo de **recuperación y rotación de guardianes**, para reemplazar a un integrante que perdió su acceso sin comprometer el fondo.

> **Qué decir / cómo presentar:** El mensaje clave: "Esto ya funciona, no es una idea en una servilleta." Sé honesto con los números: marcá que los costos son estimaciones. Mostrá que ya pensaron en los dos riesgos obvios que el jurado va a preguntar (volatilidad y pérdida de claves) y que tienen mitigaciones concretas. Eso da madurez.

---

## Diapositiva 9 — Equipo

  | Nombre | Rol |
  |---|---|
  | **Lucas** | Blockchain / Smart Contract (Solidity) |
  | **Adriano** | Frontend / Web3 (ethers.js + MetaMask) |
  | **Nahuel Mosconi** | Documentación / Investigación |
  | **Ignacio Escarcha** | Coordinación / Pitch |

- Equipo de la materia **Teoría de la Computación II**.

> **Qué decir / cómo presentar:** Presentá a cada integrante en una frase con su rol y un aporte concreto. Si el equipo es chico, asigná varios roles por persona. Transmití que es un equipo que combina teoría (autómatas) y práctica (dApp).

---

## Diapositiva 10 — Próximos pasos / Roadmap

- **Stablecoins (USDC / DAI):** eliminar la exposición a la volatilidad del fondo.
- **Recuperación social de guardianes:** rotar o reemplazar guardianes ante pérdida de claves, con aprobación del resto.
- **Reglas de liberación más finas:** montos parciales, límites por período, reglas según el tipo de emergencia.
- **Rampas a fiat y multi-red:** facilitar entrada/salida de dinero y desplegar en otras redes (L2 de bajo costo).
- **App móvil con notificaciones:** avisar a los guardianes cuando hay un reclamo para aprobar y agilizar el consenso.

> **Qué decir / cómo presentar:** Mostrá visión sin sobreprometer. Aclará qué es corto plazo (stablecoins, recuperación de guardianes) y qué es más a futuro (multi-red, app móvil). El mensaje: "Tenemos una base sólida y un camino claro para crecer."

---

## Diapositiva 11 — Cierre / Llamado a la acción

- **FamilyVault: el fondo de emergencia que protege a la familia incluso de sí misma.**
- **Probalo y revisá el código:**
  - Repositorio: `[link]`
  - Contrato en Sepolia / Etherscan: `[link]`
  - Video demo: `[link]`
- *Gracias. ¿Preguntas?*

> **Qué decir / cómo presentar:** Cerrá volviendo al tagline para enmarcar todo el pitch. Invitá explícitamente al jurado a abrir el repo y ver el contrato en Etherscan: la transparencia es parte del producto. Dejá los links visibles y agradecé. Reservá tiempo para preguntas.

---

> ### Nota sobre el uso de IA (transparencia)
>
> **FamilyVault no incluye ninguna funcionalidad de inteligencia artificial.** La IA (Claude / Claude Code) se utilizó **únicamente como herramienta de desarrollo** durante la construcción del proyecto (asistencia al programar, depurar y documentar). El producto final es una dApp determinista: contrato Solidity + frontend + MetaMask, sin ningún componente de IA en tiempo de ejecución.
