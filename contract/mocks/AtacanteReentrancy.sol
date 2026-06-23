// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../FamilyVault.sol";

/**
 * @title AtacanteReentrancy — contrato malicioso para PROBAR la defensa anti-reentrancy
 * @notice Solo se usa en los tests. Simula a un guardián que, al recibir los
 *         fondos liberados, intenta volver a entrar (`aprobar`) para drenar más
 *         ETH del que le corresponde. La bóveda debe impedirlo gracias al patrón
 *         checks-effects-interactions (marca Liberado antes de transferir) y al
 *         candado noReentrante.
 */
contract AtacanteReentrancy {
    FamilyVault public vault;
    uint256 public idObjetivo;
    bool public intentoReentrar;

    /// @dev El vault se setea después porque su constructor necesita esta dirección como guardián.
    function setVault(address _vault) external {
        vault = FamilyVault(payable(_vault));
    }

    /// @notice El atacante (guardián) abre un reclamo a su favor.
    function crear(uint256 monto) external {
        idObjetivo = vault.crearReclamo("ataque reentrancy", bytes32(0), monto);
    }

    /// @notice El atacante aprueba el reclamo (puede ser el que dispara la liberación).
    function aprobar(uint256 id) external {
        vault.aprobar(id);
    }

    /// @dev Al recibir los fondos, intenta reentrar. La bóveda debe rechazarlo;
    ///      atrapamos el fallo para que la transferencia legítima no revierta y
    ///      el test pueda verificar que NO se drenó ETH de más.
    receive() external payable {
        if (!intentoReentrar) {
            intentoReentrar = true;
            try vault.aprobar(idObjetivo) {
                // Si esto NO revierte, la defensa falló (el test lo detectará).
            } catch {
                // Esperado: la reentrada es rechazada.
            }
        }
    }
}
