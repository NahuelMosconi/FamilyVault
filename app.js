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
let adminAddr = null;      // dirección del admin (minúsculas, para permisos de cancelar)

// Nombres legibles de los estados (índice = enum del contrato)
const NOMBRE_ESTADO = ["Abierto", "Pendiente", "Aprobado", "Liberado", "Cancelado"];
const CLASE_ESTADO = ["estado-abierto", "estado-pendiente", "estado-aprobado", "estado-liberado", "estado-cancelado"];
// Explicación de cada estado (tooltip al pasar el mouse).
const TOOLTIP_ESTADO = [
  "Abierto: reclamo recién creado, sin aprobaciones todavía.",
  "Pendiente: tiene aprobaciones pero aún no llega al umbral.",
  "Aprobado: alcanzó el umbral (estado transitorio antes de transferir).",
  "Liberado: se alcanzó el umbral y los fondos se enviaron al solicitante.",
  "Cancelado: anulado por el solicitante o el admin antes de liberarse.",
];

// Filtro activo de la lista de reclamos ("activos" | "liberados" | "cancelados" | "todos")
let filtroReclamos = "activos";

// Acumuladores de estadísticas (se completan al cargar el historial)
let totalDepositado = 0n;
let totalLiberado = 0n;

// ── Atajos al DOM ──────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ───────────────────────────────────────────────────────────────────────────
//  BÓVEDA ACTIVA (multi-familia) — selección de a qué contrato se conecta la app
// ───────────────────────────────────────────────────────────────────────────
//
//  La app puede operar sobre CUALQUIER bóveda (no una sola fija). La dirección
//  de la bóveda activa se guarda en localStorage. Si no hay ninguna elegida, se
//  muestra la pantalla (gate) para crear una nueva o entrar a una por dirección.
//  Esto es lo que permite el "uso masivo sin base de datos": cada familia tiene
//  su contrato y la blockchain es el registro común.

const LS_BOVEDA = "fv-boveda-actual";   // dirección de la bóveda activa
const LS_RECIENTES = "fv-bovedas";      // [{address, nombre}] bóvedas usadas en este dispositivo

let VAULT_ADDRESS = null;               // dirección de la bóveda activa (resuelta al iniciar)
let nuevosMiembros = [];                // direcciones cargadas al crear una bóveda

function bovedaGuardada() {
  try { return localStorage.getItem(LS_BOVEDA); } catch (_) { return null; }
}
function getRecientes() {
  try { return JSON.parse(localStorage.getItem(LS_RECIENTES) || "[]"); } catch (_) { return []; }
}
function guardarReciente(address, nombre) {
  const lista = getRecientes().filter((b) => b.address.toLowerCase() !== address.toLowerCase());
  lista.unshift({ address, nombre: nombre || "" });
  try { localStorage.setItem(LS_RECIENTES, JSON.stringify(lista.slice(0, 8))); } catch (_) {}
}
function quitarReciente(address) {
  const lista = getRecientes().filter((b) => b.address.toLowerCase() !== address.toLowerCase());
  try { localStorage.setItem(LS_RECIENTES, JSON.stringify(lista)); } catch (_) {}
  renderRecientes();
}
function setBovedaActiva(address, nombre) {
  VAULT_ADDRESS = address;
  try { localStorage.setItem(LS_BOVEDA, address); } catch (_) {}
  guardarReciente(address, nombre);
}

/** Muestra el panel de la bóveda (oculta el gate) y arranca la lectura. */
async function mostrarDashboard() {
  $("gate").hidden = true;
  $("app-shell").hidden = false;
  // Datos de la bóveda en el sidebar.
  const rec = getRecientes().find((b) => b.address.toLowerCase() === VAULT_ADDRESS.toLowerCase());
  const nombre = (rec && rec.nombre) || "Bóveda familiar";
  if ($("side-vault-name")) $("side-vault-name").textContent = nombre;
  if ($("side-vault-addr")) $("side-vault-addr").textContent = acortar(VAULT_ADDRESS);

  // Si la wallet ya autorizó antes este sitio, conectamos full (permite operar).
  // Si no, mostramos la bóveda en modo lectura con un RPC público.
  let autorizada = false;
  if (typeof window.ethereum !== "undefined") {
    try {
      const cuentas = await window.ethereum.request({ method: "eth_accounts" });
      autorizada = cuentas && cuentas.length > 0;
    } catch (_) {}
  }
  if (autorizada) {
    await conectarWallet();
  } else {
    await inicializarLectura();
  }
}

