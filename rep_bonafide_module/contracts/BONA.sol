
pragma solidity ^0.8.20;

contract BONA {

string public constant name = "Bona Fide";
string public constant symbol = "BONA";
uint8 public constant decimals = 18;

uint256 public totalSupply;
address public owner;

mapping(address => uint256) public balanceOf;

event Transfer(address indexed from,address indexed to,uint256 value);

modifier onlyOwner(){require(msg.sender==owner);_;}

constructor(){owner=msg.sender;}

function mint(address to,uint256 amount) external onlyOwner{
totalSupply+=amount;
balanceOf[to]+=amount;
emit Transfer(address(0),to,amount);
}

function transfer(address to,uint256 amount) external{
require(balanceOf[msg.sender]>=amount);
balanceOf[msg.sender]-=amount;
balanceOf[to]+=amount;
emit Transfer(msg.sender,to,amount);
}

}
