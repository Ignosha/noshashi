import SwiftUI

struct SettingsView: View {
    @AppStorage("apiBaseURL") private var apiBaseURL = "http://localhost:8000/api/v1"
    @AppStorage("refreshInterval") private var refreshInterval = 30
    @AppStorage("showNotifications") private var showNotifications = true
    @AppStorage("minConfidence") private var minConfidence = 0.6
    @AppStorage("soundEnabled") private var soundEnabled = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("SETTINGS")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: "#a0a0b0"))

                Spacer()

                Text("v1.0.0")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(Color(hex: "#4a4a5a"))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color(hex: "#1e1e2e"))

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    settingGroup(title: "CONNECTION") {
                        SettingRow(
                            title: "API URL",
                            value: $apiBaseURL,
                            placeholder: "http://localhost:8000/api/v1"
                        )
                    }

                    settingGroup(title: "ALERTS") {
                        ToggleSettingRow(
                            title: "Notifications",
                            value: $showNotifications
                        )

                        ToggleSettingRow(
                            title: "Sound",
                            value: $soundEnabled
                        )

                        SliderSettingRow(
                            title: "Min Confidence",
                            value: $minConfidence,
                            range: 0...1,
                            step: 0.1,
                            format: "%.1f"
                        )

                        SliderSettingRow(
                            title: "Refresh (sec)",
                            value: .constant(Double(refreshInterval)),
                            range: 10...300,
                            step: 10,
                            format: "%.0f",
                            onChange: { refreshInterval = Int($0) }
                        )
                    }

                    settingGroup(title: "ABOUT") {
                        HStack {
                            Text("Ignoshashi Menu Bar")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(Color(hex: "#a0a0b0"))

                            Spacer()

                            Link("Open Dashboard", destination: URL(string: "http://localhost:3000")!)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(Color(hex: "#00f0ff"))
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
    }

    private func settingGroup<T: View>(title: String, @ViewBuilder content: () -> T) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(Color(hex: "#6b6b7b"))
                .padding(.top, 8)

            content()
        }
    }
}

struct SettingRow: View {
    let title: String
    @Binding var value: String
    let placeholder: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(Color(hex: "#6b6b7b"))

            TextField(placeholder, text: $value)
                .textFieldStyle(.plain)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(Color(hex: "#e8e8ec"))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(hex: "#12121a"))
                .cornerRadius(6)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(hex: "#2a2a3a"), lineWidth: 1)
                )
        }
    }
}

struct ToggleSettingRow: View {
    let title: String
    @Binding var value: Bool

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(Color(hex: "#a0a0b0"))

            Spacer()

            Toggle("", isOn: $value)
                .toggleStyle(.switch)
                .controlSize(.small)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color(hex: "#12121a").opacity(0.5))
        )
    }
}

struct SliderSettingRow: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let format: String
    var onChange: ((Double) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(Color(hex: "#a0a0b0"))

                Spacer()

                Text(String(format: format, value))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(Color(hex: "#00f0ff"))
                    .frame(width: 40, alignment: .trailing)
            }

            Slider(value: $value, in: range, step: step)
                .onChange(of: value) { newValue in
                    onChange?(newValue)
                }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
    }
}
