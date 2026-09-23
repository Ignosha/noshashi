import SwiftUI

struct MenuBarView: View {
    @State private var signals: [Signal] = []
    @State private var portfolioValue: String = "Loading..."
    @State private var dayChange: String = ""
    @State private var isLoading = true
    @State private var selectedTab = 0

    private let apiBaseURL = "http://localhost:8000/api/v1"

    var body: some View {
        VStack(spacing: 0) {
            headerView

            TabView(selection: $selectedTab) {
                SignalsView(signals: $signals, isLoading: $isLoading, apiBaseURL: apiBaseURL)
                    .tabItem { Label("Signals", systemImage: "chart.line.uptrend.xyaxis") }
                    .tag(0)

                PortfolioView(portfolioValue: $portfolioValue, dayChange: $dayChange, apiBaseURL: apiBaseURL)
                    .tabItem { Label("Portfolio", systemImage: "wallet.pass") }
                    .tag(1)

                SettingsView()
                    .tabItem { Label("Settings", systemImage: "gearshape") }
                    .tag(2)
            }
        }
        .frame(width: 360, height: 480)
    }

    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("IGNOSHASHI")
                    .font(.system(size: 13, weight: .bold, design: .default))
                    .foregroundColor(Color(hex: "#00f0ff"))

                Text("Menu Bar Terminal")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(Color(hex: "#6b6b7b"))
            }

            Spacer()

            HStack(spacing: 8) {
                Circle()
                    .fill(Color(hex: "#00ff88"))
                    .frame(width: 8, height: 8)
                    .shadow(color: Color(hex: "#00ff88").opacity(0.5), radius: 4, x: 0, y: 0)

                Text("LIVE")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: "#00ff88"))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(hex: "#0a0a0f"))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color(hex: "#1e1e2e")),
            alignment: .bottom
        )
    }
}

struct MenuBarView_Previews: PreviewProvider {
    static var previews: some View {
        MenuBarView()
            .frame(width: 360, height: 480)
    }
}