/** Vuelve a la pantalla de selección de bóveda. */
function mostrarGate() {
  $("app-shell").hidden = true;
  $("gate").hidden = false;
  renderRecientes();
}

/** Inicializa la app en modo SOLO LECTURA (sin wallet) usando un RPC público. */
async function inicializarLectura() {
  if (!VAULT_ADDRESS) return;
  try {
    provider = new ethers.JsonRpcProvider(NETWORK.rpc);
    contratoLectura = new ethers.Contract(VAULT_ADDRESS, CONTRACT_ABI, provider);
    contrato = null;
    soyGuardian = false;
    cuentaActual = null;
    habilitarControles(false);
    await refrescarTodo();
    mostrarAviso("Estás viendo la bóveda en modo lectura. Conectá tu wallet para depositar o aprobar.", false);
  } catch (err) {
    mostrarAviso("No se pudo leer la bóveda: " + mensajeDeError(err), true);
  }
}

// ── Gate: crear / entrar a una bóveda ──────────────────────────────────────

function renderRecientes() {
  const cont = $("gate-recientes-list");
  if (!cont) return;
  const lista = getRecientes();
  if (lista.length === 0) {
    cont.innerHTML = `<p class="vacio" style="text-align:center">Todavía no usaste ninguna bóveda en este dispositivo.</p>`;
    return;
  }
  cont.innerHTML = "";
  lista.forEach((b) => {
    const btn = document.createElement("button");
    btn.className = "gate-reciente";
    btn.innerHTML =
      `<div class="gate-reciente-info"><strong>${escaparHtml(b.nombre || "Bóveda familiar")}</strong>` +
      `<span class="mono">${b.address}</span></div>` +
      `<svg class="ico" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>`;
    btn.onclick = () => { setBovedaActiva(b.address, b.nombre); mostrarDashboard(); };
    cont.appendChild(btn);
  });
}

function renderMiembrosChips() {
  const cont = $("miembros-chips");
  if (!cont) return;
  cont.innerHTML = "";
  nuevosMiembros.forEach((dir) => {
    const chip = document.createElement("span");
    chip.className = "chip-addr";
    chip.innerHTML = `${acortar(dir)} <button title="Quitar">×</button>`;
    chip.querySelector("button").onclick = () => {
      nuevosMiembros = nuevosMiembros.filter((d) => d !== dir);
      renderMiembrosChips();
      actualizarAyudaUmbral();
    };
    cont.appendChild(chip);
  });
}
function actualizarAyudaUmbral() {
  const help = document.querySelector("#nuevo-umbral")?.closest(".umbral-row")?.querySelector(".field-help");
  if (help) help.textContent = `de ${nuevosMiembros.length || "—"} integrantes deben aprobar para liberar.`;
}

function agregarMiembro() {
  const inp = $("nuevo-miembro");
  const v = inp.value.trim();
  if (!v) return;
  if (!ethers.isAddress(v)) { toast("Esa dirección no es válida.", "error"); return; }
  const norm = ethers.getAddress(v);
  if (nuevosMiembros.some((d) => d.toLowerCase() === norm.toLowerCase())) {
    toast("Esa wallet ya está en la lista.", "info"); inp.value = ""; return;
  }
  nuevosMiembros.push(norm);
  inp.value = "";
  renderMiembrosChips();
  actualizarAyudaUmbral();
}

