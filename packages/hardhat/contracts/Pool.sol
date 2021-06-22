pragma solidity >=0.6.0 <0.9.0;
//SPDX-License-Identifier: MIT

import "./interfaces/IPool.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol';

contract Pool is IPool {
  using SafeERC20 for IERC20;
  using LowGasSafeMath for uint256;

  IERC20 public override token;

  uint256 totalBalance = 0;
  mapping(address => uint) balances;

  uint256 totalShare = 0;
  mapping(address => uint) shares;

  constructor (IERC20 _token) {
    token = _token;
  }

  function deposit(uint amount) external {
    token.safeTransferFrom(msg.sender, address(this), amount);
    balances[msg.sender] = balances[msg.sender].add(amount);
    totalBalance = totalBalance.add(amount);
  }

  function depositFee(uint amount) external {
    token.safeTransferFrom(msg.sender, address(this), amount);
    totalBalance = totalBalance.add(amount);
  }

  function withdraw(uint amount) external {
    uint balance = balances[msg.sender];
    require(balance >= amount, "Pool: not enough balance");
    token.safeTransfer(msg.sender, amount);
    balances[msg.sender] = balance.sub(amount);
    totalBalance = totalBalance.sub(amount);
  }

  function wallet(address owner) external view returns (uint) {
    return balances[owner];
  }

  //TODO add security
  function borrow(uint amount, address recipient) external override {
    token.safeTransfer(recipient, amount);
    //TODO accounting
  }

}