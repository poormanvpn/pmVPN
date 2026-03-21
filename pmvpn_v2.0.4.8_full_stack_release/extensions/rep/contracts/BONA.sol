
pragma solidity ^0.8.20;

contract BONA {
string public constant name="Bona Fide";
string public constant symbol="BONA";

uint256 public totalSupply;
mapping(address=>uint256) public balanceOf;

function mint(address to,uint256 amount) public {
balanceOf[to]+=amount;
totalSupply+=amount;
}
}
