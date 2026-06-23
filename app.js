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

/**
 * Devuelve el nombre del integrante si está cargado en NOMBRES (config.js);
 * si no, devuelve la dirección acortada. Así la UI muestra "Mamá" en vez de
 * "0x5eE3…0BB2".
 */
function nombreDe(dir) {
  if (!dir) return "—";
  const nombre = (typeof NOMBRES !== "undefined") ? NOMBRES[dir.toLowerCase()] : null;
  return nombre || acortar(dir);
}

/** Construye un <li> de evento para el historial. */
function crearLiEvento(texto, txHash, fechaMs) {
  const li = document.createElement("li");
  const cuando = fechaMs ? new Date(fechaMs).toLocaleString("es-AR") : new Date().toLocaleString("es-AR");
  li.innerHTML = `<strong>${cuando}</strong> · ${texto}`;
  if (txHash) {
    const a = document.createElement("a");
    a.href = `${NETWORK.explorador}/tx/${txHash}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "ev-link";
    a.textContent = " ↗ ver tx";
    li.appendChild(a);
  }
  return li;
}

/**
 * Arma el texto de un evento (ya sea histórico o en vivo) a partir de sus args.
 */
function textoDeEvento(nombre, a) {
  switch (nombre) {
    case "Deposito":
      return `💰 Depósito de ${ethers.formatEther(a.monto)} ETH por ${nombreDe(a.origen)}`;
    case "ReclamoCreado":
      return `🚨 Reclamo #${a.idReclamo} creado por ${nombreDe(a.solicitante)} — motivo: "${escaparHtml(a.descripcion)}" (pide ${ethers.formatEther(a.monto)} ETH)`;
    case "Aprobacion":
      return `✍️ Aprobación de ${nombreDe(a.guardian)} en reclamo #${a.idReclamo} (${a.aprobaciones}/${a.umbral})`;
    case "FondosLiberados":
      return `✅ Reclamo #${a.idReclamo} LIBERADO: ${ethers.formatEther(a.monto)} ETH → ${nombreDe(a.destino)}`;
    default:
      return "Evento";
  }
}

/**
 * Carga TODO el historial leyendo los eventos pasados del contrato desde la
 * blockchain (queryFilter). Así el historial persiste aunque recargues la página.
 * Muestra depósitos (quién, cuánto) y reclamos (cuándo, motivo, monto, destino).
 */
