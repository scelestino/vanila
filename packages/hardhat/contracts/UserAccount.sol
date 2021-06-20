pragma solidity >=0.6.0 <0.9.0;
//SPDX-License-Identifier: MIT

import "hardhat/console.sol";
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

contract UserAccount {
    using SafeMath for uint256;
    
    IERC20 immutable lusd;
    IERC20 immutable weth;
    mapping (address => mapping (address => uint)) wallets;

    constructor(IERC20 _lusd, IERC20 _weth) {
        lusd = _lusd;
        weth = _weth;
    }

    function deposit(address token, uint amount) external {
        require(address(token) != address(0), "UserAccount: token is the zero address");

        uint prevBalance = wallets[msg.sender][token];
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        wallets[msg.sender][token] = prevBalance.add(amount);
    }

    

    function wallet(address token) external view returns (uint) {
        return wallets[msg.sender][token];
    }
}