async function crearBovedaUI() {
  ocultarAviso();
  if (nuevosMiembros.length < 2) { toast("Agregá al menos 2 integrantes.", "error"); return; }
  const umbral = Number($("nuevo-umbral").value);
  if (!umbral || umbral < 1 || umbral > nuevosMiembros.length) {
    toast(`El umbral debe estar entre 1 y ${nuevosMiembros.length}.`, "error"); return;
  }
  if (!FACTORY_ADDRESS || FACTORY_ADDRESS === "0x0000000000000000000000000000000000000000") {
    mostrarGate();
    mostrarAvisoGate(
      "Para crear bóvedas nuevas hay que desplegar el contrato FamilyVaultFactory una vez en Sepolia y " +
      "pegar su dirección en config.js (FACTORY_ADDRESS). Mientras tanto, podés ENTRAR a una bóveda existente por su dirección."
    );
    return;
  }
  try {
    await conectarWallet();
    if (!redOk) { toast("Cambiá la red a Sepolia para crear la bóveda.", "error"); return; }
    mostrarOverlay("Creando la bóveda… confirmá en MetaMask.");
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    const tx = await factory.crearBoveda(nuevosMiembros, umbral);
    mostrarOverlay("Desplegando el contrato de tu familia en Sepolia…");
    const recibo = await tx.wait();
    // Buscamos la dirección de la bóveda recién creada en el evento BovedaCreada.
    let nuevaDir = null;
    for (const log of recibo.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed && parsed.name === "BovedaCreada") { nuevaDir = parsed.args.boveda; break; }
      } catch (_) {}
    }
    if (!nuevaDir) { toast("La bóveda se creó pero no se pudo leer su dirección. Entrá por dirección.", "error"); return; }
    setBovedaActiva(nuevaDir, "Mi bóveda familiar");
    toast("¡Bóveda creada! Ya podés operar con tu familia.", "ok", 6000);
    await mostrarDashboard();
  } catch (err) {
    mostrarAviso(mensajeDeError(err), true);
  } finally {
    ocultarOverlay();
  }
}

function entrarBovedaUI() {
  const v = $("entrar-direccion").value.trim();
  if (!ethers.isAddress(v)) { toast("Pegá una dirección de contrato válida (0x…).", "error"); return; }
  setBovedaActiva(ethers.getAddress(v), "");
  mostrarDashboard();
}

/** Aviso dentro del gate (no del dashboard). */
function mostrarAvisoGate(msg) {
  let el = $("gate-aviso");
  if (!el) {
    el = document.createElement("div");
    el.id = "gate-aviso";
    el.className = "aviso";
    el.style.margin = "0 auto 24px";
    el.style.maxWidth = "640px";
    const inner = document.querySelector(".gate-inner");
    inner.insertBefore(el, inner.querySelector(".gate-grid"));
  }
  el.textContent = msg;
  el.hidden = false;
}

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

/**
 * Muestra una notificación tipo "toast" arriba a la derecha.
 * @param {string} mensaje  Texto a mostrar.
 * @param {"info"|"ok"|"error"} tipo  Estilo de la notificación.
 * @param {number} duracion  Milisegundos hasta que se va sola.
 */
function toast(mensaje, tipo = "info", duracion = 4500) {
  const cont = $("toasts");
  if (!cont) return;
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  const ICOS = {
    ok: `<svg class="ico" viewBox="0 0 24 24" style="color:var(--ok)"><path d="M5 12l4 4L19 6"/></svg>`,
    error: `<svg class="ico" viewBox="0 0 24 24" style="color:var(--danger)"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>`,
    info: `<svg class="ico" viewBox="0 0 24 24" style="color:var(--brand)"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>`,
  };
  t.innerHTML = `<span class="toast-ico">${ICOS[tipo] || ICOS.info}</span><span>${mensaje}</span>`;
  cont.appendChild(t);
  // Forzamos reflow para animar la entrada.
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, duracion);
}

/** Lanza una lluvia de confeti (celebración al liberar fondos). */
function confetti() {
  const cont = $("confetti");
  if (!cont) return;
  const colores = ["#6366f1", "#8b5cf6", "#a855f7", "#34d399", "#fbbf24", "#f87171"];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement("i");
    p.className = "confeti";
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colores[i % colores.length];
    p.style.animationDelay = Math.random() * 0.5 + "s";
    p.style.animationDuration = 2.2 + Math.random() * 1.4 + "s";
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    cont.appendChild(p);
    setTimeout(() => p.remove(), 4200);
  }
}

/** Celebración cuando se liberan fondos: confeti + toast. */
function celebrarLiberacion(montoStr, nombre) {
  confetti();
  toast(`¡Fondos liberados! ${montoStr} ETH para ${nombre}`, "ok", 6000);
}

