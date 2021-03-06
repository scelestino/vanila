import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai from 'chai'
import chaiAsPromised from "chai-as-promised"
import {solidity} from "ethereum-waffle"
import {utils} from 'ethers'
import {ethers} from 'hardhat'
import {ERC20Stub, ERC20Stub__factory, Pool, Pool__factory} from '../typechain'

chai.use(solidity).use(chaiAsPromised)
const {expect} = chai
const {parseUnits, formatUnits} = utils

describe("Pool", async () => {

    let owner: SignerWithAddress
    let lp1: SignerWithAddress
    let lp2: SignerWithAddress
    let uniswap: string
    let poolFactory: Pool__factory

    let erc20: ERC20Stub

    let sut: Pool

    beforeEach(async () => {

        let signers = await ethers.getSigners()
        owner = signers[0]
        lp1 = signers[1]
        lp2 = signers[2]

        uniswap = "0xE592427A0AEce92De3Edee1F18E0157C05861564"

        const erc20Factory = (await ethers.getContractFactory('ERC20Stub', owner)) as ERC20Stub__factory
        erc20 = await erc20Factory.deploy("Wrapped ETH", "WETH")
        await erc20.deployed()
        expect(erc20.address).to.properAddress

        poolFactory = (await ethers.getContractFactory('Pool', owner)) as Pool__factory
        sut = await poolFactory.deploy(erc20.address, 0, 0, 0, 0)
        await sut.deployed()
        expect(sut.address).to.properAddress

        await erc20.setBalance(owner.address, parseUnits("1000000"))
        await erc20.connect(owner).approve(sut.address, ethers.constants.MaxUint256)

        await erc20.setBalance(lp1.address, parseUnits("1000"))
        await erc20.connect(lp1).approve(sut.address, ethers.constants.MaxUint256)

        await erc20.setBalance(lp2.address, parseUnits("1000"))
        await erc20.connect(lp2).approve(sut.address, ethers.constants.MaxUint256)

        await erc20.setBalance(uniswap, parseUnits("0"))

    })

    describe("Deposit", async () => {

        it("should allow liquidity provider to deposit", async () => {

            await sut.connect(lp1).deposit(parseUnits("450"))

            expect(await sut.balance()).to.be.eq(parseUnits("450"))
            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("450"))
            expect(await sut.shareOf(lp1.address)).to.be.eq(parseUnits("100", 0))

            expect(await erc20.balanceOf(sut.address)).to.be.eq(parseUnits("450"))
            expect(await erc20.balanceOf(lp1.address)).to.be.eq(parseUnits("550"))

        })

        it("should allow multiple liquidity providers to deposit", async () => {

            await sut.connect(lp1).deposit(parseUnits("200"))
            await sut.connect(lp2).deposit(parseUnits("400"))

            expect(await sut.balance()).to.be.eq(parseUnits("600"))
            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("200"))
            expect(await sut.balanceOf(lp2.address)).to.be.eq(parseUnits("400"))

            expect(await sut.shareOf(lp1.address)).to.be.eq(parseUnits("33", 0))
            expect(await sut.shareOf(lp2.address)).to.be.eq(parseUnits("66", 0))

            expect(await erc20.balanceOf(sut.address)).to.be.eq(parseUnits("600"))
            expect(await erc20.balanceOf(lp1.address)).to.be.eq(parseUnits("800"))
            expect(await erc20.balanceOf(lp2.address)).to.be.eq(parseUnits("600"))

        })

        it("shouldn't change other liquidity provider balances", async () => {

            await sut.connect(lp1).deposit(parseUnits("200"))
            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("200"))

            await sut.connect(lp2).deposit(parseUnits("800"))
            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("200"))
            expect(await sut.balanceOf(lp2.address)).to.be.eq(parseUnits("800"))

        })

    })

    describe("Borrow", async () => {

        it("shouldn't allow borrow zero", async () => {
            await expect(sut.borrow(parseUnits("0"), owner.address)).eventually.to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Amount must be greater than zero'");
        })

        it("should allow borrow", async () => {

            await sut.connect(lp1).deposit(parseUnits("300"))
            await sut.borrow(parseUnits("100"), uniswap)

            expect(await sut.borrowed()).to.be.eq(parseUnits("100"))
            expect(await erc20.balanceOf(uniswap)).to.be.eq(parseUnits("100"))

        })

        it("shouldn't change balance", async () => {

            await sut.connect(lp1).deposit(parseUnits("300"))
            await sut.borrow(parseUnits("100"), uniswap)

            expect(await sut.balance()).to.be.eq(parseUnits("300"))

        })

    })

    describe("Repay", async () => {

        it("shouldn't allow repay amount zero", async () => {
            await expect(sut.repay(parseUnits("0"), parseUnits("1"))).eventually.to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Amount must be greater than zero'");
        })

        it("shouldn't allow repay interest zero", async () => {
            await expect(sut.repay(parseUnits("1"), parseUnits("0"))).eventually.to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Amount must be greater than zero'");
        })

        it("shouldn't allow repay more than borrowed", async () => {

            await sut.connect(lp1).deposit(parseUnits("300"))
            await sut.borrow(parseUnits("200"), uniswap)

            await expect(sut.repay(parseUnits("300"), parseUnits("10"))).eventually.to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Amount too big'");

        })

        it("should add interest to balance", async () => {

            await sut.connect(lp1).deposit(parseUnits("500"))
            await sut.borrow(parseUnits("500"), uniswap)

            expect(await sut.balance()).to.be.eq(parseUnits("500"))

            await sut.repay(parseUnits("500"), parseUnits("20"))

            expect(await sut.balance()).to.be.eq(parseUnits("520"))

        })

        it("should subtract amount to borrowed", async () => {

            await sut.connect(lp1).deposit(parseUnits("400"))
            await sut.borrow(parseUnits("200"), uniswap)

            expect(await sut.borrowed()).to.be.eq(parseUnits("200"))

            await sut.repay(parseUnits("100"), parseUnits("20"))

            expect(await sut.borrowed()).to.be.eq(parseUnits("100"))

        })

    })

    describe("Withdaw", async () => {

        it("shouldn't allow liquidity provider to withdraw zero", async () => {
            await expect(sut.connect(lp1).withdraw(parseUnits("0"))).eventually.to.rejectedWith(Error, "Amount must be greater than zero'")
        })

        it("shouldn't allow liquidity provider to withdraw more balance", async () => {
            await sut.connect(lp1).deposit(parseUnits("400"))
            await expect(sut.connect(lp1).withdraw(parseUnits("500"))).eventually.to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Amount too big'")
        })

        it("shouldn't allow liquidity provider to withdraw more than its balance", async () => {
            await sut.connect(lp1).deposit(parseUnits("400"))
            await sut.connect(lp2).deposit(parseUnits("400"))
            await expect(sut.connect(lp1).withdraw(parseUnits("500"))).eventually.to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Amount gt than balance'")
        })

        it("should allow liquidity provider to withdraw", async () => {

            // Setup
            await sut.connect(lp1).deposit(parseUnits("200"))

            expect(await sut.balance()).to.be.eq(parseUnits("200"))
            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("200"))
            expect(await sut.shareOf(lp1.address)).to.be.eq(parseUnits("100", 0))

            expect(await erc20.balanceOf(sut.address)).to.be.eq(parseUnits("200"))
            expect(await erc20.balanceOf(lp1.address)).to.be.eq(parseUnits("800"))

            // Withdrawal
            await sut.connect(lp1).withdraw(parseUnits("200"))
            expect(await sut.balance()).to.be.eq(parseUnits("0"))
            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("0"))
            expect(await sut.shareOf(lp1.address)).to.be.eq(parseUnits("0"))

            expect(await erc20.balanceOf(sut.address)).to.be.eq(parseUnits("0"))
            expect(await erc20.balanceOf(lp1.address)).to.be.eq(parseUnits("1000"))

        })

        it("should allow liquidity provider to partially withdraw", async () => {

            // Setup
            await sut.connect(lp1).deposit(parseUnits("500"))

            expect(await sut.balance()).to.be.eq(parseUnits("500"))
            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("500"))
            expect(await sut.shareOf(lp1.address)).to.be.eq(parseUnits("100", 0))

            expect(await erc20.balanceOf(lp1.address)).to.be.eq(parseUnits("500"))

            // Withdrawal
            await sut.connect(lp1).withdraw(parseUnits("200"))
            expect(await sut.balance()).to.be.eq(parseUnits("300"))
            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("300"))
            expect(await sut.shareOf(lp1.address)).to.be.eq(parseUnits("100", 0))

            expect(await erc20.balanceOf(sut.address)).to.be.eq(parseUnits("300"))
            expect(await erc20.balanceOf(lp1.address)).to.be.eq(parseUnits("700"))

        })

        it("shouldn't change other liquidity provider balances", async () => {

            await sut.connect(lp1).deposit(parseUnits("800"))
            await sut.connect(lp2).deposit(parseUnits("700"))

            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("800"))
            expect(await sut.balanceOf(lp2.address)).to.be.eq(parseUnits("700"))

            await sut.connect(lp1).withdraw(parseUnits("450"))
            expect(await sut.balanceOf(lp1.address)).to.be.eq(parseUnits("350"))
            expect(await sut.balanceOf(lp2.address)).to.be.eq(parseUnits("700"))

        })

    })

    describe("BalanceOf", async () => {

        it("should return zero for a liquidity provider without deposits ", async () => {
            await sut.connect(lp1).deposit(parseUnits("500"))
            expect(await sut.balanceOf(lp2.address)).to.be.eq(parseUnits("0"))
            expect(await erc20.balanceOf(lp2.address)).to.be.eq(parseUnits("1000"))
        })

    })

    describe("Underlying Balance", async () => {

        it("should start with zero", async () => {
            expect(await erc20.balanceOf(sut.address)).to.be.eq(parseUnits("0"))
        })

        it("should be equals to the sum of all its deposits", async () => {
            await sut.connect(lp1).deposit(parseUnits("200"))
            await sut.connect(lp2).deposit(parseUnits("1000"))
            expect(await erc20.balanceOf(sut.address)).to.be.eq(parseUnits("1200"))
        })

    })

    describe("Borrowing rate", async () => {

        [
            [parseUnits("100"), parseUnits("10"), parseUnits("0.1"), parseUnits("0.012307692307692307"), parseUnits("0.65"), 0, parseUnits("0.08"), parseUnits("1")],
            [parseUnits("100"), parseUnits("10"), parseUnits("0.1"), parseUnits("0.112307692307692307"), parseUnits("0.65"), parseUnits("0.1"), parseUnits("0.08"), parseUnits("1")],
            [parseUnits("100"), parseUnits("65"), parseUnits("0.65"), parseUnits("0.08"), parseUnits("0.65"), 0, parseUnits("0.08"), parseUnits("1")],
            [parseUnits("100"), parseUnits("80"), parseUnits("0.80"), parseUnits("0.508571428571428571"), parseUnits("0.65"), 0, parseUnits("0.08"), parseUnits("1")],
            [parseUnits("100000"), parseUnits("25000"), parseUnits("0.25"), parseUnits("0.0125"), parseUnits("0.8"), 0, parseUnits("0.04"), parseUnits("0.75")],
            [parseUnits("100000"), parseUnits("25000"), parseUnits("0.25"), parseUnits("0.0625"), parseUnits("0.8"), parseUnits("0.05"), parseUnits("0.04"), parseUnits("0.75")],
            [parseUnits("100000"), parseUnits("80000"), parseUnits("0.8"), parseUnits("0.04"), parseUnits("0.8"), 0, parseUnits("0.04"), parseUnits("0.75")],
            [parseUnits("100000"), parseUnits("90000"), parseUnits("0.9"), parseUnits("0.415"), parseUnits("0.8"), 0, parseUnits("0.04"), parseUnits("0.75")]
        ].forEach(([poolSize, borrowedAmount, utilisationRate, borrowingRate, optimalutilisationRate, baseBorrowRate, slope1, slope2]) => [
            it(`should return the borrowing rate for poolSize = ${formatUnits(poolSize.toString())}, borrowed amount = ${formatUnits(borrowedAmount.toString())}`, async () => {
                sut = await poolFactory.deploy(erc20.address, optimalutilisationRate, baseBorrowRate, slope1, slope2)
                await sut.deployed()
                expect(sut.address).to.properAddress
                await erc20.connect(owner).approve(sut.address, ethers.constants.MaxUint256)

                expect(await sut.borrowingRate()).to.be.eq(baseBorrowRate)
                expect(await sut.utilisationRate()).to.be.eq(0)

                await sut.connect(owner).deposit(poolSize)
                await sut.borrow(borrowedAmount, uniswap)

                expect(await sut.utilisationRate()).to.be.eq(utilisationRate)
                expect(await sut.borrowingRate()).to.be.eq(borrowingRate)
            })
        ]);

        it(`should quote a rate for a given quantity`, async () => {
            sut = await poolFactory.deploy(erc20.address, parseUnits("0.65"), 0, parseUnits("0.08"), parseUnits("1"))
            await sut.deployed()
            expect(sut.address).to.properAddress
            await erc20.connect(owner).approve(sut.address, ethers.constants.MaxUint256)

            await sut.connect(owner).deposit(parseUnits("100"))

            expect(await sut.borrowingRateAfterLoan(parseUnits("10"))).to.be.eq(parseUnits("0.012307692307692307"))
            expect(await sut.borrowingRateAfterLoan(parseUnits("65"))).to.be.eq(parseUnits("0.08"))
            expect(await sut.borrowingRateAfterLoan(parseUnits("80"))).to.be.eq(parseUnits("0.508571428571428571"))
        })
    })
})
