/**
 * asistente.js — Asistente de soporte de FamilyVault (frontend).
 *
 * Abre/cierra el widget de chat y maneja las preguntas del usuario. Cada pregunta
 * se envía a la función serverless /api/asistente (que usa un modelo de lenguaje
 * real con la API key oculta en el servidor). Si esa función no está disponible
 * (por ejemplo, abriendo la app localmente, sin key, o si se agota la cuota), se
 * usa una BASE DE CONOCIMIENTO LOCAL como respaldo, de modo que el asistente
 * nunca queda completamente fuera de servicio.
 *
 * El asistente solo explica y orienta: no mueve fondos ni aprueba reclamos.
 */

"use strict";

(function () {
  const $ = (id) => document.getElementById(id);
  const fab = $("ia-fab");
  const panel = $("ia-panel");
  const cerrar = $("ia-close");
  const body = $("ia-body");
  const input = $("ia-input");
  const enviar = $("ia-send");
  if (!fab || !panel) return; // la página no tiene el widget

  const historial = []; // [{rol:"user"|"bot", texto}]
  let enviando = false;

  // ── Base de conocimiento local (respaldo sin conexión / sin API) ──────────
  // Cada entrada: palabras clave -> respuesta. Se elige la de mejor coincidencia.
  const KB = [
    {
      claves: ["umbral", "cuantos", "cuántos", "cuanta", "m de n", "mayoria", "mayoría", "aprobaciones necesarias"],
      r: "El umbral es cuántas aprobaciones hacen falta para liberar fondos (la “M” de “M de N”). Para una familia de 4, lo más común es 3 de 4: difícil de abusar pero ágil. Si querés máxima seguridad podés usar 4 de 4, aunque exige que estén todos disponibles.",
    },
    {
      claves: ["reclamo", "emergencia", "pedir", "solicitar", "claim"],
      r: "Un reclamo es un pedido de liberación de fondos. Un integrante lo abre describiendo la emergencia y el monto. Pasa por los estados Abierto → Pendiente → Aprobado → Liberado a medida que los guardianes aprueban. Al llegar al umbral, el contrato transfiere los fondos a quien lo solicitó.",
    },
    {
      claves: ["seguro", "seguridad", "robar", "hackear", "roban"],
      r: "La seguridad no se basa en esconder nada. Para mover fondos hay que firmar con la clave privada de una wallet que sea guardiana, y esa firma no se puede falsificar. Y aunque roben una clave, no alcanza: se necesita el consenso de varios (umbral M de N).",
    },
    {
      claves: ["direccion", "dirección", "publica", "pública", "consigue", "conocen"],
      r: "Que alguien conozca la dirección de tu bóveda no le da acceso: es pública a propósito, como un alias o CBU. Solo se puede operar firmando con la clave privada de una wallet registrada como guardiana. Sin esa firma (y sin el consenso del grupo), no se puede tocar el dinero.",
    },
    {
      claves: ["perdi", "perdí", "perder", "clave", "wallet", "recuperar", "recuperación", "recuperacion"],
      r: "Si perdés el acceso a tu wallet, el resto de la familia puede reemplazarla por una nueva mediante la “recuperación social”, que también requiere el consenso del grupo. El fondo no se pierde.",
    },
    {
      claves: ["blockchain", "que es", "qué es", "cripto", "ethereum", "sepolia"],
      r: "La blockchain es como un cuaderno de cuentas compartido que mantienen miles de computadoras: nadie lo controla solo y nada de lo escrito se puede borrar. FamilyVault corre sobre Sepolia, una red de prueba de Ethereum, así que el dinero es de práctica (sin valor real).",
    },
    {
      claves: ["crear", "nueva", "boveda", "bóveda", "empezar"],
      r: "Para crear una bóveda elegís los integrantes (las direcciones de wallet de tu familia) y el umbral de aprobación. Se despliega un contrato propio para tu familia. Después compartís la dirección de la bóveda para que cada integrante entre desde su dispositivo.",
    },
    {
      claves: ["entrar", "ingresar", "acceder", "unirme", "sumarme"],
      r: "Para entrar a una bóveda existente pegás su dirección de contrato (te la comparte quien la creó) en “Entrar a una bóveda” y conectás tu wallet. Si tu dirección está entre los guardianes, vas a poder crear y aprobar reclamos.",
    },
    {
      claves: ["conectar", "metamask", "billetera"],
      r: "Necesitás la extensión MetaMask con tu cuenta en la red Sepolia. Tocá “Conectar wallet” y aceptá en MetaMask. Tu wallet es tu identidad: no hay usuario ni contraseña.",
    },
    {
      claves: ["deposito", "depósito", "depositar", "fondos", "plata", "dinero"],
      r: "Cualquiera puede depositar al fondo, incluso sin ser guardián. El dinero queda custodiado por el contrato, no por una persona, y solo sale por consenso de la familia.",
    },
    {
      claves: ["dos familias", "otra familia", "varias", "masivo", "multi"],
      r: "Cada familia tiene su propia bóveda: un contrato independiente y aislado. Los fondos de una familia son inaccesibles para otra. No hace falta una base de datos central: el registro de todas las bóvedas vive en la blockchain.",
    },
    {
      claves: ["ia", "inteligencia artificial", "decide", "automatico", "automático"],
      r: "Las decisiones sobre el dinero las toman siempre las personas, por consenso. La IA es únicamente este asistente que explica y guía; nunca mueve fondos ni aprueba reclamos.",
    },
    {
      claves: ["cancelar", "anular"],
      r: "Un reclamo se puede cancelar antes de liberarse, y solo lo puede hacer quien lo abrió o el admin. Una vez cancelado o liberado, queda en estado final y no cambia más.",
    },
  ];

  function responderLocal(texto) {
    const t = texto.toLowerCase();
    let mejor = null, mejorPuntaje = 0;
    for (const item of KB) {
      let p = 0;
      for (const c of item.claves) if (t.includes(c)) p++;
      if (p > mejorPuntaje) { mejorPuntaje = p; mejor = item; }
    }
    if (mejor && mejorPuntaje > 0) return mejor.r;
    return "Puedo ayudarte con cómo crear o entrar a una bóveda, qué es un reclamo, el umbral de aprobación, la seguridad o qué es la blockchain. ¿Sobre cuál querés que te explique? (Recordá: las decisiones sobre fondos las toma la familia por consenso; yo solo te oriento.)";
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  function abrir() { panel.hidden = false; fab.hidden = true; input.focus(); }
  function ocultar() { panel.hidden = true; fab.hidden = false; }

  function agregarMensaje(texto, quien) {
    const div = document.createElement("div");
    div.className = "ia-msg " + (quien === "user" ? "ia-msg-user" : "ia-msg-bot");
    div.textContent = texto;
    // quitamos los chips de sugerencia una vez que empieza la charla
    const sug = body.querySelector(".ia-suggest");
    if (sug && quien === "user") sug.remove();
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function indicadorEscribiendo() {
    const div = document.createElement("div");
    div.className = "ia-msg ia-msg-bot";
    div.textContent = "Escribiendo…";
    div.dataset.typing = "1";
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  async function preguntar(texto) {
    if (enviando) return;
    texto = (texto || "").trim();
    if (!texto) return;
    enviando = true;
    enviar.disabled = true;
    agregarMensaje(texto, "user");
    historial.push({ rol: "user", texto });
    input.value = "";
    const typing = indicadorEscribiendo();

    let respuesta = null;
    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje: texto,
          historial: historial.slice(-6).map((m) => ({ rol: m.rol === "user" ? "user" : "model", texto: m.texto })),
        }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data && data.ok && data.respuesta) respuesta = data.respuesta;
      }
    } catch (_) { /* sin backend: usamos la base local */ }

    if (!respuesta) respuesta = responderLocal(texto);

    typing.remove();
    agregarMensaje(respuesta, "bot");
    historial.push({ rol: "bot", texto: respuesta });
    enviando = false;
    enviar.disabled = false;
  }

  // ── Enganche de eventos ────────────────────────────────────────────────────
  fab.addEventListener("click", abrir);
  cerrar.addEventListener("click", ocultar);
  enviar.addEventListener("click", () => preguntar(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); preguntar(input.value); }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(110, input.scrollHeight) + "px";
  });
  // Chips de sugerencia (delegación, porque se eliminan al empezar la charla).
  body.addEventListener("click", (e) => {
    const chip = e.target.closest(".ia-chip");
    if (chip) preguntar(chip.textContent);
  });
})();
