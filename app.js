/* ───────────────────────────────────────────────────────────────────────
   app.js — Lógica de la dApp FamilyVault
   Usa ethers.js v6 (global `ethers` cargado por UMD desde el CDN).

   Diferencias v6 vs v5 importantes que respetamos acá:
     - Provider de navegador: new ethers.BrowserProvider(window.ethereum)
     - El signer es asíncrono: await provider.getSigner()
     - Utilidades a nivel raíz: ethers.parseEther / ethers.formatEther /
       ethers.getAddress / ethers.id / ethers.toUtf8Bytes / ethers.keccak256
   ─────────────────────────────────────────────────────────────────────── */

"use strict";

// ── Estado global de la app ────────────────────────────────────────────────
let provider = null;       // ethers.BrowserProvider
let signer = null;         // firmante (la wallet conectada)
let contrato = null;       // instancia con signer (para escribir)
let contratoLectura = null;// instancia con provider (para leer)
let cuentaActual = null;   // dirección conectada (minúsculas para comparar)
let soyGuardian = false;   // ¿la cuenta conectada es guardián?
let redOk = false;         // ¿estamos en Sepolia?

// Nombres legibles de los estados (índice = enum del contrato)
const NOMBRE_ESTADO = ["Abierto", "Pendiente", "Aprobado", "Liberado"];
const CLASE_ESTADO = ["estado-abierto", "estado-pendiente", "estado-aprobado", "estado-liberado"];

// ── Atajos al DOM ──────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ───────────────────────────────────────────────────────────────────────────
//  UTILIDADES DE UI
// ───────────────────────────────────────────────────────────────────────────

function mostrarAviso(mensaje, esError = false) {
  const el = $("aviso");
  el.textContent = mensaje;
  el.classList.toggle("error", esError);
  el.hidden = false;
}
function ocultarAviso() { $("aviso").hidden = true; }

function mostrarOverlay(texto) {
  $("overlay-texto").textContent = texto || "Procesando transacción…";
  $("overlay").hidden = false;
}
function ocultarOverlay() { $("overlay").hidden = true; }

function acortar(dir) {
  if (!dir) return "—";
  return dir.slice(0, 6) + "…" + dir.slice(-4);
}

