// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FamilyVault.sol";

/**
 * @title FamilyVaultFactory — Fábrica de bóvedas familiares
 * @notice Permite que CUALQUIER familia cree su propia bóveda (FamilyVault) con
 *         un solo llamado, sin programar ni desplegar a mano. Es la pieza que
 *         habilita el "uso masivo": una sola Factory desplegada sirve a miles de
 *         familias, cada una con su contrato independiente.
 *
 * @dev    Patrón Factory: `crearBoveda` despliega una nueva instancia de
 *         FamilyVault y guarda su dirección. El frontend puede listar todas las
 *         bóvedas o las de un creador puntual. Nada de bases de datos: el registro
 *         vive en la cadena.
 *
 *         Nota: en las bóvedas creadas por la Factory, el `admin` del FamilyVault
 *         es la propia Factory (no un humano), por lo que esas bóvedas funcionan
 *         de forma más descentralizada: solo el solicitante puede cancelar su
 *         propio reclamo y la configuración queda fija desde su creación.
 */
contract FamilyVaultFactory {
    /// @notice Todas las bóvedas creadas a través de esta fábrica.
    address[] public bovedas;

    /// @notice Bóvedas creadas por cada dirección (creador => lista de bóvedas).
    mapping(address => address[]) public bovedasDe;

    event BovedaCreada(address indexed creador, address boveda, uint256 indice);

    /**
     * @notice Crea una nueva bóveda familiar.
     * @param guardianes Direcciones de los integrantes de la familia.
     * @param umbral     Aprobaciones necesarias para liberar (1 <= umbral <= N).
     * @return boveda    Dirección del FamilyVault recién desplegado.
     */
    function crearBoveda(address[] memory guardianes, uint256 umbral)
        external
        returns (address boveda)
    {
        FamilyVault v = new FamilyVault(guardianes, umbral);
        boveda = address(v);
        bovedas.push(boveda);
        bovedasDe[msg.sender].push(boveda);
        emit BovedaCreada(msg.sender, boveda, bovedas.length - 1);
    }

    /// @notice Cantidad total de bóvedas creadas por la fábrica.
    function cantidadBovedas() external view returns (uint256) {
        return bovedas.length;
    }

    /// @notice Lista completa de bóvedas creadas.
    function obtenerBovedas() external view returns (address[] memory) {
        return bovedas;
    }

    /// @notice Lista de bóvedas creadas por un usuario puntual.
    function bovedasDeUsuario(address usuario) external view returns (address[] memory) {
        return bovedasDe[usuario];
    }
}
