
pragma solidity ^0.8.20;

import "./BONA.sol";

contract BONAFIDE {

BONA public bona;
address public owner;

constructor(){
owner=msg.sender;
bona=new BONA();
}

function mintBONA(address to,uint256 amount) external{
require(msg.sender==owner);
bona.mint(to,amount);
}

}
