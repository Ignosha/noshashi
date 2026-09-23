import SwiftUI

struct PortfolioView: View {
    @Binding var portfolioValue: String
    @Binding var dayChange: String
    let apiBaseURL: String
    @State private var isConnected = false
    @State private var broker: String = ""
    @State private var apiKey: String = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("PORTFOLIO")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: "#a0a0b0"))

                Spacer()

                if isConnected {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color(hex: "#00ff88"))
                            .frame(width: 6, height: 6)
                            .shadow(color: Color(hex: "#00ff88").opacity(0.5), radius: 3, x: 0, y: 0)

                        Text("CONNECTED")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(hex: "#00ff88"))
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color(hex: "#1e1e2e"))

            if !isConnected {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Connect Broker")
                        .font(.system(size: 12, weight: .semibold, design: .default))
                        .foregroundColor(Color(hex: "#e8e8ec"))

                    Picker("Broker", selection: $broker) {
                        Text("Select broker...").tag("")
                        Text("Alpaca").tag("alpaca")
                        Text("Tradier").tag("tradier")
                    }
                    .pickerStyle(.menu)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(hex: "#12121a"))
                    .cornerRadius(6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(Color(hex: "#2a2a3a"), lineWidth: 1)
                    )

                    SecureField("API Key", text: $apiKey)
                        .textFieldStyle(.plain)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(Color(hex: "#e8e8ec"))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color(hex: "#12121a"))
                        .cornerRadius(6)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color(hex: "#2a2a3a"), lineWidth: 1)
                        )

                    Button(action: connectBroker) {
                        Text("CONNECT")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(hex: "#0a0a0f"))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(
                                LinearGradient(
                                    gradient: Gradient(colors: [
                                        Color(hex: "#00f0ff"),
                                        Color(hex: "#9d4edd")
                                    ]),
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .cornerRadius(6)
                    }

                    if let errorMessage = errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(Color(hex: "#ff0044"))
                    }

                    Text("Read-only access. Credentials are encrypted.")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(Color(hex: "#4a4a5a"))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 16) {
                        portfolioMetric(title: "VALUE", value: portfolioValue, color: "#e8e8ec")
                        portfolioMetric(title: "DAY", value: dayChange, color: dayChange.hasPrefix("+") ? "#00ff88" : "#ff0044")
                    }

                    Divider()
                        .background(Color(hex: "#1e1e2e"))

                    Text("POSITIONS")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(hex: "#6b6b7b"))

                    Text("Open web dashboard for full details")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(Color(hex: "#4a4a5a"))

                    Button(action: {
                        if let url = URL(string: "http://localhost:3000/portfolio") {
                            NSWorkspace.shared.open(url)
                        }
                    }) {
                        Text("OPEN DASHBOARD →")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(hex: "#00f0ff"))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(Color(hex: "#00f0ff").opacity(0.3), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
        .onAppear {
            fetchPortfolio()
        }
    }

    private func portfolioMetric(title: String, value: String, color: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(Color(hex: "#4a4a5a"))

            Text(value)
                .font(.system(size: 16, weight: .bold, design: .monospaced))
                .foregroundColor(Color(hex: color))
        }
    }

    private func connectBroker() {
        guard !broker.isEmpty && !apiKey.isEmpty else { return }

        guard let url = URL(string: "\(apiBaseURL)/portfolio/connect") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["broker": broker, "api_key": apiKey]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, _, error in
            DispatchQueue.main.async {
                if let error = error {
                    errorMessage = "Connection failed"
                    return
                }

                isConnected = true
                fetchPortfolio()
            }
        }.resume()
    }

    private func fetchPortfolio() {
        guard isConnected, let url = URL(string: "\(apiBaseURL)/portfolio") else { return }

        URLSession.shared.dataTask(with: url) { data, _, error in
            DispatchQueue.main.async {
                if let data = data {
                    do {
                        let decoded = try JSONDecoder().decode(PortfolioSummary.self, from: data)
                        portfolioValue = "$\(String(format: "%.2f", decoded.totalValue))"
                        let change = decoded.dayChange
                        dayChange = change >= 0 ? "+$\(String(format: "%.2f", change))" : "-$\(String(format: "%.2f", abs(change)))"
                    } catch {
                        portfolioValue = "Error"
                    }
                }
            }
        }.resume()
    }
}
