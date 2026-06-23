// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FamilyVault — Bóveda Familiar de Emergencia (fondo multifirma M de N)
 * @author Equipo FamilyVault — Hackathon Teoría de la Computación II
 *
 * @notice Contrato que custodia un fondo de ahorro de emergencia de una familia.
 *         Los fondos SOLO se liberan cuando un mínimo de integrantes (umbral M de N)
 *         certifica en la cadena que ocurrió una emergencia. Así, ninguna persona
 *         sola puede usar mal el dinero y cada liberación queda registrada de forma
 *         pública e inviolable.
 *
 * @dev    MÁQUINA DE ESTADOS (clave para la materia)
 *         Cada reclamo de liberación es una máquina de estados finita:
 *
 *           Abierto ──(aprobar)──► Pendiente ──(umbral M alcanzado)──► Aprobado
 *                                      │                                   │
 *                                      └───────────(aprobar)───────────────┘
 *                                                                          │
 *                                                              (transferencia interna)
 *                                                                          ▼
 *                                                                      Liberado
 *
 *         - Abierto:   reclamo recién creado, 0 aprobaciones.
 *         - Pendiente: tiene al menos 1 aprobación pero todavía no llega al umbral.
 *         - Aprobado:  alcanzó el umbral M; estado transitorio previo a transferir.
 *         - Liberado:  estado final; los fondos ya se enviaron al solicitante.
 *
 *         En la práctica, al alcanzar el umbral el contrato avanza de Aprobado a
 *         Liberado dentro de la misma transacción (atómicamente), aplicando el
 *         patrón checks-effects-interactions.
 */