/** Copia un texto al portapapeles y avisa. */
async function copiar(texto, etiqueta = "Dirección") {
  try {
    await navigator.clipboard.writeText(texto);
    toast(`${etiqueta} copiada al portapapeles`, "info", 2500);
  } catch (_) {
    toast("No se pudo copiar", "error", 2500);
  }
}

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
      return `Depósito de ${ethers.formatEther(a.monto)} ETH por ${nombreDe(a.origen)}`;
    case "ReclamoCreado":
      return `Reclamo #${a.idReclamo} creado por ${nombreDe(a.solicitante)} — motivo: "${escaparHtml(a.descripcion)}" (pide ${ethers.formatEther(a.monto)} ETH)`;
    case "Aprobacion":
      return `Aprobación de ${nombreDe(a.guardian)} en reclamo #${a.idReclamo} (${a.aprobaciones}/${a.umbral})`;
    case "FondosLiberados":
      return `Reclamo #${a.idReclamo} LIBERADO: ${ethers.formatEther(a.monto)} ETH → ${nombreDe(a.destino)}`;
    case "ReclamoCancelado":
      return `Reclamo #${a.idReclamo} cancelado por ${nombreDe(a.porQuien)}`;
    case "MetaFijada":
      return `Meta del fondo fijada en ${ethers.formatEther(a.meta)} ETH`;
    case "RotacionPropuesta":
      return `Rotación #${a.idRotacion} propuesta por ${nombreDe(a.proponente)}: ${nombreDe(a.viejo)} → ${nombreDe(a.nuevo)}`;
    case "RotacionAprobada":
      return `Rotación #${a.idRotacion} aprobada por ${nombreDe(a.guardian)} (${a.aprobaciones}/${a.umbral})`;
    case "GuardianRotado":
      return `Guardián reemplazado: ${nombreDe(a.viejo)} → ${nombreDe(a.nuevo)}`;
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
    const nombres = ["Deposito", "ReclamoCreado", "Aprobacion", "FondosLiberados",
      "ReclamoCancelado", "MetaFijada", "RotacionPropuesta", "RotacionAprobada", "GuardianRotado"];
    const listas = await Promise.all(nombres.map((n) => contratoLectura.queryFilter(n)));
    // Aplanamos guardando el nombre del evento junto a cada log.
    const eventos = [];
    listas.forEach((lista, i) => lista.forEach((ev) => eventos.push({ ev, nombre: nombres[i] })));

    // Estadísticas: total depositado, histórico liberado y aportes por integrante.
    totalDepositado = 0n;
    totalLiberado = 0n;
    const aportes = {}; // dirección (minúsculas) => total aportado (bigint)
    for (const { ev, nombre } of eventos) {
      if (nombre === "Deposito") {
        totalDepositado += ev.args.monto;
        const k = ev.args.origen.toLowerCase();
        aportes[k] = (aportes[k] || 0n) + ev.args.monto;
      }
      if (nombre === "FondosLiberados") totalLiberado += ev.args.monto;
    }
    const elDep = $("stat-depositado");
    if (elDep) elDep.textContent = `${ethers.formatEther(totalDepositado)} ETH`;
    const elLib = $("stat-liberado");
    if (elLib) elLib.textContent = `${ethers.formatEther(totalLiberado)} ETH`;
    renderAportes(aportes);

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
  return VAULT_ADDRESS && VAULT_ADDRESS !== "0x0000000000000000000000000000000000000000";
}

