/**
 * config.js — Configuración de la dApp FamilyVault
 *
 * Acá se conecta el frontend con el contrato desplegado. Después de desplegar
 * FamilyVault.sol en Remix sobre Sepolia, completá CONTRACT_ADDRESS con la
 * dirección que te devuelve Remix.
 *
 * El ABI se incluye embebido (CONTRACT_ABI) para que la app funcione también
 * abierta como archivo local (file://) sin problemas de CORS al hacer fetch.
 * Si recompilás el contrato en Remix y cambia la interfaz, reemplazá este ABI
 * por el exacto (es el mismo contenido que contract/FamilyVault.abi.json).
 */

// ── Dirección del contrato desplegado en Sepolia ───────────────────────────
// TODO: pegar acá la dirección que devuelve Remix tras el deploy.
const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";

// ── Red esperada: Sepolia testnet ──────────────────────────────────────────
const NETWORK = {
  chainIdDec: 11155111,
  chainIdHex: "0xaa36a7", // 11155111 en hexadecimal
  nombre: "Sepolia",
  explorador: "https://sepolia.etherscan.io",
};

// ── ABI del contrato (espejo de contract/FamilyVault.abi.json) ─────────────
const CONTRACT_ABI = [
  {
    "inputs": [
      { "internalType": "address[]", "name": "_guardianes", "type": "address[]" },
      { "internalType": "uint256", "name": "_umbral", "type": "uint256" },
      { "internalType": "address", "name": "_beneficiario", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "idReclamo", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "guardian", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "aprobaciones", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "umbral", "type": "uint256" }
    ],
    "name": "Aprobacion",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "origen", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "monto", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "nuevoBalance", "type": "uint256" }
    ],
    "name": "Deposito",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "idReclamo", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "beneficiario", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "monto", "type": "uint256" }
    ],
    "name": "FondosLiberados",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "idReclamo", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "solicitante", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "descripcion", "type": "string" },
      { "indexed": false, "internalType": "bytes32", "name": "hashEvidencia", "type": "bytes32" },
      { "indexed": false, "internalType": "uint256", "name": "monto", "type": "uint256" }
    ],
    "name": "ReclamoCreado",
    "type": "event"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "idReclamo", "type": "uint256" }],
    "name": "aprobar",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" },
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "name": "aprobadoPor",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "balance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "beneficiario",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "cantidadGuardianes",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "cantidadReclamos",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "descripcion", "type": "string" },
      { "internalType": "bytes32", "name": "hashEvidencia", "type": "bytes32" },
      { "internalType": "uint256", "name": "monto", "type": "uint256" }
    ],
    "name": "crearReclamo",
    "outputs": [{ "internalType": "uint256", "name": "idReclamo", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "depositar",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "esGuardian",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "guardianes",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "obtenerGuardianes",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "idReclamo", "type": "uint256" }],
    "name": "obtenerReclamo",
    "outputs": [
      { "internalType": "address", "name": "solicitante", "type": "address" },
      { "internalType": "string", "name": "descripcion", "type": "string" },
      { "internalType": "bytes32", "name": "hashEvidencia", "type": "bytes32" },
      { "internalType": "uint256", "name": "monto", "type": "uint256" },
      { "internalType": "uint256", "name": "aprobaciones", "type": "uint256" },
      { "internalType": "uint8", "name": "estado", "type": "uint8" },
      { "internalType": "uint256", "name": "creadoEn", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "reclamos",
    "outputs": [
      { "internalType": "address", "name": "solicitante", "type": "address" },
      { "internalType": "string", "name": "descripcion", "type": "string" },
      { "internalType": "bytes32", "name": "hashEvidencia", "type": "bytes32" },
      { "internalType": "uint256", "name": "monto", "type": "uint256" },
      { "internalType": "uint256", "name": "aprobaciones", "type": "uint256" },
      { "internalType": "uint8", "name": "estado", "type": "uint8" },
      { "internalType": "uint256", "name": "creadoEn", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "umbral",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "idReclamo", "type": "uint256" },
      { "internalType": "address", "name": "guardian", "type": "address" }
    ],
    "name": "yaAprobo",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  { "stateMutability": "payable", "type": "receive" }
];
