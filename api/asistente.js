/**
 * api/asistente.js — Función serverless (Vercel) del asistente de FamilyVault.
 *
 * Recibe una pregunta del usuario y responde usando un modelo de lenguaje
 * (Google Gemini, plan gratuito). La API key vive como variable de entorno en
 * Vercel (GEMINI_API_KEY) y NUNCA se expone en el frontend.
 *
 * Configuración en Vercel:
 *   Project → Settings → Environment Variables → GEMINI_API_KEY = (tu key)
 *   La key gratuita se obtiene en https://aistudio.google.com/app/apikey
 *
 * Importante (alcance del producto):
 *   El asistente SOLO explica y orienta. No mueve fondos, no aprueba reclamos y
 *   no da consejos financieros ni legales. El producto FamilyVault no incorpora
 *   IA en su funcionamiento: la IA es únicamente este asistente de soporte.
 *
 * Si no hay key configurada o la API falla, esta función responde con
 * { ok: false }, y el frontend usa su base de conocimiento local como respaldo,
 * de modo que el asistente nunca queda completamente fuera de servicio.
 */

const MODELO = "gemini-1.5-flash";

const SYSTEM_PROMPT = `
Sos el asistente de soporte de "FamilyVault" (Bóveda Familiar), una dApp educativa.
Hablás en español rioplatense, de forma clara, breve y amable. Tuteás al usuario.

QUÉ ES FAMILYVAULT:
- Un fondo de ahorro de emergencia familiar custodiado por un contrato inteligente
  en la blockchain (red de prueba Sepolia de Ethereum).
- Los fondos se liberan SOLO por consenso: hace falta un mínimo de aprobaciones de
  los integrantes (umbral "M de N", por ejemplo 3 de 4). Ninguna persona sola puede
  mover el dinero.
- No hay banco, no hay custodio único, no hay base de datos central: la blockchain
  es el registro común. Es una solución no-custodial: la familia mantiene el control.

CÓMO FUNCIONA:
1) Crear la bóveda: se eligen los integrantes (direcciones de wallet) y el umbral.
2) Depositar: cualquiera suma fondos.
3) Reportar emergencia: un integrante (guardián) abre un "reclamo" con descripción y monto.
4) Aprobar: los guardianes firman su aprobación desde su wallet (MetaMask).
5) Liberar: al alcanzar el umbral, el contrato transfiere los fondos al solicitante.

ESTADOS DE UN RECLAMO (máquina de estados): Abierto -> Pendiente -> Aprobado -> Liberado,
o Cancelado si se anula antes de liberar.

SEGURIDAD (puntos clave para explicar con confianza):
- La dirección de la bóveda es pública a propósito (como un alias/CBU): conocerla NO
  da acceso. Para operar hay que firmar con la clave privada de una wallet que sea
  guardiana, y esa firma no se puede falsificar.
- Aunque roben una clave, no alcanza: se necesita el consenso de varios (umbral M de N).
- Si alguien pierde su wallet, el resto puede reemplazarla por consenso (recuperación social).
- Patrón checks-effects-interactions (anti-reentrancy) y control de acceso en el contrato.

MULTI-FAMILIA: cada familia tiene su propia bóveda (contrato independiente y aislado).
Una "Factory" permite crear bóvedas nuevas. Los fondos de una familia son inaccesibles
para otra.

REGLAS PARA VOS:
- Respondé solo sobre FamilyVault, blockchain, wallets, seguridad y uso de la app.
- NO das consejos de inversión ni legales. NO pedís ni manejás claves privadas o frases semilla.
- Si te piden algo fuera de tema, redirigí amablemente al uso de la app.
- Recordá, si viene al caso, que las decisiones sobre fondos las toman las personas por
  consenso; vos solo orientás.
- Respuestas cortas (2 a 5 oraciones), sin tecnicismos innecesarios.
`.trim();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Método no permitido" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Sin key configurada: el frontend usará su base local.
    res.status(200).json({ ok: false, error: "Asistente no configurado (falta GEMINI_API_KEY)." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const mensaje = (body.mensaje || "").toString().slice(0, 1000).trim();
    if (!mensaje) {
      res.status(400).json({ ok: false, error: "Mensaje vacío" });
      return;
    }

    // Historial opcional para dar contexto (lista de {rol, texto}).
    const historial = Array.isArray(body.historial) ? body.historial.slice(-6) : [];
    const contents = [];
    for (const m of historial) {
      contents.push({
        role: m.rol === "user" ? "user" : "model",
        parts: [{ text: (m.texto || "").toString().slice(0, 1000) }],
      });
    }
    contents.push({ role: "user", parts: [{ text: mensaje }] });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 320 },
      }),
    });

    if (!r.ok) {
      res.status(200).json({ ok: false, error: "La API respondió " + r.status });
      return;
    }
    const data = await r.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!texto) {
      res.status(200).json({ ok: false, error: "Sin respuesta del modelo" });
      return;
    }
    res.status(200).json({ ok: true, respuesta: texto });
  } catch (err) {
    res.status(200).json({ ok: false, error: "Error del asistente" });
  }
}
