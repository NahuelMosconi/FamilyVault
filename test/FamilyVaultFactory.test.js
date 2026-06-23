const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Tests de la Factory: que cualquiera pueda crear su propia bóveda (multi-familia).
 */
describe("FamilyVaultFactory", function () {
  let factory, a, b, c, d;

  beforeEach(async function () {
    [a, b, c, d] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("FamilyVaultFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();
  });

  it("crea una bóveda funcional y la registra", async function () {
    await expect(factory.connect(a).crearBoveda([a.address, b.address, c.address], 2))
      .to.emit(factory, "BovedaCreada");

    expect(await factory.cantidadBovedas()).to.equal(1n);
    const bovedas = await factory.obtenerBovedas();
    expect(bovedas.length).to.equal(1);

    // La bóveda creada quedó bien configurada.
    const Vault = await ethers.getContractFactory("FamilyVault");
    const vault = Vault.attach(bovedas[0]);
    expect(await vault.umbral()).to.equal(2n);
    expect(await vault.cantidadGuardianes()).to.equal(3n);
    expect(await vault.esGuardian(a.address)).to.equal(true);
  });

  it("registra las bóvedas por creador", async function () {
    await factory.connect(a).crearBoveda([a.address, b.address], 1);
    await factory.connect(a).crearBoveda([a.address, c.address], 1);
    await factory.connect(b).crearBoveda([b.address, d.address], 1);

    expect((await factory.bovedasDeUsuario(a.address)).length).to.equal(2);
    expect((await factory.bovedasDeUsuario(b.address)).length).to.equal(1);
    expect(await factory.cantidadBovedas()).to.equal(3n);
  });
});