async function inicializarContrato() {
  if (!contratoConfigurado()) {
    mostrarAviso(
      "No hay ninguna bóveda seleccionada. Volvé a la pantalla de inicio para crear o entrar a una.",
      true
    );
    return;
  }
  // Instancia para escribir (con signer) y otra para leer (con provider).
  contrato = new ethers.Contract(VAULT_ADDRESS, CONTRACT_ABI, signer);
  contratoLectura = new ethers.Contract(VAULT_ADDRESS, CONTRACT_ABI, provider);

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
  contratoLectura.on("ReclamoCancelado", alCambiar);
  contratoLectura.on("MetaFijada", alCambiar);
  contratoLectura.on("RotacionPropuesta", alCambiar);
  contratoLectura.on("RotacionAprobada", alCambiar);
  contratoLectura.on("GuardianRotado", alCambiar);
  // Liberación: además de refrescar, celebramos (confeti + toast) para todos
  // los que tengan la app abierta. Solo dispara en eventos nuevos, no históricos.
  contratoLectura.on("FondosLiberados", (id, destino, monto) => {
    celebrarLiberacion(ethers.formatEther(monto), nombreDe(destino));
    refrescarTodo();
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  LECTURA Y RENDER
// ───────────────────────────────────────────────────────────────────────────

async function refrescarTodo() {
  await refrescarFondo();
  await refrescarReclamos();
  await refrescarRotaciones();
  await cargarHistorial();
}

async function refrescarFondo() {
  if (!contratoLectura) return;
  try {
    const [bal, umbral, admin, guardianes, meta] = await Promise.all([
      contratoLectura.balance(),
      contratoLectura.umbral(),
      contratoLectura.admin(),
      contratoLectura.obtenerGuardianes(),
      contratoLectura.meta(),
    ]);

    $("balance").textContent = `${ethers.formatEther(bal)} ETH`;
    $("umbral").textContent = `${Number(umbral)} de ${guardianes.length}`;
    $("admin").textContent = nombreDe(admin);
    $("admin").title = admin;
    adminAddr = admin.toLowerCase();

    // ¿La cuenta conectada es guardián?
    soyGuardian = guardianes.some((g) => g.toLowerCase() === cuentaActual);
    $("btn-crear-reclamo").disabled = !redOk || !soyGuardian;

    // Meta del fondo: barra de progreso + control para el admin.
    actualizarMeta(bal, meta);
    const esAdmin = cuentaActual === adminAddr;
    const mc = $("meta-control");
    if (mc) mc.hidden = !esAdmin;

    // Recuperación de guardianes: mostramos el form a los guardianes y llenamos el select.
    const rf = $("rotacion-form");
    if (rf) rf.hidden = !soyGuardian || !redOk;
    const sel = $("rot-viejo");
    if (sel) {
      sel.innerHTML = "";
      guardianes.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = `${nombreDe(g)} (${acortar(g)})`;
        sel.appendChild(opt);
      });
    }

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
      // Nombre + dirección + acciones (copiar / ver en Etherscan).
      li.innerHTML =
        `<span class="g-info"><strong>${escaparHtml(nombreDe(g))}</strong> ` +
        `<span class="mono" style="opacity:.6">${acortar(g)}</span></span>` +
        (esYo ? `<span class="etiqueta-yo">vos</span>` : "") +
        `<span class="g-acciones">` +
        `<button class="mini-btn" title="Copiar dirección" data-copiar="${g}">⧉</button>` +
        `<a class="mini-btn" title="Ver en Etherscan" target="_blank" rel="noopener" href="${NETWORK.explorador}/address/${g}">↗</a>` +
        `</span>`;
      ul.appendChild(li);
    });
    // Enganchamos los botones de copiar (delegación simple).
    ul.querySelectorAll("[data-copiar]").forEach((b) =>
      b.addEventListener("click", () => copiar(b.getAttribute("data-copiar")))
    );

    if (!soyGuardian) {
      // Aviso suave (no error) si no sos guardián.
      // No usamos mostrarAviso para no tapar avisos de red.
    }
  } catch (err) {
    mostrarAviso("No se pudo leer el fondo: " + mensajeDeError(err), true);
  }
}

/** Actualiza la barra y el texto de la meta del fondo. */
function actualizarMeta(balance, meta) {
  const fill = $("meta-fill");
  const texto = $("meta-texto");
  if (!fill || !texto) return;
  if (meta && meta > 0n) {
    const pct = Math.min(100, Number((balance * 10000n) / meta) / 100);
    fill.style.width = pct + "%";
    texto.textContent =
      `${ethers.formatEther(balance)} / ${ethers.formatEther(meta)} ETH (${pct.toFixed(1)}%)` +
      (balance >= meta ? " — ¡Meta alcanzada!" : "");
  } else {
    fill.style.width = "0%";
    texto.textContent = "Sin meta fijada.";
  }
}

/** Renderiza el ranking de aportes por integrante (desde los eventos Deposito). */
function renderAportes(aportes) {
  const ul = $("lista-aportes");
  if (!ul) return;
  const entradas = Object.entries(aportes).sort((a, b) => (b[1] > a[1] ? 1 : -1));
  if (entradas.length === 0) {
    ul.innerHTML = `<li class="vacio">Todavía no hay depósitos.</li>`;
    return;
  }
  const max = entradas[0][1];
  ul.innerHTML = "";
  entradas.forEach(([dir, monto], i) => {
    const pct = max > 0n ? Number((monto * 10000n) / max) / 100 : 0;
    const li = document.createElement("li");
    li.innerHTML =
      `<div class="aporte-top"><span><span class="aporte-rank">${i + 1}.</span> <strong>${escaparHtml(nombreDe(dir))}</strong></span>` +
      `<span class="mono">${ethers.formatEther(monto)} ETH</span></div>` +
      `<div class="barra"><div class="barra-fill" style="width:${pct}%"></div></div>`;
    ul.appendChild(li);
  });
}

