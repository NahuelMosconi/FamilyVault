require("@nomicfoundation/hardhat-toolbox");

/**
 * Configuración mínima de Hardhat para correr los tests del contrato.
 *
 * El contrato vive en `contract/` (no en el `contracts/` por defecto), así que
 * apuntamos `paths.sources` a esa carpeta. Los tests están en `test/`.
 *
 * Para correrlos:
 *   npm install
 *   npx hardhat test
 *
 * (Estos tests usan la red en memoria de Hardhat; no necesitan Sepolia ni gas.)
 */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./contract",
    tests: "./test",
  },
};
