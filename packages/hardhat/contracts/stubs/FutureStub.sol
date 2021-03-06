pragma solidity ^0.8.4;
pragma abicoder v2;
//SPDX-License-Identifier: MIT

import "../interfaces/IFuture.sol";
import "../interfaces/IPool.sol";

contract FutureStub is IFuture {
    IPool public override base;
    IPool public override quote;

    uint spot = 1;
    uint bidInterestRate = 0;
    uint askInterestRate = 0;
    uint _bidRate = 0;
    uint _askRate = 0;

    constructor(IPool _base, IPool _quote) {
        base = _base;
        quote = _quote;
    }

    function setSpot(uint _spot) external {
        spot = _spot;
    }

    function setBidInterestRate(uint _bidInterestRate) external {
        bidInterestRate = _bidInterestRate;
    }

    function setAskInterestRate(uint _askInterestRate) external {
        askInterestRate = _askInterestRate;
    }

    function setBidRate(uint bidRate_) external {
        _bidRate = bidRate_;
    }

    function setAskRate(uint askRate_) external {
        _askRate = askRate_;
    }

    function long(uint quantity, uint /*price*/) external view override returns (int amountReceived, int amountPaid) {
        return (int(quantity), - int(quantity * askRate()) / int(10 ** base.token().decimals()));
    }

    function short(uint quantity, uint /*price*/) external view override returns (int amountPaid, int amountReceived) {
        return (-int(quantity), int(quantity * bidRate()) / int(10 ** base.token().decimals()));
    }

    function bidRate() public override view returns (uint256) {
        return _bidRate > 0 ? _bidRate : spot - (bidInterestRate * spot / 10000);
    }

    function quoteBidRate(uint) external override view returns (uint256 rate){
        rate = bidRate();
    }

    function bidQty() external override view returns (uint qty) {
        qty = base.available();
    }

    function askRate() public override view returns (uint256) {
        return _askRate > 0 ? _askRate : spot + (askInterestRate * spot / 10000);
    }

    function quoteAskRate(uint) external override view returns (uint256 rate) {
        rate = askRate();
    }

    function askQty() external override view returns (uint qty) {
        qty = quote.available();
    }
}
