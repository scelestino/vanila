pragma solidity ^0.8.4;
pragma abicoder v2;
//SPDX-License-Identifier: MIT

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "prb-math/contracts/PRBMath.sol";

import "./interfaces/IFuture.sol";
import "./interfaces/Validated.sol";

contract UserAccount is Validated {
    using SafeERC20 for IERC20;

    mapping(address => mapping(address => int256)) public wallets;
    mapping(address => Fill[]) public fills;
    //TODO do we really need this?
    mapping(address => mapping(address => Position)) public positions;

    function deposit(address token, int256 amount) external validAddress(token) validIAmount(amount) {
        wallets[msg.sender][token] = wallets[msg.sender][token] + amount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), uint(amount));
    }

    function withdraw(address token, int256 amount) external validAddress(token) validIAmount(amount) {
        int256 balance = wallets[msg.sender][token];
        require(balance >= amount, "UserAccount: not enough balance");

        wallets[msg.sender][token] = balance - amount;
        IERC20(token).safeTransfer(msg.sender, uint(amount));
    }

    function noFills(address trader) external view returns (uint256) {
        return fills[trader].length;
    }

    function purchasingPower(address trader, address token) public view returns (int pp) {
        Fill[] memory traderFills = fills[trader];
        int256 margin;
        for (uint256 i = 0; i < traderFills.length; i++) {
            Fill memory fill = traderFills[i];
            if (address(fill.future.quote().token()) == token) {
                //consider the rate that it'd paid to close the fill, aka the other side of the market
                int marketRate = int(fill.openQuantity > 0 ? fill.future.bidRate() : fill.future.askRate());
                margin += fill.openQuantity * marketRate / int(fill.leverage * fill.future.base().tokenScale());
            }
        }
        pp = wallets[trader][token] - int(abs(margin));
    }

    function placeOrder(IFuture future, int256 _quantity, uint256 price, uint8 leverage) external validQuantity(_quantity) {
        uint absQty = abs(_quantity);
        (uint liquidity, uint marketRate) = _quantity > 0 ? (future.askQty(), future.quoteAskRate(absQty)) : (future.bidQty(), future.quoteBidRate(absQty));
        require(_quantity > 0 ? price >= marketRate : price <= marketRate, "Price worse than market");
        require(liquidity >= absQty, "Not enough liquidity");
        //TODO make maxLeverage configurable
        require(leverage > 0 && leverage < 10, "Invalid leverage");

        Position storage p = positions[msg.sender][address(future)];

        if (abs(p.quantity + _quantity) > abs(p.quantity)) {
            uint256 requiredMargin = PRBMath.mulDiv(absQty, price, leverage * future.base().tokenScale());
            require(int(requiredMargin) <= purchasingPower(msg.sender, address(future.quote().token())), "Not enough purchasing power");
        }

        (int quantity, int cost) = _quantity > 0 ? future.long(absQty, price) : future.short(absQty, price);

        settle(future, p, Fill(future, quantity, cost, leverage, 0, 0));
    }

    function settle(IFuture future, Position storage p, Fill memory rightFill) internal {
        Fill[] storage traderFills = fills[msg.sender];
        for (uint i = 0; i < traderFills.length; i++) {
            if (traderFills[i].future == future && signum(traderFills[i].openQuantity) != signum(rightFill.openQuantity)) {
                // rightFill can close leftFill completely
                if (abs(rightFill.openQuantity) >= abs(traderFills[i].openQuantity)) {
                    Fill memory leftFill = traderFills[i];
                    int pnl = leftFill.openCost + rightFill.openCost;
                    wallets[msg.sender][address(future.quote().token())] = wallets[msg.sender][address(future.quote().token())] + pnl;
                    // TODO what to do with the PnL???

                    int closeCost =
                        signum(leftFill.openCost) * int(PRBMath.mulDiv(abs(leftFill.openQuantity), abs(rightFill.openCost), abs(rightFill.openQuantity)));
                    rightFill.openQuantity += leftFill.openQuantity;
                    rightFill.openCost += closeCost;

                    p.quantity -= leftFill.openQuantity;
                    p.cost -= leftFill.openCost;

                    removeFill(traderFills, i);
                    if (i > 0) i--;
                } else {
                    // rightFill partially closes leftFill
                    Fill storage leftFill = traderFills[i];
                    int closeCost =
                        signum(rightFill.openCost) * int(PRBMath.mulDiv(abs(rightFill.openQuantity), abs(leftFill.openCost), abs(leftFill.openQuantity)));
                    leftFill.openCost += closeCost;
                    leftFill.openQuantity += rightFill.openQuantity;
                    leftFill.closeCost += rightFill.openCost;
                    leftFill.closeQuantity += rightFill.openQuantity;

                    int pnl = rightFill.openCost - closeCost;
                    wallets[msg.sender][address(future.quote().token())] = wallets[msg.sender][address(future.quote().token())] + pnl;
                    // TODO what to do with the PnL???

                    p.quantity += rightFill.openQuantity;
                    p.cost += closeCost;
                    return;
                }
            }
        }
        if (rightFill.openQuantity != 0) {
            fills[msg.sender].push(rightFill);
            p.quantity += rightFill.openQuantity;
            p.cost += rightFill.openCost;
        }
    }

    function abs(int x) internal pure returns (uint) {
        return uint(x >= 0 ? x : - x);
    }

    function signum(int x) internal pure returns (int) {
        return x >= 0 ? int(1) : - 1;
    }

    function removeFill(Fill[] storage traderFills, uint index) internal {
        if (index >= traderFills.length) return;
        for (uint i = index; i < traderFills.length - 1; i++) {
            traderFills[i] = traderFills[i + 1];
        }
        traderFills.pop();
    }

    struct Fill {
        IFuture future;
        int256 openQuantity;
        int256 openCost;
        uint8 leverage;
        int256 closeQuantity;
        int256 closeCost;
    }

    struct Position {
        int256 cost;
        int256 quantity;
    }
}
