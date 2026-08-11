// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Ignoshashi MemeCoin
 * @notice A meme coin with bonding-curve style minting.
 * 2% platform fee routed to the Ignoshashi platform vault.
 */
contract IgnoshashiMemeCoin {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    uint256 public constant PLATFORM_FEE = 200; // 2% (in basis points)

    address public creator;
    address public constant PLATFORM_FEE_ADDRESS =
        0x5985a841601aE93D8Ddfec88715C755235490404;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Mint(address indexed to, uint256 amount, uint256 fee);

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        uint256 _createMintAmount
    ) payable {
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply;

        require(msg.value > 0, "Creation requires a raise");
        uint256 fee = (msg.value * PLATFORM_FEE) / 10000;
        uint256 toCreator = msg.value - fee;

        // 2% platform fee to the Ignoshashi vault
        (bool fs, ) = PLATFORM_FEE_ADDRESS.call{value: fee}("");
        require(fs, "Fee transfer failed");

        // remaining raise to the creator
        (bool cs, ) = msg.sender.call{value: toCreator}("");
        require(cs, "Creator transfer failed");

        creator = msg.sender;
        balanceOf[msg.sender] = _createMintAmount;
        emit Mint(msg.sender, _createMintAmount, fee);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0), "Invalid address");
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Transfer(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Allowance exceeded");
        require(balanceOf[from] >= amount, "Insufficient balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    receive() external payable {}
}