/** Lee y renderiza las propuestas de rotación de guardianes (recuperación social). */
async function refrescarRotaciones() {
  if (!contratoLectura) return;
  const cont = $("lista-rotaciones");
  if (!cont) return;
  try {
    const total = Number(await contratoLectura.cantidadRotaciones());
    if (total === 0) {
      cont.innerHTML = `<li class="vacio">Sin propuestas de rotación.</li>`;
      return;
    }
    const ids = Array.from({ length: total }, (_, i) => i);
    const datos = await Promise.all(ids.map((i) => contratoLectura.obtenerRotacion(i)));
    const umbral = Number(await contratoLectura.umbral());

    cont.innerHTML = "";
    for (let i = total - 1; i >= 0; i--) {
      const [viejo, nuevo, aprob, ejecutada] = datos[i];
      const li = document.createElement("li");
      li.className = "rotacion-item";
      const estadoTxt = ejecutada
        ? `<span class="estado estado-aprobado">Aplicada ✓</span>`
        : `<span class="estado estado-pendiente">${Number(aprob)}/${umbral}</span>`;
      li.innerHTML =
        `<div><strong>${escaparHtml(nombreDe(viejo))}</strong> → <strong>${escaparHtml(nombreDe(nuevo))}</strong>` +
        `<div class="mono" style="opacity:.6;font-size:11px">${acortar(viejo)} → ${acortar(nuevo)}</div></div>` +
        `<div class="rot-foot">${estadoTxt}</div>`;
      // Botón aprobar si soy guardián, no ejecutada y no aprobé.
      if (soyGuardian && !ejecutada) {
        let yaAprobe = false;
        try { yaAprobe = await contratoLectura.yaAproboRotacion(i, cuentaActual); } catch (_) {}
        const btn = document.createElement("button");
        btn.className = "btn btn-aprobar";
        btn.textContent = yaAprobe ? "Ya aprobaste" : "Aprobar";
        btn.disabled = yaAprobe || !redOk;
        btn.onclick = () => aprobarRotacionUI(i);
        li.querySelector(".rot-foot").appendChild(btn);
      }
      cont.appendChild(li);
    }
  } catch (err) {
    cont.innerHTML = `<li class="vacio">No se pudieron leer las rotaciones.</li>`;
  }
}

// ¿Pasa el reclamo el filtro activo? (según su estado)
function pasaFiltro(estado) {
  if (filtroReclamos === "todos") return true;
  if (filtroReclamos === "liberados") return estado === 3;
  if (filtroReclamos === "cancelados") return estado === 4;
  return estado === 0 || estado === 1 || estado === 2; // "activos"
}

