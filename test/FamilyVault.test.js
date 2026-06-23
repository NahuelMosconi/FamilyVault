const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Tests de la lógica clave de FamilyVault.
 *
 * Cubren los puntos que el jurado quiere ver demostrados:
 *  - Depósito de fondos al contrato.
 *  - Solo los guardianes pueden crear/aprobar reclamos (control de acceso).
 *  - Un guardián no puede aprobar dos veces el mismo reclamo.
 *  - Los fondos se liberan recién al alcanzar el umbral M, y van al SOLICITANTE
 *    del reclamo (no a un beneficiario fijo).
 *  - El reclamo recorre correctamente la máquina de estados.
 */
describe("FamilyVault", function () {
  // Estados (enum del contrato): Abierto=0, Pendiente=1, Aprobado=2, Liberado=3
  const ABIERTO = 0n;
  const PENDIENTE = 1n;
  const LIBERADO = 3n;

  let vault;
  let admin, g1, g2, g3, extrano;

  beforeEach(async function () {
    [admin, g1, g2, g3, extrano] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("FamilyVault");
    // Umbral 2 de 3 guardianes. Ya no hay beneficiario fijo.
    vault = await Vault.deploy([g1.address, g2.address, g3.address], 2);
    await vault.waitForDeployment();
  });

  describe("Despliegue y configuración", function () {
    it("guarda guardianes y umbral", async function () {
      expect(await vault.umbral()).to.equal(2n);
      expect(await vault.cantidadGuardianes()).to.equal(3n);
      expect(await vault.esGuardian(g1.address)).to.equal(true);
      expect(await vault.esGuardian(extrano.address)).to.equal(false);
    });

    it("rechaza un umbral mayor que la cantidad de guardianes", async function () {
      const Vault = await ethers.getContractFactory("FamilyVault");
      await expect(
        Vault.deploy([g1.address, g2.address], 3)
      ).to.be.revertedWith("FamilyVault: umbral invalido");
    });

    it("rechaza guardianes duplicados", async function () {
      const Vault = await ethers.getContractFactory("FamilyVault");
      await expect(
        Vault.deploy([g1.address, g1.address], 1)
      ).to.be.revertedWith("FamilyVault: guardian duplicado");
    });
  });

  describe("Depósitos", function () {
    it("cualquiera puede depositar y el balance se actualiza", async function () {
      await vault.connect(extrano).depositar({ value: ethers.parseEther("1.0") });
      expect(await vault.balance()).to.equal(ethers.parseEther("1.0"));
    });

    it("emite el evento Deposito", async function () {
      await expect(vault.connect(g1).depositar({ value: ethers.parseEther("0.5") }))
        .to.emit(vault, "Deposito");
    });

    it("acepta ETH enviado directo (receive)", async function () {
      await g1.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("0.3") });
      expect(await vault.balance()).to.equal(ethers.parseEther("0.3"));
    });
  });

  describe("Creación de reclamos", function () {
    beforeEach(async function () {
      await vault.connect(g1).depositar({ value: ethers.parseEther("1.0") });
    });

    it("un guardián puede crear un reclamo (estado inicial Abierto)", async function () {
      await expect(
        vault.connect(g1).crearReclamo("Accidente", ethers.ZeroHash, ethers.parseEther("0.5"))
      ).to.emit(vault, "ReclamoCreado");

      const r = await vault.obtenerReclamo(0);
      expect(r.descripcion).to.equal("Accidente");
      expect(r.solicitante).to.equal(g1.address);
      expect(r.estado).to.equal(ABIERTO);
      expect(r.aprobaciones).to.equal(0n);
    });

    it("un NO guardián no puede crear un reclamo", async function () {
      await expect(
        vault.connect(extrano).crearReclamo("Hack", ethers.ZeroHash, ethers.parseEther("0.1"))
      ).to.be.revertedWith("FamilyVault: solo guardianes");
    });

    it("no permite crear un reclamo por más del balance", async function () {
      await expect(
        vault.connect(g1).crearReclamo("Demasiado", ethers.ZeroHash, ethers.parseEther("5.0"))
      ).to.be.revertedWith("FamilyVault: monto > balance");
    });
  });

  describe("Aprobación y liberación (máquina de estados)", function () {
    const MONTO = ethers.parseEther("0.5");

    beforeEach(async function () {
      await vault.connect(g1).depositar({ value: ethers.parseEther("1.0") });
      // g1 es el SOLICITANTE: a él van a ir los fondos al liberarse.
      await vault.connect(g1).crearReclamo("Emergencia medica", ethers.ZeroHash, MONTO);
    });

    it("un NO guardián no puede aprobar", async function () {
      await expect(vault.connect(extrano).aprobar(0))
        .to.be.revertedWith("FamilyVault: solo guardianes");
    });

    it("la primera aprobación deja el reclamo en Pendiente", async function () {
      await expect(vault.connect(g1).aprobar(0)).to.emit(vault, "Aprobacion");
      const r = await vault.obtenerReclamo(0);
      expect(r.estado).to.equal(PENDIENTE);
      expect(r.aprobaciones).to.equal(1n);
    });

    it("un guardián no puede aprobar dos veces el mismo reclamo", async function () {
      await vault.connect(g1).aprobar(0);
      await expect(vault.connect(g1).aprobar(0))
        .to.be.revertedWith("FamilyVault: ya aprobaste");
    });

    it("libera los fondos al SOLICITANTE al alcanzar el umbral", async function () {
      await vault.connect(g1).aprobar(0); // 1/2 -> Pendiente (g1 paga gas acá)

      // Medimos el balance del solicitante (g1) justo antes de la liberación.
      const antes = await ethers.provider.getBalance(g1.address);

      // La segunda aprobación (g2) alcanza el umbral 2/2 y libera hacia g1.
      await expect(vault.connect(g2).aprobar(0))
        .to.emit(vault, "FondosLiberados")
        .withArgs(0, g1.address, MONTO);

      const r = await vault.obtenerReclamo(0);
      expect(r.estado).to.equal(LIBERADO);

      // g1 no pagó gas en la tx de g2, así que recibe exactamente MONTO.
      const despues = await ethers.provider.getBalance(g1.address);
      expect(despues - antes).to.equal(MONTO);

      // El balance del contrato bajó en el monto liberado.
      expect(await vault.balance()).to.equal(ethers.parseEther("0.5"));
    });

    it("no se puede aprobar un reclamo ya liberado", async function () {
      await vault.connect(g1).aprobar(0);
      await vault.connect(g2).aprobar(0); // libera
      await expect(vault.connect(g3).aprobar(0))
        .to.be.revertedWith("FamilyVault: ya liberado");
    });

    it("NO libera fondos antes de alcanzar el umbral", async function () {
      const antes = await ethers.provider.getBalance(g1.address);
      await vault.connect(g2).aprobar(0); // solo 1/2 (aprueba g2, no g1)
      const despues = await ethers.provider.getBalance(g1.address);
      expect(despues).to.equal(antes); // g1 no recibió nada
      expect(await vault.balance()).to.equal(ethers.parseEther("1.0"));
    });
  });

  describe("Cancelación de reclamos", function () {
    const CANCELADO = 4n;

    beforeEach(async function () {
      await vault.connect(g1).depositar({ value: ethers.parseEther("1.0") });
      await vault.connect(g1).crearReclamo("Emergencia", ethers.ZeroHash, ethers.parseEther("0.5"));
    });

    it("el solicitante puede cancelar su reclamo", async function () {
      await expect(vault.connect(g1).cancelarReclamo(0)).to.emit(vault, "ReclamoCancelado");
      const r = await vault.obtenerReclamo(0);
      expect(r.estado).to.equal(CANCELADO);
    });

    it("el admin también puede cancelar", async function () {
      await expect(vault.connect(admin).cancelarReclamo(0)).to.emit(vault, "ReclamoCancelado");
    });

    it("un tercero no puede cancelar", async function () {
      await expect(vault.connect(g2).cancelarReclamo(0))
        .to.be.revertedWith("FamilyVault: solo solicitante o admin");
    });

    it("no se puede aprobar un reclamo cancelado", async function () {
      await vault.connect(g1).cancelarReclamo(0);
      await expect(vault.connect(g2).aprobar(0))
        .to.be.revertedWith("FamilyVault: reclamo cancelado");
    });

    it("no se puede cancelar un reclamo ya liberado", async function () {
      await vault.connect(g1).aprobar(0);
      await vault.connect(g2).aprobar(0); // libera (umbral 2)
      await expect(vault.connect(g1).cancelarReclamo(0))
        .to.be.revertedWith("FamilyVault: ya liberado");
    });
  });

  describe("Meta del fondo", function () {
    it("solo el admin puede fijar la meta", async function () {
      await expect(vault.connect(g1).fijarMeta(ethers.parseEther("1")))
        .to.be.revertedWith("FamilyVault: solo el admin");
      await expect(vault.connect(admin).fijarMeta(ethers.parseEther("2")))
        .to.emit(vault, "MetaFijada");
      expect(await vault.meta()).to.equal(ethers.parseEther("2"));
    });
  });

  describe("Recuperación social (rotación de guardianes)", function () {
    it("rota un guardián al alcanzar el umbral", async function () {
      // Reemplazar g3 por 'extrano'. Umbral 2: hace falta 2 aprobaciones.
      await vault.connect(g1).proponerRotacion(g3.address, extrano.address);
      await vault.connect(g1).aprobarRotacion(0); // 1/2
      let rot = await vault.obtenerRotacion(0);
      expect(rot.ejecutada).to.equal(false);

      await expect(vault.connect(g2).aprobarRotacion(0)) // 2/2 -> ejecuta
        .to.emit(vault, "GuardianRotado");

      expect(await vault.esGuardian(g3.address)).to.equal(false);
      expect(await vault.esGuardian(extrano.address)).to.equal(true);
      const lista = await vault.obtenerGuardianes();
      expect(lista).to.include(extrano.address);
      expect(lista).to.not.include(g3.address);
    });

    it("no permite proponer reemplazar a un no-guardián", async function () {
      await expect(vault.connect(g1).proponerRotacion(extrano.address, g2.address))
        .to.be.revertedWith("FamilyVault: viejo no es guardian");
    });

    it("un no-guardián no puede aprobar una rotación", async function () {
      await vault.connect(g1).proponerRotacion(g3.address, extrano.address);
      await expect(vault.connect(extrano).aprobarRotacion(0))
        .to.be.revertedWith("FamilyVault: solo guardianes");
    });
  });

  describe("Seguridad: defensa anti-reentrancy", function () {
    it("un receptor malicioso NO puede drenar fondos al reentrar", async function () {
      const Atacante = await ethers.getContractFactory("AtacanteReentrancy");
      const atacante = await Atacante.deploy();
      await atacante.waitForDeployment();
      const dirAtacante = await atacante.getAddress();

      // Desplegamos una bóveda con el atacante como guardián (umbral 2 de 3).
      const Vault = await ethers.getContractFactory("FamilyVault");
      const v = await Vault.deploy([dirAtacante, g2.address, g3.address], 2);
      await v.waitForDeployment();
      await atacante.setVault(await v.getAddress());

      // Fondeamos con más de lo que pide el reclamo, para ver si logra drenar de más.
      await v.connect(g2).depositar({ value: ethers.parseEther("1.0") });

      // El atacante abre un reclamo por 0.5 a su favor y lo aprueba (1/2).
      await atacante.crear(ethers.parseEther("0.5"));
      await atacante.aprobar(0);

      // g2 da la 2da aprobación: dispara la transferencia al atacante (reentra).
      await v.connect(g2).aprobar(0);

      // El atacante intentó reentrar...
      expect(await atacante.intentoReentrar()).to.equal(true);
      // ...pero el contrato solo soltó 0.5: quedan 0.5 (no se drenó de más).
      expect(await v.balance()).to.equal(ethers.parseEther("0.5"));
      // Y el reclamo quedó Liberado (no se pudo volver a liberar).
      const r = await v.obtenerReclamo(0);
      expect(r.estado).to.equal(3n);
    });
  });
});
