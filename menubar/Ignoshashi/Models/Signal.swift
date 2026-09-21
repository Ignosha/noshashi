import Foundation

struct Signal: Codable, Identifiable {
    let id: String
    let ticker: String
    let signalType: String
    let confidence: Double
    let entryPrice: Double
    let targetPrice: Double
    let stopLoss: Double
    let timeframe: String
    let strategy: String
    let aiSummary: String
    let sentimentScore: Double
    let sources: [String]
    let createdAt: Date
    let expiresAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case ticker
        case signalType = "signal_type"
        case confidence
        case entryPrice = "entry_price"
        case targetPrice = "target_price"
        case stopLoss = "stop_loss"
        case timeframe
        case strategy
        case aiSummary = "ai_summary"
        case sentimentScore = "sentiment_score"
        case sources
        case createdAt = "created_at"
        case expiresAt = "expires_at"
    }
}

struct PortfolioSummary: Codable {
    let totalValue: Double
    let totalPnl: Double
    let totalPnlPct: Double
    let dayChange: Double
    let dayChangePct: Double
    let positions: [Position]
    let riskMetrics: RiskMetrics
    let lastUpdated: Date

    enum CodingKeys: String, CodingKey {
        case totalValue = "total_value"
        case totalPnl = "total_pnl"
        case totalPnlPct = "total_pnl_pct"
        case dayChange = "day_change"
        case dayChangePct = "day_change_pct"
        case positions
        case riskMetrics = "risk_metrics"
        case lastUpdated = "last_updated"
    }
}

struct Position: Codable {
    let ticker: String
    let quantity: Double
    let avgCost: Double
    let currentPrice: Double
    let marketValue: Double
    let unrealizedPnl: Double
    let unrealizedPnlPct: Double
    let dayChange: Double
    let dayChangePct: Double

    enum CodingKeys: String, CodingKey {
        case ticker
        case quantity
        case avgCost = "avg_cost"
        case currentPrice = "current_price"
        case marketValue = "market_value"
        case unrealizedPnl = "unrealized_pnl"
        case unrealizedPnlPct = "unrealized_pnl_pct"
        case dayChange = "day_change"
        case dayChangePct = "day_change_pct"
    }
}

struct RiskMetrics: Codable {
    let var95: Double
    let var99: Double
    let beta: Double
    let sharpe: Double
    let maxDrawdown: Double

    enum CodingKeys: String, CodingKey {
        case var95 = "var_95"
        case var99 = "var_99"
        case beta
        case sharpe
        case maxDrawdown = "max_drawdown"
    }
}