async function refrescarReclamos() {
  if (!contratoLectura) return;
  const cont = $("lista-reclamos");
  try {
    const total = Number(await contratoLectura.cantidadReclamos());
    const elReclamos = $("stat-reclamos");
    if (elReclamos) elReclamos.textContent = total;

    if (total === 0) {
      cont.innerHTML = `<p class="vacio">Todavía no hay reclamos. Si sos guardián, podés reportar una emergencia.</p>`;
      return;
    }

    const umbral = Number(await contratoLectura.umbral());
    // Traemos todos los reclamos en paralelo.
    const ids = Array.from({ length: total }, (_, i) => i);
    const datos = await Promise.all(ids.map((i) => contratoLectura.obtenerReclamo(i)));

    cont.innerHTML = "";
    // Mostramos del más nuevo al más viejo, aplicando el filtro.
    let mostrados = 0;
    for (let i = total - 1; i >= 0; i--) {
      if (!pasaFiltro(Number(datos[i][5]))) continue;
      cont.appendChild(await renderReclamo(i, datos[i], umbral));
      mostrados++;
    }
    if (mostrados === 0) {
      cont.innerHTML = `<p class="vacio">No hay reclamos en esta vista. Probá con otro filtro.</p>`;
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
    ? `<span>Hash evidencia: <span class="mono">${acortar(hashEvidencia)}</span></span>`
    : "";

  const esFinal = estado === 3 || estado === 4; // Liberado o Cancelado

  // ¿Puede esta wallet aprobar? Solo guardián, reclamo no finalizado, y que no haya aprobado ya.
  let puedeAprobar = false;
  if (soyGuardian && !esFinal) {
    try {
      const yaAprobo = await contratoLectura.yaAprobo(id, cuentaActual);
      puedeAprobar = !yaAprobo;
    } catch (_) { puedeAprobar = false; }
  }

  // ¿Puede cancelar? El solicitante o el admin, si todavía no es final.
  const puedeCancelar = !esFinal && (
    cuentaActual === solicitante.toLowerCase() || cuentaActual === adminAddr
  );

  div.innerHTML = `
    <div class="reclamo-head">
      <div>
        <div class="reclamo-id">Reclamo #${id} · abierto por ${escaparHtml(nombreDe(solicitante))}</div>
        <p class="reclamo-desc">${escaparHtml(descripcion)}</p>
      </div>
      <span class="estado ${CLASE_ESTADO[estado]}" title="${TOOLTIP_ESTADO[estado]}">${NOMBRE_ESTADO[estado]}</span>
    </div>
    <div class="reclamo-meta">
      <span>Monto a liberar: <strong>${ethers.formatEther(monto)} ETH</strong></span>
      <span>Se libera a: <strong>${escaparHtml(nombreDe(solicitante))}</strong> <span class="mono" style="opacity:.6">${acortar(solicitante)}</span></span>
      <span>Creado: ${fecha}</span>
      ${evidencia}
    </div>
    <div class="reclamo-foot">
      <div class="progreso">
        <span>${aprobaciones}/${umbral}</span>
        <div class="barra"><div class="barra-fill" style="width:${pct}%"></div></div>
      </div>
    </div>
  `;

  // Acciones del reclamo (aprobar / cancelar) o etiqueta de estado final.
  const foot = div.querySelector(".reclamo-foot");
  const acciones = document.createElement("div");
  acciones.className = "reclamo-acciones";

  if (estado === 3) {
    const ok = document.createElement("span");
    ok.className = "estado estado-liberado";
    ok.textContent = "Fondos liberados ✓";
    acciones.appendChild(ok);
  } else if (estado === 4) {
    const c = document.createElement("span");
    c.className = "estado estado-cancelado";
    c.textContent = "Cancelado ✕";
    acciones.appendChild(c);
  } else {
    if (soyGuardian) {
      const btn = document.createElement("button");
      btn.className = "btn btn-aprobar";
      btn.textContent = puedeAprobar ? "Aprobar" : "Ya aprobaste";
      btn.disabled = !puedeAprobar || !redOk;
      btn.onclick = () => aprobarReclamo(id);
      acciones.appendChild(btn);
    }
    if (puedeCancelar) {
      const btnC = document.createElement("button");
      btnC.className = "btn btn-cancelar";
      btnC.textContent = "Cancelar";
      btnC.disabled = !redOk;
      btnC.onclick = () => cancelarReclamo(id);
      acciones.appendChild(btnC);
    }
  }
  foot.appendChild(acciones);

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

async function cancelarReclamo(id) {
  ocultarAviso();
  if (!confirm(`¿Seguro que querés cancelar el reclamo #${id}? Esta acción es definitiva.`)) return;
  try {
    mostrarOverlay(`Cancelando reclamo #${id}… confirmá en MetaMask.`);
    const tx = await contrato.cancelarReclamo(id);
    mostrarOverlay("Registrando la cancelación en Sepolia…");
    await tx.wait();
    toast(`Reclamo #${id} cancelado`, "info");
    await refrescarTodo();
  } catch (err) {
    mostrarAviso(mensajeDeError(err), true);
  } finally {
    ocultarOverlay();
  }
}

async function fijarMeta() {
  ocultarAviso();
  const valor = $("input-meta").value.trim();
  if (valor === "" || Number(valor) < 0) { mostrarAviso("Ingresá un monto válido para la meta.", true); return; }
  try {
    mostrarOverlay("Fijando meta… confirmá en MetaMask.");
    const tx = await contrato.fijarMeta(ethers.parseEther(valor));
    mostrarOverlay("Registrando la meta en Sepolia…");
    await tx.wait();
    toast(`Meta fijada en ${valor} ETH`, "ok");
    $("input-meta").value = "";
    await refrescarFondo();
  } catch (err) {
    mostrarAviso(mensajeDeError(err), true);
  } finally {
    ocultarOverlay();
  }
}

async function proponerRotacion() {
  ocultarAviso();
  const viejo = $("rot-viejo").value;
  const nuevo = $("rot-nuevo").value.trim();
  if (!ethers.isAddress(nuevo)) { mostrarAviso("La dirección nueva no es válida.", true); return; }
  try {
    mostrarOverlay("Proponiendo rotación… confirmá en MetaMask.");
    const tx = await contrato.proponerRotacion(viejo, nuevo);
    mostrarOverlay("Registrando la propuesta en Sepolia…");
    await tx.wait();
    toast("Rotación propuesta. Ahora debe aprobarse por consenso.", "ok");
    $("rot-nuevo").value = "";
    await refrescarTodo();
  } catch (err) {
    mostrarAviso(mensajeDeError(err), true);
  } finally {
    ocultarOverlay();
  }
}

async function aprobarRotacionUI(id) {
  ocultarAviso();
  try {
    mostrarOverlay(`Aprobando rotación #${id}… confirmá en MetaMask.`);
    const tx = await contrato.aprobarRotacion(id);
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
  $("btn-meta").addEventListener("click", fijarMeta);
  $("btn-proponer-rotacion").addEventListener("click", proponerRotacion);

  // Tema claro/oscuro. El tema ya se aplicó en <head> (anti-parpadeo);
  // acá sincronizamos el ícono del botón (SVG sol/luna) y manejamos el toggle.
  const ICONO_SOL = `<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
  const ICONO_LUNA = `<svg class="ico" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
  const sincronizarIconoTema = () => {
    const esClaro = document.documentElement.classList.contains("light");
    $("btn-tema").innerHTML = esClaro ? ICONO_LUNA : ICONO_SOL;
  };
  sincronizarIconoTema();
  $("btn-tema").addEventListener("click", () => {
    const esClaro = document.documentElement.classList.toggle("light");
    try { localStorage.setItem("fv-tema", esClaro ? "light" : "dark"); } catch (e) {}
    sincronizarIconoTema();
  });

  // Filtros de la lista de reclamos (Activos / Liberados / Cancelados / Todos).
  document.querySelectorAll("[data-filtro]").forEach((tab) => {
    tab.addEventListener("click", () => {
      filtroReclamos = tab.getAttribute("data-filtro");
      document.querySelectorAll("[data-filtro]").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      refrescarReclamos();
    });
  });

  // Vista previa del hash de evidencia mientras se escribe.
  $("input-evidencia").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    $("hash-preview").textContent = v
      ? "keccak256: " + ethers.keccak256(ethers.toUtf8Bytes(v))
      : "";
  });

  // ── Pantalla de selección de bóveda (gate) ──
  const inpMiembro = $("nuevo-miembro");
  if (inpMiembro) {
    inpMiembro.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); agregarMiembro(); }
    });
    inpMiembro.addEventListener("blur", agregarMiembro);
  }
  if ($("btn-crear-boveda")) $("btn-crear-boveda").addEventListener("click", crearBovedaUI);
  if ($("btn-entrar-boveda")) $("btn-entrar-boveda").addEventListener("click", entrarBovedaUI);
  if ($("entrar-direccion")) $("entrar-direccion").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); entrarBovedaUI(); }
  });
  if ($("btn-cambiar-boveda")) $("btn-cambiar-boveda").addEventListener("click", () => {
    try { localStorage.removeItem(LS_BOVEDA); } catch (_) {}
    VAULT_ADDRESS = null;
    mostrarGate();
  });
  // Reset de los chips de ejemplo del HTML (los reemplaza el estado real).
  nuevosMiembros = [];
  renderMiembrosChips();
  actualizarAyudaUmbral();

  // ── Decidir qué pantalla mostrar al cargar ──
  // Si ya hay una bóveda elegida en este dispositivo, vamos directo al panel
  // (en modo lectura o conectados). Si no, mostramos el gate.
  VAULT_ADDRESS = bovedaGuardada();
  if (contratoConfigurado()) {
    mostrarDashboard();
  } else {
    mostrarGate();
  }
});
