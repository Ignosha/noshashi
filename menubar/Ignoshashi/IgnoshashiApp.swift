import SwiftUI

@main
struct IgnoshashiApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusBar: NSStatusBar?
    var statusItem: NSStatusItem?
    var popover: NSPopover?
    var monitor: SignalMonitor?

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusBar = NSStatusBar.system
        statusItem = statusBar?.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "chart.line.uptrend.xyaxis", accessibilityDescription: "Ignoshashi")
            button.image?.isTemplate = true
            button.action = #selector(togglePopover)
            button.target = self
        }

        popover = NSPopover()
        popover?.contentSize = NSSize(width: 360, height: 480)
        popover?.behavior = .transient
        popover?.contentViewController = NSHostingController(rootView: MenuBarView())

        monitor = SignalMonitor()
        monitor?.startMonitoring()
    }

    @objc func togglePopover(_ sender: AnyObject?) {
        guard let button = statusItem?.button else { return }

        if let popover = popover, popover.isShown {
            popover.performClose(sender)
        } else {
            popover?.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            popover?.animates = true
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        monitor?.stopMonitoring()
    }
}
