
pragma solidity ^0.8.20;

import "./BONA.sol";

contract BONAFIDE {

BONA public bona;

constructor(){
bona=new BONA();
}

function mintBONA(address to,uint256 amount) external{
bona.mint(to,amount);
}
}
