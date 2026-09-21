import SwiftUI

struct SignalsView: View {
    @Binding var signals: [Signal]
    @Binding var isLoading: Bool
    let apiBaseURL: String
    @State private var lastUpdated: Date?
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("SIGNALS")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: "#a0a0b0"))

                Spacer()

                if let lastUpdated = lastUpdated {
                    Text(lastUpdated, style: .time)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(Color(hex: "#4a4a5a"))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color(hex: "#1e1e2e"))

            if let errorMessage = errorMessage {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(Color(hex: "#ffee00"))
                    Text(errorMessage)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(Color(hex: "#ffee00"))
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }

            if isLoading {
                ProgressView()
                    .scaleEffect(0.5)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if signals.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "chart.xyaxis.line")
                        .font(.system(size: 24))
                        .foregroundColor(Color(hex: "#4a4a5a"))

                    Text("No signals available")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(Color(hex: "#6b6b7b"))

                    Text("Run a scan from the web dashboard")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(Color(hex: "#4a4a5a"))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 1) {
                        ForEach(signals.prefix(8), id: \.id) { signal in
                            SignalRow(signal: signal)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
            }
        }
        .onAppear {
            fetchSignals()
        }
    }

    private func fetchSignals() {
        guard let url = URL(string: "\(apiBaseURL)/signals?limit=8") else { return }

        URLSession.shared.dataTask(with: url) { data, _, error in
            DispatchQueue.main.async {
                isLoading = false

                if let error = error {
                    errorMessage = "Connection failed: \(error.localizedDescription)"
                    return
                }

                guard let data = data else {
                    errorMessage = "No data received"
                    return
                }

                do {
                    let decoded = try JSONDecoder().decode([Signal].self, from: data)
                    signals = decoded
                    lastUpdated = Date()

                    for signal in decoded.prefix(3) {
                        SignalMonitor.sendNotification(for: signal)
                    }
                } catch {
                    errorMessage = "Parse error: \(error.localizedDescription)"
                }
            }
        }.resume()
    }
}

struct SignalRow: View {
    let signal: Signal

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(signal.ticker)
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(hex: "#e8e8ec"))

                    Text(signal.signalType.uppercased())
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(signal.signalType == "buy" ? Color(hex: "#00ff88").opacity(0.15) :
                                      signal.signalType == "sell" ? Color(hex: "#ff0044").opacity(0.15) :
                                      Color(hex: "#ffee00").opacity(0.15))
                        )
                        .foregroundColor(
                            signal.signalType == "buy" ? Color(hex: "#00ff88") :
                            signal.signalType == "sell" ? Color(hex: "#ff0044") :
                            Color(hex: "#ffee00")
                        )
                }

                Text(signal.aiSummary)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(Color(hex: "#a0a0b0"))
                    .lineLimit(2)

                HStack(spacing: 8) {
                    Text("Entry $\(String(format: "%.2f", signal.entryPrice))")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(Color(hex: "#6b6b7b"))

                    Text("Target $\(String(format: "%.2f", signal.targetPrice))")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(Color(hex: "#00ff88"))

                    Text("Stop $\(String(format: "%.2f", signal.stopLoss))")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(Color(hex: "#ff0044"))
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(Int(signal.confidence * 100))%")
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: "#00f0ff"))

                Text("conf")
                    .font(.system(size: 8, design: .monospaced))
                    .foregroundColor(Color(hex: "#4a4a5a"))
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color(hex: "#12121a").opacity(0.5))
        )
    }
}
