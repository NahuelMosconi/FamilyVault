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

    /// @notice Meta opcional de ahorro del fondo (0 = sin meta). La fija el admin.
    uint256 public meta;

    /// @notice Tope máximo de la comisión de protocolo, en puntos básicos (200 = 2%).
    ///         Es una CONSTANTE del código: ni el admin puede superarla. Da garantía
    ///         a las familias de que la comisión nunca podrá abusar del fondo.
    uint256 public constant MAX_FEE_BIPS = 200;

    /// @notice Comisión de protocolo por liberación, en puntos básicos (50 = 0,5%).
    ///         Arranca en 0 (sin cobro) y el admin puede activarla hasta MAX_FEE_BIPS.
    uint256 public feeBips;

    /// @notice Dirección que recibe la comisión (tesorería). Por defecto, el admin.
    address public tesoreria;

    /// @notice Propuesta de rotación de guardián (recuperación social).
    struct Rotacion {
        address viejo;          // guardián a reemplazar
        address nuevo;          // dirección que entra en su lugar
        uint256 aprobaciones;   // aprobaciones acumuladas
        bool ejecutada;         // ya se aplicó el cambio
    }

    /// @notice Todas las propuestas de rotación de guardianes.
    Rotacion[] public rotaciones;

    /// @notice ¿Este guardián ya aprobó esta rotación? (evita doble voto)
    mapping(uint256 => mapping(address => bool)) public aprobadoRotacion;

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
    /// @dev El admin fijó (o cambió) la meta de ahorro del fondo.
    event MetaFijada(uint256 meta);
    /// @dev Se cobró la comisión de protocolo al liberar un reclamo (transparencia).
    event ComisionCobrada(uint256 indexed idReclamo, address indexed tesoreria, uint256 monto);
    /// @dev El admin cambió la comisión de protocolo (en puntos básicos).
    event ComisionFijada(uint256 feeBips);
    /// @dev El admin cambió la dirección de la tesorería.
    event TesoreriaFijada(address tesoreria);
    /// @dev Recuperación social: ciclo de vida de una rotación de guardián.
    event RotacionPropuesta(uint256 indexed idRotacion, address indexed viejo, address indexed nuevo, address proponente);
    event RotacionAprobada(uint256 indexed idRotacion, address indexed guardian, uint256 aprobaciones, uint256 umbral);
    event GuardianRotado(uint256 indexed idRotacion, address indexed viejo, address indexed nuevo);

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
        tesoreria = msg.sender; // por defecto la comisión va al admin; feeBips arranca en 0

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

    /// @notice El admin fija una meta de ahorro (objetivo del fondo). 0 = sin meta.
    function fijarMeta(uint256 _meta) external soloAdmin {
        meta = _meta;
        emit MetaFijada(_meta);
    }

    /// @notice El admin fija la comisión de protocolo (en puntos básicos, 50 = 0,5%).
    /// @dev No puede superar MAX_FEE_BIPS (tope del código). 0 = sin comisión.
    function fijarComision(uint256 _feeBips) external soloAdmin {
        require(_feeBips <= MAX_FEE_BIPS, "FamilyVault: comision excede el tope");
        feeBips = _feeBips;
        emit ComisionFijada(_feeBips);
    }

    /// @notice El admin cambia la dirección que recibe la comisión (tesorería).
    function fijarTesoreria(address _tesoreria) external soloAdmin {
        require(_tesoreria != address(0), "FamilyVault: tesoreria cero");
        tesoreria = _tesoreria;
        emit TesoreriaFijada(_tesoreria);
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

            // Comisión de protocolo (transparente): se descuenta del monto y el
            // resto va al solicitante. Como feeBips <= MAX_FEE_BIPS (2%), la
            // comisión nunca puede vaciar el reclamo.
            uint256 comision = (monto * feeBips) / 10000;
            uint256 neto = monto - comision;

            emit FondosLiberados(idReclamo, destino, neto);

            // INTERACTION — primero la comisión a la tesorería (si corresponde),
            // después el neto al solicitante. Todo después de marcar Liberado.
            if (comision > 0 && tesoreria != address(0)) {
                (bool okFee, ) = payable(tesoreria).call{value: comision}("");
                require(okFee, "FamilyVault: comision fallo");
                emit ComisionCobrada(idReclamo, tesoreria, comision);
            }
            (bool ok, ) = payable(destino).call{value: neto}("");
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
    //  RECUPERACIÓN SOCIAL — rotación de guardianes por consenso
    // ───────────────────────────────────────────────────────────────────────

    /**
     * @notice Propone reemplazar un guardián (p. ej. perdió su clave) por uno nuevo.
     *         El cambio NO es inmediato: requiere el mismo umbral de aprobaciones.
     * @dev El que propone también deberá aprobar. Control de acceso: solo guardianes.
     */
    function proponerRotacion(address viejo, address nuevo)
        external
        soloGuardian
        returns (uint256 idRotacion)
    {
        require(esGuardian[viejo], "FamilyVault: viejo no es guardian");
        require(nuevo != address(0), "FamilyVault: nuevo cero");
        require(!esGuardian[nuevo], "FamilyVault: nuevo ya es guardian");

        idRotacion = rotaciones.length;
        rotaciones.push(Rotacion({ viejo: viejo, nuevo: nuevo, aprobaciones: 0, ejecutada: false }));
        emit RotacionPropuesta(idRotacion, viejo, nuevo, msg.sender);
    }

    /**
     * @notice Aprueba una rotación. Al alcanzar el umbral, reemplaza al guardián.
     * @dev Mismo patrón que los reclamos: anti doble-voto y validación de estado.
     *      Cuando se ejecuta, se valida de nuevo (viejo sigue siendo guardián y
     *      nuevo todavía no) para no dejar el conjunto inconsistente.
     */
    function aprobarRotacion(uint256 idRotacion) external soloGuardian {
        require(idRotacion < rotaciones.length, "FamilyVault: rotacion inexistente");
        Rotacion storage rot = rotaciones[idRotacion];
        require(!rot.ejecutada, "FamilyVault: rotacion ejecutada");
        require(!aprobadoRotacion[idRotacion][msg.sender], "FamilyVault: ya aprobaste");

        aprobadoRotacion[idRotacion][msg.sender] = true;
        rot.aprobaciones += 1;
        emit RotacionAprobada(idRotacion, msg.sender, rot.aprobaciones, umbral);

        if (rot.aprobaciones >= umbral) {
            require(esGuardian[rot.viejo], "FamilyVault: viejo ya no es guardian");
            require(!esGuardian[rot.nuevo], "FamilyVault: nuevo ya es guardian");

            rot.ejecutada = true;
            esGuardian[rot.viejo] = false;
            esGuardian[rot.nuevo] = true;
            // Reemplazamos la dirección en el arreglo de guardianes.
            for (uint256 i = 0; i < guardianes.length; i++) {
                if (guardianes[i] == rot.viejo) {
                    guardianes[i] = rot.nuevo;
                    break;
                }
            }
            emit GuardianRotado(idRotacion, rot.viejo, rot.nuevo);
        }
    }

    /// @notice Cantidad de propuestas de rotación creadas.
    function cantidadRotaciones() external view returns (uint256) {
        return rotaciones.length;
    }

    /// @notice Datos de una rotación para mostrarla en la UI.
    function obtenerRotacion(uint256 idRotacion)
        external
        view
        returns (address viejo, address nuevo, uint256 aprobaciones, bool ejecutada)
    {
        require(idRotacion < rotaciones.length, "FamilyVault: rotacion inexistente");
        Rotacion storage rot = rotaciones[idRotacion];
        return (rot.viejo, rot.nuevo, rot.aprobaciones, rot.ejecutada);
    }

    /// @notice ¿Un guardián ya aprobó una rotación? (para habilitar el botón)
    function yaAproboRotacion(uint256 idRotacion, address guardian) external view returns (bool) {
        return aprobadoRotacion[idRotacion][guardian];
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
