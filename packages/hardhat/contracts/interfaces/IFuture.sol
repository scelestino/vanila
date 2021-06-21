pragma solidity >=0.6.0 <0.9.0;
pragma abicoder v2;
//SPDX-License-Identifier: MIT

interface IFuture {
    function base() external returns (address);
    function quote() external returns (address);
    function expiry() external returns (uint);
    
    function long(uint amount) external returns (uint);
    function short(uint amount) external returns (uint);
}