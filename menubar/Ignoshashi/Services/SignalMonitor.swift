import Foundation
import UserNotifications

class SignalMonitor: ObservableObject {
    private var timer: Timer?
    private let apiBaseURL: String
    private var lastSignalIDs: Set<String> = []

    init(apiBaseURL: String = "http://localhost:8000/api/v1") {
        self.apiBaseURL = apiBaseURL
        requestNotificationPermission()
    }

    func startMonitoring() {
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.checkForSignals()
        }

        checkForSignals()
    }

    func stopMonitoring() {
        timer?.invalidate()
        timer = nil
    }

    private func checkForSignals() {
        guard let url = URL(string: "\(apiBaseURL)/signals?limit=10&min_confidence=0.6") else { return }

        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data else { return }

            do {
                let signals = try JSONDecoder().decode([Signal].self, from: data)

                for signal in signals where !(self?.lastSignalIDs.contains(signal.id) ?? true) {
                    self?.lastSignalIDs.insert(signal.id)
                    self?.sendNotification(for: signal)
                }
            } catch {
                print("Failed to decode signals: \(error)")
            }
        }.resume()
    }

    static func sendNotification(for signal: Signal) {
        let center = UNUserNotificationCenter.current()

        let content = UNMutableNotificationContent()
        content.title = "\(signal.ticker) — \(signal.signalType.uppercased())"
        content.body = "Confidence: \(Int(signal.confidence * 100))% | Entry: $\(String(format: "%.2f", signal.entryPrice)) | Target: $\(String(format: "%.2f", signal.targetPrice))"
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "signal-\(signal.id)",
            content: content,
            trigger: nil
        )

        center.add(request) { error in
            if let error = error {
                print("Notification error: \(error)")
            }
        }
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if !granted {
                print("Notification permission not granted")
            }
        }
    }
}
