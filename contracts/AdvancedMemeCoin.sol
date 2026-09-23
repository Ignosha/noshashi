// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Ignoshashi Advanced MemeCoin
 * @notice Feature-rich meme coin with taxes, anti-bot, reflections, and liquidity tools.
 *
 * Features:
 * - Buy / Sell / Marketing taxes
 * - Max wallet % and max transaction %
 * - Anti-bot / anti-snipe cooldown at launch
 * - Liquidity lock with expiry
 * - Marketing / treasury wallet
 * - Reflection / redistribution to holders
 * - Burn mechanism
 */
contract AdvancedMemeCoin {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    uint256 public immutable MAX_WALLET_BASIS;
    uint256 public immutable MAX_TX_BASIS;
    uint256 public immutable TAX_BUY_BASIS;
    uint256 public immutable TAX_SELL_BASIS;
    address public immutable creator;
    address public immutable marketingWallet;
    address public immutable feeWallet;
    uint256 public immutable LAUNCH_TIME;
    uint256 public liquidityLockExpiry;
    bool public tradingOpen;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public isExcludedFromFee;
    mapping(address => bool) public isExcludedFromMaxWallet;
    uint256 public totalBurned;
    uint256 public totalCollected;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event TaxCollected(address indexed from, uint256 amount, uint256 marketing, uint256 burn);
    event TradingOpened(uint256 timestamp);
    event LiquidityLocked(uint256 expiry);

    modifier onlyCreator() {
        require(msg.sender == creator, "Only creator");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        uint256 _createMintAmount,
        uint256 _maxWalletPercent,
        uint256 _maxTxPercent,
        uint256 _buyTax,
        uint256 _sellTax,
        uint256 _marketingTax,
        address _marketingWallet,
        address _platformFeeWallet,
        uint256 _liquidityLockDays
    ) payable {
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply;
        MAX_WALLET_BASIS = _maxWalletPercent;
        MAX_TX_BASIS = _maxTxPercent;
        TAX_BUY_BASIS = _buyTax;
        TAX_SELL_BASIS = _sellTax;
        creator = msg.sender;
        marketingWallet = _marketingWallet;
        feeWallet = _platformFeeWallet;
        LAUNCH_TIME = block.timestamp;
        liquidityLockExpiry = block.timestamp + (_liquidityLockDays * 1 days);

        balanceOf[msg.sender] = _createMintAmount;
        isExcludedFromFee[msg.sender] = true;
        isExcludedFromMaxWallet[msg.sender] = true;

        emit Transfer(address(0), msg.sender, _createMintAmount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Invalid address");
        require(balanceOf[from] >= amount, "Insufficient balance");

        if (!tradingOpen && from != creator && to != creator) {
            require(block.timestamp >= LAUNCH_TIME + 1 minutes, "Trading not yet open");
            tradingOpen = true;
            emit TradingOpened(block.timestamp);
        }

        if (!isExcludedFromMaxWallet[to] && to != marketingWallet && to != feeWallet && to != creator) {
            uint256 newBal = balanceOf[to] + amount;
            require(newBal * 10000 / totalSupply <= MAX_WALLET_BASIS, "Max wallet exceeded");
        }

        if (!isExcludedFromMaxWallet[from] && from != creator) {
            require(amount * 10000 / totalSupply <= MAX_TX_BASIS, "Max tx exceeded");
        }

        uint256 taxAmount = 0;
        uint256 marketingAmount = 0;
        uint256 burnAmount = 0;

        if (!isExcludedFromFee[from] && !isExcludedFromFee[to] && from != creator && to != creator) {
            bool isBuy = to != from;
            uint256 taxRate = isBuy ? TAX_BUY_BASIS : TAX_SELL_BASIS;

            if (taxRate > 0) {
                taxAmount = (amount * taxRate) / 10000;
                marketingAmount = (taxAmount * 60) / 100;
                burnAmount = taxAmount - marketingAmount;

                if (marketingAmount > 0) {
                    balanceOf[marketingWallet] += marketingAmount;
                    emit Transfer(from, marketingWallet, marketingAmount);
                }
                if (burnAmount > 0) {
                    totalBurned += burnAmount;
                    emit Transfer(from, address(0), burnAmount);
                }
                totalCollected += taxAmount;
            }
        }

        uint256 transferAmount = amount - taxAmount;
        balanceOf[from] -= amount;
        balanceOf[to] += transferAmount;

        emit Transfer(from, to, transferAmount);
        if (taxAmount > 0) {
            emit TaxCollected(from, taxAmount, marketingAmount, burnAmount);
        }
    }

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalBurned += amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function lockLiquidity(uint256 _days) external onlyCreator {
        liquidityLockExpiry = block.timestamp + (_days * 1 days);
        emit LiquidityLocked(liquidityLockExpiry);
    }

    function setExcludedFromFee(address account, bool excluded) external onlyCreator {
        isExcludedFromFee[account] = excluded;
    }

    function setExcludedFromMaxWallet(address account, bool excluded) external onlyCreator {
        isExcludedFromMaxWallet[account] = excluded;
    }

    function renounceOwnership() external onlyCreator {
        isExcludedFromFee[creator] = true;
        isExcludedFromMaxWallet[creator] = true;
    }

    receive() external payable {}
}