function agregarEvento(texto, txHash) {
  const ul = $("log-eventos");
  const vacio = ul.querySelector(".vacio");
  if (vacio) vacio.remove();
  const li = document.createElement("li");
  const hora = new Date().toLocaleTimeString("es-AR");
  li.innerHTML = `<strong>${hora}</strong> · ${texto}`;
  if (txHash) {
    const a = document.createElement("a");
    a.href = `${NETWORK.explorador}/tx/${txHash}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "ev-link";
    a.textContent = " ↗ ver tx";
    li.appendChild(a);
  }
  ul.prepend(li);
}

/**
 * Traduce errores de MetaMask / ethers a mensajes claros en español.
 */
function mensajeDeError(err) {
  // Rechazo del usuario en MetaMask (v6 usa code "ACTION_REJECTED")
  if (err && (err.code === "ACTION_REJECTED" || err.code === 4001)) {
    return "Rechazaste la transacción en MetaMask.";
  }
  // Error de revert del contrato: intentamos extraer el require()
  const motivo = err?.reason || err?.revert?.args?.[0] || err?.shortMessage || err?.info?.error?.message;
  if (motivo) return "El contrato rechazó la operación: " + motivo;
  if (err?.message) return err.message;
  return "Ocurrió un error inesperado.";
}

// ───────────────────────────────────────────────────────────────────────────
//  CONEXIÓN A LA WALLET
// ───────────────────────────────────────────────────────────────────────────

async function conectarWallet() {
  if (typeof window.ethereum === "undefined") {
    mostrarAviso("No se detectó MetaMask. Instalá la extensión para usar la dApp.", true);
    return;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    // Pide permiso para acceder a las cuentas.
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    cuentaActual = (await signer.getAddress()).toLowerCase();

    // Mostrar la cuenta conectada
    $("cuenta").textContent = acortar(cuentaActual);
    $("cuenta").hidden = false;
    $("btn-conectar").textContent = "Conectado";

    await verificarRed();
    await inicializarContrato();

    // Reaccionar a cambios de cuenta o de red en MetaMask.
    if (!window._listenersPuestos) {
      window.ethereum.on("accountsChanged", () => window.location.reload());
      window.ethereum.on("chainChanged", () => window.location.reload());
      window._listenersPuestos = true;
    }
  } catch (err) {
    mostrarAviso(mensajeDeError(err), true);
  }
}

async function verificarRed() {
  const red = await provider.getNetwork();
  redOk = Number(red.chainId) === NETWORK.chainIdDec;
  const badge = $("red-badge");
  if (redOk) {
    badge.textContent = "Sepolia ✓";
    badge.className = "badge badge-ok";
    ocultarAviso();
  } else {
    badge.textContent = "Red incorrecta";
    badge.className = "badge badge-error";
    mostrarAviso(
      `Estás conectado a la red equivocada (chainId ${Number(red.chainId)}). ` +
      `Cambiá a ${NETWORK.nombre} en MetaMask para operar.`,
      true
    );
    await ofrecerCambioDeRed();
  }
}

/** Intenta pedirle a MetaMask que cambie a Sepolia. */
async function ofrecerCambioDeRed() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: NETWORK.chainIdHex }],
    });
  } catch (e) {
    // 4902 = la red no está agregada en MetaMask: la agregamos.
    if (e.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: NETWORK.chainIdHex,
            chainName: "Sepolia test network",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://rpc.sepolia.org"],
            blockExplorerUrls: [NETWORK.explorador],
          }],
        });
      } catch (_) { /* el usuario canceló */ }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  CONTRATO
// ───────────────────────────────────────────────────────────────────────────

function contratoConfigurado() {
  return CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";
}

async function inicializarContrato() {
  if (!contratoConfigurado()) {
    mostrarAviso(
      "El contrato todavía no está configurado. Pegá la dirección desplegada en config.js (CONTRACT_ADDRESS).",
      true
    );
    return;
  }
  // Instancia para escribir (con signer) y otra para leer (con provider).
  contrato = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  contratoLectura = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  habilitarControles(redOk);
  suscribirEventos();
  await refrescarTodo();
}

function habilitarControles(activo) {
  $("btn-depositar").disabled = !activo;
  $("btn-crear-reclamo").disabled = !activo || !soyGuardian;
  $("btn-refrescar").disabled = !activo;
}

/**
 * Suscribe los listeners de eventos del contrato para reflejarlos en vivo.
 */
function suscribirEventos() {
  if (!contratoLectura) return;
  contratoLectura.removeAllListeners();

  contratoLectura.on("Deposito", (origen, monto) => {
    agregarEvento(`💰 Depósito de ${ethers.formatEther(monto)} ETH por ${acortar(origen)}`);
    refrescarFondo();
  });
  contratoLectura.on("ReclamoCreado", (id, solicitante, descripcion) => {
    agregarEvento(`🚨 Reclamo #${id} creado por ${acortar(solicitante)}: "${descripcion}"`);
    refrescarReclamos();
  });
  contratoLectura.on("Aprobacion", (id, guardian, aprobaciones, umbral) => {
    agregarEvento(`✍️ Aprobación de ${acortar(guardian)} en reclamo #${id} (${aprobaciones}/${umbral})`);
    refrescarReclamos();
  });
  contratoLectura.on("FondosLiberados", (id, beneficiario, monto) => {
    agregarEvento(`✅ Reclamo #${id} LIBERADO: ${ethers.formatEther(monto)} ETH → ${acortar(beneficiario)}`);
    refrescarFondo();
    refrescarReclamos();
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  LECTURA Y RENDER
// ───────────────────────────────────────────────────────────────────────────

async function refrescarTodo() {
  await refrescarFondo();
  await refrescarReclamos();
}

async function refrescarFondo() {
  if (!contratoLectura) return;
  try {
    const [bal, umbral, beneficiario, admin, guardianes] = await Promise.all([
      contratoLectura.balance(),
      contratoLectura.umbral(),
      contratoLectura.beneficiario(),
      contratoLectura.admin(),
      contratoLectura.obtenerGuardianes(),
    ]);

    $("balance").textContent = `${ethers.formatEther(bal)} ETH`;
    $("umbral").textContent = `${Number(umbral)} de ${guardianes.length}`;
    $("beneficiario").textContent = beneficiario;
    $("admin").textContent = admin;

    // ¿La cuenta conectada es guardián?
    soyGuardian = guardianes.some((g) => g.toLowerCase() === cuentaActual);
    $("btn-crear-reclamo").disabled = !redOk || !soyGuardian;

    // Render de la lista de guardianes
    const ul = $("lista-guardianes");
    ul.innerHTML = "";
    guardianes.forEach((g) => {
      const li = document.createElement("li");
      const esYo = g.toLowerCase() === cuentaActual;
      li.innerHTML = `<span>${g}</span>` + (esYo ? `<span class="etiqueta-yo">vos</span>` : "");
      ul.appendChild(li);
    });

    if (!soyGuardian) {
      // Aviso suave (no error) si no sos guardián.
      // No usamos mostrarAviso para no tapar avisos de red.
    }
  } catch (err) {
    mostrarAviso("No se pudo leer el fondo: " + mensajeDeError(err), true);
  }
}

async function refrescarReclamos() {
  if (!contratoLectura) return;
  const cont = $("lista-reclamos");
  try {
    const total = Number(await contratoLectura.cantidadReclamos());
    if (total === 0) {
      cont.innerHTML = `<p class="vacio">Todavía no hay reclamos. Si sos guardián, podés reportar una emergencia.</p>`;
      return;
    }

    const umbral = Number(await contratoLectura.umbral());
    // Traemos todos los reclamos en paralelo.
    const ids = Array.from({ length: total }, (_, i) => i);
    const datos = await Promise.all(ids.map((i) => contratoLectura.obtenerReclamo(i)));

    cont.innerHTML = "";
    // Mostramos del más nuevo al más viejo.
    for (let i = total - 1; i >= 0; i--) {
      cont.appendChild(await renderReclamo(i, datos[i], umbral));
    }
  } catch (err) {
    mostrarAviso("No se pudieron leer los reclamos: " + mensajeDeError(err), true);
  }
}

async function renderReclamo(id, datos, umbral) {
  // datos = [solicitante, descripcion, hashEvidencia, monto, aprobaciones, estado, creadoEn]
  const solicitante = datos[0];
  const descripcion = datos[1];
  const hashEvidencia = datos[2];
  const monto = datos[3];
  const aprobaciones = Number(datos[4]);
  const estado = Number(datos[5]);
  const creadoEn = Number(datos[6]);

  const div = document.createElement("div");
  div.className = "reclamo";

  const pct = Math.min(100, Math.round((aprobaciones / umbral) * 100));
  const fecha = creadoEn ? new Date(creadoEn * 1000).toLocaleString("es-AR") : "—";
  const evidencia = (hashEvidencia && !/^0x0+$/.test(hashEvidencia))
    ? `<span>🔐 Hash evidencia: <span class="mono">${acortar(hashEvidencia)}</span></span>`
    : "";

  // ¿Puede esta wallet aprobar? Solo guardián, reclamo no liberado, y que no haya aprobado ya.
  let puedeAprobar = false;
  if (soyGuardian && estado !== 3) {
    try {
      const yaAprobo = await contratoLectura.yaAprobo(id, cuentaActual);
      puedeAprobar = !yaAprobo;
    } catch (_) { puedeAprobar = false; }
  }

  div.innerHTML = `
    <div class="reclamo-head">
      <div>
        <div class="reclamo-id">Reclamo #${id} · abierto por ${acortar(solicitante)}</div>
        <p class="reclamo-desc">${escaparHtml(descripcion)}</p>
      </div>
      <span class="estado ${CLASE_ESTADO[estado]}">${NOMBRE_ESTADO[estado]}</span>
    </div>
    <div class="reclamo-meta">
      <span>💵 Monto a liberar: <strong>${ethers.formatEther(monto)} ETH</strong></span>
      <span>🕒 Creado: ${fecha}</span>
      ${evidencia}
    </div>
    <div class="reclamo-foot">
      <div class="progreso">
        <span>${aprobaciones}/${umbral}</span>
        <div class="barra"><div class="barra-fill" style="width:${pct}%"></div></div>
      </div>
    </div>
  `;

  // Botón aprobar (solo si corresponde)
  const foot = div.querySelector(".reclamo-foot");
  if (estado === 3) {
    const ok = document.createElement("span");
    ok.className = "estado estado-liberado";
    ok.textContent = "Fondos liberados ✓";
    foot.appendChild(ok);
  } else if (soyGuardian) {
    const btn = document.createElement("button");
    btn.className = "btn btn-aprobar";
    btn.textContent = puedeAprobar ? "Aprobar" : "Ya aprobaste";
    btn.disabled = !puedeAprobar || !redOk;
    btn.onclick = () => aprobarReclamo(id);
    foot.appendChild(btn);
  }

  return div;
}

function escaparHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ───────────────────────────────────────────────────────────────────────────
//  ACCIONES (escritura en la cadena)
// ───────────────────────────────────────────────────────────────────────────

async function depositar() {
  ocultarAviso();
  const valor = $("input-deposito").value.trim();
  if (!valor || Number(valor) <= 0) {
    mostrarAviso("Ingresá un monto válido para depositar.", true);
    return;
  }
  try {
    mostrarOverlay("Enviando depósito… confirmá en MetaMask.");
    const tx = await contrato.depositar({ value: ethers.parseEther(valor) });
    mostrarOverlay("Minando el depósito en Sepolia…");
    await tx.wait();
    agregarEvento(`💰 Depósito de ${valor} ETH enviado`, tx.hash);
    $("input-deposito").value = "";
    await refrescarFondo();
  } catch (err) {
    mostrarAviso(mensajeDeError(err), true);
  } finally {
    ocultarOverlay();
  }
}

async function crearReclamo() {
  ocultarAviso();
  const descripcion = $("input-descripcion").value.trim();
  const montoStr = $("input-monto-reclamo").value.trim();
  const evidencia = $("input-evidencia").value.trim();

  if (!descripcion) { mostrarAviso("Describí la emergencia.", true); return; }
  if (!montoStr || Number(montoStr) <= 0) { mostrarAviso("Ingresá un monto a liberar.", true); return; }

  // Calculamos el hash de la evidencia localmente (keccak256). Si no hay, 0x0.
  const hashEvidencia = evidencia
    ? ethers.keccak256(ethers.toUtf8Bytes(evidencia))
    : ethers.ZeroHash;

  try {
    mostrarOverlay("Creando reclamo… confirmá en MetaMask.");
    const tx = await contrato.crearReclamo(descripcion, hashEvidencia, ethers.parseEther(montoStr));
    mostrarOverlay("Registrando el reclamo en Sepolia…");
    await tx.wait();
    agregarEvento(`🚨 Reclamo creado: "${descripcion}"`, tx.hash);
    $("input-descripcion").value = "";
    $("input-monto-reclamo").value = "";
    $("input-evidencia").value = "";
    $("hash-preview").textContent = "";
    await refrescarReclamos();
  } catch (err) {
    mostrarAviso(mensajeDeError(err), true);
  } finally {
    ocultarOverlay();
  }
}

async function aprobarReclamo(id) {
  ocultarAviso();
  try {
    mostrarOverlay(`Aprobando reclamo #${id}… confirmá en MetaMask.`);
    const tx = await contrato.aprobar(id);
    mostrarOverlay("Registrando la aprobación en Sepolia…");
    await tx.wait();
    agregarEvento(`✍️ Aprobaste el reclamo #${id}`, tx.hash);
    await refrescarTodo();
  } catch (err) {
    mostrarAviso(mensajeDeError(err), true);
  } finally {
    ocultarOverlay();
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  ENGANCHE DE EVENTOS DEL DOM
// ───────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  $("btn-conectar").addEventListener("click", conectarWallet);
  $("btn-depositar").addEventListener("click", depositar);
  $("btn-crear-reclamo").addEventListener("click", crearReclamo);
  $("btn-refrescar").addEventListener("click", refrescarTodo);

  // Vista previa del hash de evidencia mientras se escribe.
  $("input-evidencia").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    $("hash-preview").textContent = v
      ? "keccak256: " + ethers.keccak256(ethers.toUtf8Bytes(v))
      : "";
  });

  // Aviso si el contrato no está configurado todavía.
  if (!contratoConfigurado()) {
    mostrarAviso(
      "⚙️ Recordá completar CONTRACT_ADDRESS en config.js con la dirección del contrato desplegado en Sepolia.",
      false
    );
  }
});