contract FamilyVault {
    // ───────────────────────────────────────────────────────────────────────
    //  TIPOS
    // ───────────────────────────────────────────────────────────────────────

    /// @notice Estados posibles de un reclamo (los símbolos del autómata).
    enum EstadoReclamo {
        Abierto,    // 0 — creado, sin aprobaciones
        Pendiente,  // 1 — con aprobaciones, por debajo del umbral
        Aprobado,   // 2 — umbral alcanzado (transitorio)
        Liberado,   // 3 — fondos transferidos (final)
        Cancelado   // 4 — anulado por el solicitante o el admin (final)
    }

    /// @notice Estructura de un reclamo de liberación de fondos.
    struct Reclamo {
        address solicitante;     // guardián que abrió el reclamo
        string descripcion;      // descripción del evento de emergencia
        bytes32 hashEvidencia;   // hash opcional de la evidencia (0x0 si no hay)
        uint256 monto;           // monto que se libera al solicitante
        uint256 aprobaciones;    // contador de aprobaciones
        EstadoReclamo estado;    // estado actual en la máquina de estados
        uint256 creadoEn;        // timestamp de creación
    }

    // ───────────────────────────────────────────────────────────────────────
    //  ESTADO DEL CONTRATO
    // ───────────────────────────────────────────────────────────────────────

    /// @notice Administrador que desplegó y configuró el contrato.
    address public admin;

    /// @notice Cantidad de aprobaciones necesarias para liberar (el "M" de M de N).
    uint256 public umbral;

    /// @notice Lista de guardianes (los integrantes de la familia, el "N").
    address[] public guardianes;

    /// @notice Mapa de acceso rápido: ¿esta dirección es guardián?
    mapping(address => bool) public esGuardian;

    /// @notice Todos los reclamos creados (índice = idReclamo).
    Reclamo[] public reclamos;

    /// @notice Registro de qué guardián ya aprobó qué reclamo (evita doble voto).
    ///         aprobadoPor[idReclamo][direccionGuardian] == true si ya aprobó.
    mapping(uint256 => mapping(address => bool)) public aprobadoPor;

    /// @dev Bandera de reentrancy (defensa en profundidad, además de checks-effects-interactions).
    bool private _bloqueado;

    // ───────────────────────────────────────────────────────────────────────
    //  EVENTOS — dejan traza pública para el frontend y el explorador de bloques
    // ───────────────────────────────────────────────────────────────────────

    event Deposito(address indexed origen, uint256 monto, uint256 nuevoBalance);
    event ReclamoCreado(
        uint256 indexed idReclamo,
        address indexed solicitante,
        string descripcion,
        bytes32 hashEvidencia,
        uint256 monto
    );
    event Aprobacion(
        uint256 indexed idReclamo,
        address indexed guardian,
        uint256 aprobaciones,
        uint256 umbral
    );
    /// @dev El destino es el propio solicitante del reclamo (quien pidió la ayuda).
    event FondosLiberados(
        uint256 indexed idReclamo,
        address indexed destino,
        uint256 monto
    );
    /// @dev Un reclamo fue anulado antes de liberarse (por el solicitante o el admin).
    event ReclamoCancelado(uint256 indexed idReclamo, address indexed porQuien);

    // ───────────────────────────────────────────────────────────────────────
    //  MODIFICADORES — control de acceso y validaciones de estado
    // ───────────────────────────────────────────────────────────────────────

    /// @dev Solo el administrador puede ejecutar la función.
    modifier soloAdmin() {
        require(msg.sender == admin, "FamilyVault: solo el admin");
        _;
    }

    /// @dev Solo un guardián registrado puede ejecutar la función.
    modifier soloGuardian() {
        require(esGuardian[msg.sender], "FamilyVault: solo guardianes");
        _;
    }

    /// @dev Verifica que el id de reclamo exista.
    modifier reclamoExiste(uint256 idReclamo) {
        require(idReclamo < reclamos.length, "FamilyVault: reclamo inexistente");
        _;
    }

    /// @dev Candado anti-reentrancy. Aunque seguimos checks-effects-interactions,
    ///      agregamos este guard como defensa en profundidad.
    modifier noReentrante() {
        require(!_bloqueado, "FamilyVault: reentrancy");
        _bloqueado = true;
        _;
        _bloqueado = false;
    }

    // ───────────────────────────────────────────────────────────────────────
    //  CONSTRUCTOR
    // ───────────────────────────────────────────────────────────────────────

    /**
     * @param _guardianes  Direcciones de los integrantes de la familia (N).
     * @param _umbral      Cantidad de aprobaciones necesarias (M). 1 <= M <= N.
     *
     * @dev No hay beneficiario fijo: cuando un reclamo se libera, los fondos van
     *      a quien lo solicitó (el solicitante). Validamos la configuración para
     *      que el contrato no pueda desplegarse en un estado inconsistente
     *      (umbral mayor que la cantidad de guardianes, duplicados, dirección cero).
     */
    constructor(
        address[] memory _guardianes,
        uint256 _umbral
    ) {
        require(_guardianes.length > 0, "FamilyVault: sin guardianes");
        require(
            _umbral > 0 && _umbral <= _guardianes.length,
            "FamilyVault: umbral invalido"
        );

        admin = msg.sender;
        umbral = _umbral;

        // Registramos cada guardián evitando duplicados y la dirección cero.
        for (uint256 i = 0; i < _guardianes.length; i++) {
            address g = _guardianes[i];
            require(g != address(0), "FamilyVault: guardian cero");
            require(!esGuardian[g], "FamilyVault: guardian duplicado");
            esGuardian[g] = true;
            guardianes.push(g);
        }
    }

    // ───────────────────────────────────────────────────────────────────────
    //  DEPÓSITOS
    // ───────────────────────────────────────────────────────────────────────

    /// @notice Cualquiera puede sumar fondos al contrato llamando a depositar().
    function depositar() external payable {
        require(msg.value > 0, "FamilyVault: monto cero");
        emit Deposito(msg.sender, msg.value, address(this).balance);
    }

    /// @notice Permite recibir ETH enviado directo al contrato (sin calldata).
    receive() external payable {
        emit Deposito(msg.sender, msg.value, address(this).balance);
    }

    // ───────────────────────────────────────────────────────────────────────
    //  CICLO DE VIDA DEL RECLAMO (máquina de estados)
    // ───────────────────────────────────────────────────────────────────────

    /**
     * @notice Un guardián abre un reclamo de liberación de fondos.
     * @param descripcion   Texto que describe la emergencia.
     * @param hashEvidencia Hash opcional de la evidencia (usar 0x0 si no hay).
     * @param monto         Monto a liberar; debe ser <= balance del contrato.
     * @return idReclamo    Identificador del reclamo creado.
     *
     * @dev Estado inicial: Abierto. Control de acceso: solo guardianes.
     */
    function crearReclamo(
        string calldata descripcion,
        bytes32 hashEvidencia,
        uint256 monto
    ) external soloGuardian returns (uint256 idReclamo) {
        require(bytes(descripcion).length > 0, "FamilyVault: descripcion vacia");
        require(monto > 0, "FamilyVault: monto cero");
        require(monto <= address(this).balance, "FamilyVault: monto > balance");

        idReclamo = reclamos.length;
        reclamos.push(
            Reclamo({
                solicitante: msg.sender,
                descripcion: descripcion,
                hashEvidencia: hashEvidencia,
                monto: monto,
                aprobaciones: 0,
                estado: EstadoReclamo.Abierto,
                creadoEn: block.timestamp
            })
        );

        emit ReclamoCreado(idReclamo, msg.sender, descripcion, hashEvidencia, monto);
    }

    /**
     * @notice Un guardián aprueba un reclamo. Al alcanzar el umbral, libera fondos.
     * @param idReclamo Identificador del reclamo a aprobar.
     *
     * @dev SEGURIDAD:
     *      - Control de acceso: solo guardianes (modifier soloGuardian).
     *      - Validación de estado: no se puede aprobar un reclamo ya Liberado.
     *      - Anti doble voto: aprobadoPor impide que el mismo guardián apruebe dos veces.
     *      - checks-effects-interactions: ANTES de transferir marcamos el reclamo
     *        como Liberado (effect), y recién después enviamos el ETH (interaction).
     *        Así, si el receptor intentara reentrar, el reclamo ya estaría Liberado
     *        y la guarda de estado abortaría el segundo intento.
     *      - noReentrante: candado adicional de defensa en profundidad.
     */
    function aprobar(uint256 idReclamo)
        external
        soloGuardian
        reclamoExiste(idReclamo)
        noReentrante
    {
        Reclamo storage r = reclamos[idReclamo];

        // CHECKS — validaciones de estado y de acceso
        require(r.estado != EstadoReclamo.Liberado, "FamilyVault: ya liberado");
        require(r.estado != EstadoReclamo.Cancelado, "FamilyVault: reclamo cancelado");
        require(!aprobadoPor[idReclamo][msg.sender], "FamilyVault: ya aprobaste");

        // EFFECTS — registramos la aprobación y avanzamos en la máquina de estados
        aprobadoPor[idReclamo][msg.sender] = true;
        r.aprobaciones += 1;

        // Transición Abierto/Pendiente según el contador de aprobaciones.
        if (r.aprobaciones < umbral) {
            r.estado = EstadoReclamo.Pendiente;
        }

        emit Aprobacion(idReclamo, msg.sender, r.aprobaciones, umbral);

        // Transición a Aprobado y, atómicamente, a Liberado al alcanzar el umbral.
        if (r.aprobaciones >= umbral) {
            r.estado = EstadoReclamo.Aprobado;

            uint256 monto = r.monto;
            require(monto <= address(this).balance, "FamilyVault: fondos insuficientes");

            // EFFECT antes de la INTERACTION: marcamos Liberado para cerrar la
            // ventana de reentrancy ANTES de mover el dinero.
            r.estado = EstadoReclamo.Liberado;

            // El destino es el solicitante del reclamo (quien pidió la ayuda).
            address destino = r.solicitante;
            emit FondosLiberados(idReclamo, destino, monto);

            // INTERACTION — transferencia al solicitante al final de todo.
            (bool ok, ) = payable(destino).call{value: monto}("");
            require(ok, "FamilyVault: transferencia fallo");
        }
    }

    /**
     * @notice Anula un reclamo todavía no liberado. Transición a Cancelado (final).
     * @param idReclamo Identificador del reclamo a cancelar.
     *
     * @dev Control de acceso: solo el solicitante que lo abrió o el admin.
     *      Validación de estado: no se puede cancelar si ya está Liberado ni
     *      volver a cancelar uno ya Cancelado. No mueve fondos.
     */
    function cancelarReclamo(uint256 idReclamo)
        external
        reclamoExiste(idReclamo)
    {
        Reclamo storage r = reclamos[idReclamo];
        require(
            msg.sender == r.solicitante || msg.sender == admin,
            "FamilyVault: solo solicitante o admin"
        );
        require(r.estado != EstadoReclamo.Liberado, "FamilyVault: ya liberado");
        require(r.estado != EstadoReclamo.Cancelado, "FamilyVault: ya cancelado");

        r.estado = EstadoReclamo.Cancelado;
        emit ReclamoCancelado(idReclamo, msg.sender);
    }

    // ───────────────────────────────────────────────────────────────────────
    //  FUNCIONES DE LECTURA (para el frontend)
    // ───────────────────────────────────────────────────────────────────────

    /// @notice Balance de ETH custodiado por el contrato.
    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Lista completa de guardianes.
    function obtenerGuardianes() external view returns (address[] memory) {
        return guardianes;
    }

    /// @notice Cantidad de guardianes (el "N" de M de N).
    function cantidadGuardianes() external view returns (uint256) {
        return guardianes.length;
    }

    /// @notice Cantidad total de reclamos creados.
    function cantidadReclamos() external view returns (uint256) {
        return reclamos.length;
    }

    /**
     * @notice Devuelve los datos de un reclamo para mostrarlo en la UI.
     * @return solicitante   Guardián que lo abrió.
     * @return descripcion   Descripción de la emergencia.
     * @return hashEvidencia Hash de evidencia (0x0 si no hay).
     * @return monto         Monto a liberar.
     * @return aprobaciones  Aprobaciones acumuladas.
     * @return estado        Estado actual (0..3).
     * @return creadoEn       Timestamp de creación.
     */
    function obtenerReclamo(uint256 idReclamo)
        external
        view
        reclamoExiste(idReclamo)
        returns (
            address solicitante,
            string memory descripcion,
            bytes32 hashEvidencia,
            uint256 monto,
            uint256 aprobaciones,
            EstadoReclamo estado,
            uint256 creadoEn
        )
    {
        Reclamo storage r = reclamos[idReclamo];
        return (
            r.solicitante,
            r.descripcion,
            r.hashEvidencia,
            r.monto,
            r.aprobaciones,
            r.estado,
            r.creadoEn
        );
    }

    /// @notice Indica si un guardián ya aprobó un reclamo (para habilitar el botón).
    function yaAprobo(uint256 idReclamo, address guardian)
        external
        view
        returns (bool)
    {
        return aprobadoPor[idReclamo][guardian];
    }
}