async function cargarHistorial() {
  if (!contratoLectura) return;
  const ul = $("log-eventos");
  try {
    const nombres = ["Deposito", "ReclamoCreado", "Aprobacion", "FondosLiberados"];
    const listas = await Promise.all(nombres.map((n) => contratoLectura.queryFilter(n)));
    // Aplanamos guardando el nombre del evento junto a cada log.
    const eventos = [];
    listas.forEach((lista, i) => lista.forEach((ev) => eventos.push({ ev, nombre: nombres[i] })));

    if (eventos.length === 0) {
      ul.innerHTML = `<li class="vacio">Todavía no hay actividad. Hacé un depósito para empezar.</li>`;
      return;
    }

    // Orden cronológico descendente (lo más nuevo arriba).
    eventos.sort((x, y) =>
      (y.ev.blockNumber - x.ev.blockNumber) || (y.ev.index - x.ev.index)
    );

    // Buscamos el timestamp de cada bloque (con caché para no repetir llamadas).
    const cacheBloques = {};
    async function tsDe(blockNumber) {
      if (cacheBloques[blockNumber] === undefined) {
        const b = await provider.getBlock(blockNumber);
        cacheBloques[blockNumber] = b ? b.timestamp * 1000 : null;
      }
      return cacheBloques[blockNumber];
    }

    ul.innerHTML = "";
    for (const { ev, nombre } of eventos) {
      const ms = await tsDe(ev.blockNumber);
      ul.appendChild(crearLiEvento(textoDeEvento(nombre, ev.args), ev.transactionHash, ms));
    }
  } catch (err) {
    // Algunos RPC limitan el rango de getLogs; no es crítico para operar.
    if (ul.querySelector(".vacio")) {
      ul.innerHTML = `<li class="vacio">No se pudo cargar el historial (el RPC limitó la consulta).</li>`;
    }
  }
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

/**
 * Conexión disparada por el botón. A diferencia de la reconexión silenciosa,
 * abre el SELECTOR DE CUENTAS de MetaMask (wallet_requestPermissions) para que
 * puedas elegir con qué integrante conectarte o conectar cuentas nuevas. Esto
 * permite, en la demo, cambiar de "Nahuel" a "Lucas" y probar el aprobar.
 */
async function conectarDesdeBoton() {
  if (typeof window.ethereum === "undefined") {
    mostrarAviso("No se detectó MetaMask. Instalá la extensión para usar la dApp.", true);
    return;
  }
  try {
    // Fuerza el selector de cuentas aunque ya haya una conectada.
    await window.ethereum.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (_) {
    // El usuario cerró el selector sin elegir: seguimos con lo que haya.
  }
  await conectarWallet();
}

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

    // Mostrar la cuenta conectada (nombre del integrante si está cargado)
    $("cuenta").textContent = nombreDe(cuentaActual);
    $("cuenta").title = cuentaActual; // la dirección completa queda en el tooltip
    $("cuenta").hidden = false;
    $("btn-conectar").textContent = "Cambiar cuenta";

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
 * Suscribe listeners de eventos para que, cuando OTRO integrante haga algo
 * (depósito, reclamo, aprobación, liberación), la UI se actualice sola.
 * El historial se rearma siempre desde la cadena (cargarHistorial) para no
 * duplicar entradas.
 */
function suscribirEventos() {
  if (!contratoLectura) return;
  contratoLectura.removeAllListeners();
  const alCambiar = () => refrescarTodo();
  contratoLectura.on("Deposito", alCambiar);
  contratoLectura.on("ReclamoCreado", alCambiar);
  contratoLectura.on("Aprobacion", alCambiar);
  contratoLectura.on("FondosLiberados", alCambiar);
}

// ───────────────────────────────────────────────────────────────────────────
//  LECTURA Y RENDER
// ───────────────────────────────────────────────────────────────────────────

async function refrescarTodo() {
  await refrescarFondo();
  await refrescarReclamos();
  await cargarHistorial();
}

async function refrescarFondo() {
  if (!contratoLectura) return;
  try {
    const [bal, umbral, admin, guardianes] = await Promise.all([
      contratoLectura.balance(),
      contratoLectura.umbral(),
      contratoLectura.admin(),
      contratoLectura.obtenerGuardianes(),
    ]);

    $("balance").textContent = `${ethers.formatEther(bal)} ETH`;
    $("umbral").textContent = `${Number(umbral)} de ${guardianes.length}`;
    $("admin").textContent = nombreDe(admin);
    $("admin").title = admin;

    // ¿La cuenta conectada es guardián?
    soyGuardian = guardianes.some((g) => g.toLowerCase() === cuentaActual);
    $("btn-crear-reclamo").disabled = !redOk || !soyGuardian;

    // Métricas del dashboard (cantidad de guardianes + rol de la wallet).
    const elCant = $("stat-guardianes");
    if (elCant) elCant.textContent = guardianes.length;
    const elRol = $("mi-rol");
    if (elRol) {
      elRol.textContent = soyGuardian ? "Guardián" : "Invitado";
      elRol.className = soyGuardian ? "pill pill-ok" : "pill pill-muted";
    }

    // Render de la lista de guardianes
    const ul = $("lista-guardianes");
    ul.innerHTML = "";
    guardianes.forEach((g) => {
      const li = document.createElement("li");
      const esYo = g.toLowerCase() === cuentaActual;
      // Mostramos el nombre del integrante y, en chico, su dirección.
      li.innerHTML =
        `<span><strong>${escaparHtml(nombreDe(g))}</strong> ` +
        `<span class="mono" style="opacity:.6">${acortar(g)}</span></span>` +
        (esYo ? `<span class="etiqueta-yo">vos</span>` : "");
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
        <div class="reclamo-id">Reclamo #${id} · abierto por ${escaparHtml(nombreDe(solicitante))}</div>
        <p class="reclamo-desc">${escaparHtml(descripcion)}</p>
      </div>
      <span class="estado ${CLASE_ESTADO[estado]}">${NOMBRE_ESTADO[estado]}</span>
    </div>
    <div class="reclamo-meta">
      <span>💵 Monto a liberar: <strong>${ethers.formatEther(monto)} ETH</strong></span>
      <span>📤 Se libera a: <strong>${escaparHtml(nombreDe(solicitante))}</strong> <span class="mono" style="opacity:.6">${acortar(solicitante)}</span></span>
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
    $("input-deposito").value = "";
    await refrescarTodo();
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
    $("input-descripcion").value = "";
    $("input-monto-reclamo").value = "";
    $("input-evidencia").value = "";
    $("hash-preview").textContent = "";
    await refrescarTodo();
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
  $("btn-conectar").addEventListener("click", conectarDesdeBoton);
  $("btn-depositar").addEventListener("click", depositar);
  $("btn-crear-reclamo").addEventListener("click", crearReclamo);
  $("btn-refrescar").addEventListener("click", refrescarTodo);

  // Tema claro/oscuro. El tema ya se aplicó en <head> (anti-parpadeo);
  // acá sincronizamos el ícono del botón y manejamos el toggle.
  const sincronizarIconoTema = () => {
    const esClaro = document.documentElement.classList.contains("light");
    $("btn-tema").textContent = esClaro ? "🌙" : "☀️";
  };
  sincronizarIconoTema();
  $("btn-tema").addEventListener("click", () => {
    const esClaro = document.documentElement.classList.toggle("light");
    try { localStorage.setItem("fv-tema", esClaro ? "light" : "dark"); } catch (e) {}
    sincronizarIconoTema();
  });

  // Sidebar: resaltar el ítem activo al navegar entre secciones.
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
    });
  });

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

  // Reconexión automática: si esta wallet ya autorizó el sitio antes, nos
  // conectamos solos al recargar (sin abrir el popup de MetaMask). Usamos
  // eth_accounts, que NO pide permiso (a diferencia de eth_requestAccounts).
  if (typeof window.ethereum !== "undefined") {
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((cuentas) => {
        if (cuentas && cuentas.length > 0) {
          conectarWallet();
        }
      })
      .catch(() => { /* sin permisos previos: el usuario tendrá que conectar a mano */ });
  }
});
