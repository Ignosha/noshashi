import AppKit
import Foundation
import WebKit
import Security
import Darwin

struct OperatorFailure: Error {
    let code: String
    init(_ code: String) { self.code = code }
}

enum OperatorPolicy {
    static let serviceURL = "https://noshashi-operator.joshedmond18.workers.dev"
    static let maximumResponseBytes = 1_048_576
    static let methods = ["status": "GET", "run": "POST", "report": "POST", "billing-sync": "POST"]

    static func validateToken(_ token: String) throws {
        guard token.utf8.count >= 32, token.utf8.count <= 1024,
              token.unicodeScalars.allSatisfy({ $0.value >= 33 && $0.value <= 126 }) else {
            throw OperatorFailure("invalid_token")
        }
    }

    static func request(action: String, token: String) throws -> URLRequest {
        try validateToken(token)
        guard let method = methods[action], let url = URL(string: serviceURL + "/" + action) else {
            throw OperatorFailure("unsupported_action")
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.httpMethod = method
        request.httpShouldHandleCookies = false
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("NOSHASHI-Operator-Mac/1.0", forHTTPHeaderField: "User-Agent")
        return request
    }

    static func isTrustedDocument(_ url: URL?, trusted: URL) -> Bool {
        guard let url = url, url.isFileURL, trusted.isFileURL,
              url.query == nil, url.fragment == nil,
              url.standardizedFileURL.resolvingSymlinksInPath().path == trusted.standardizedFileURL.resolvingSymlinksInPath().path else { return false }
        return true
    }

    static func validMessageID(_ id: String) -> Bool {
        return !id.isEmpty && id.utf8.count <= 100 && id.unicodeScalars.allSatisfy {
            (48...57).contains($0.value) || (65...90).contains($0.value) || (97...122).contains($0.value) || $0.value == 45 || $0.value == 95
        }
    }

    static func replyJSON(_ object: [String: Any]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard var result = String(data: data, encoding: .utf8) else { throw OperatorFailure("invalid_response") }
        result = result.replacingOccurrences(of: "<", with: "\\u003c")
            .replacingOccurrences(of: ">", with: "\\u003e")
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return result
    }
}

protocol OperatorTokenStore {
    func load() throws -> String?
    func save(_ token: String) throws
    func delete() throws
}

struct KeychainTokenStore: OperatorTokenStore {
    private let service = "com.noshashi.operator"
    private let account = "operator-admin"
    private var query: [String: Any] {
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service, kSecAttrAccount as String: account,
                kSecAttrSynchronizable as String: false]
    }

    func load() throws -> String? {
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else { throw OperatorFailure("keychain_access_denied") }
        try OperatorPolicy.validateToken(token)
        return token
    }

    func save(_ token: String) throws {
        try OperatorPolicy.validateToken(token)
        // A normal local login-Keychain item works with the free ad-hoc build.
        // iOS-style accessibility classes require the data-protection Keychain and
        // provisioned entitlements; do not silently claim those protections here.
        let values: [String: Any] = [kSecValueData as String: Data(token.utf8)]
        let updated = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw OperatorFailure("keychain_access_denied") }
        var item = query
        for (key, value) in values { item[key] = value }
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw OperatorFailure("keychain_access_denied") }
    }

    func delete() throws {
        let result = SecItemDelete(query as CFDictionary)
        guard result == errSecSuccess || result == errSecItemNotFound else { throw OperatorFailure("keychain_access_denied") }
    }
}

final class OperatorConnection {
    private let store: OperatorTokenStore
    init(store: OperatorTokenStore = KeychainTokenStore()) { self.store = store }
    func token() throws -> String? { return try store.load() }
    func metadata() throws -> [String: Any] {
        return ["storedToken": try store.load() != nil, "serviceURL": OperatorPolicy.serviceURL]
    }
    func persistValidatedToken(_ token: String) throws {
        try OperatorPolicy.validateToken(token)
        try store.save(token)
    }
    func disconnect() throws { try store.delete() }
}

/// A single bounded request with no redirects, cookies, disk cache or credential storage.
final class OperatorRequest: NSObject, URLSessionDataDelegate {
    private let completion: (Result<[String: Any], OperatorFailure>) -> Void
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var bytes = Data()
    private var completed = false
    private let lock = NSLock()

    init(completion: @escaping (Result<[String: Any], OperatorFailure>) -> Void) {
        self.completion = completion
        super.init()
    }

    func start(_ request: URLRequest) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = false
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
        self.session = session
        let task = session.dataTask(with: request)
        self.task = task
        task.resume()
    }

    func cancel() {
        lock.lock()
        let activeTask = task
        lock.unlock()
        activeTask?.cancel()
        finish(.failure(OperatorFailure("request_cancelled")))
    }

    private func finish(_ result: Result<[String: Any], OperatorFailure>) {
        lock.lock()
        if completed { lock.unlock(); return }
        completed = true
        let activeSession = session
        session = nil
        task = nil
        lock.unlock()
        activeSession?.invalidateAndCancel()
        DispatchQueue.main.async { self.completion(result) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
        finish(.failure(OperatorFailure("redirect_not_allowed")))
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        // System certificate validation remains enabled; no user/password/client-certificate fallback.
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
            completionHandler(.performDefaultHandling, nil)
        } else { completionHandler(.cancelAuthenticationChallenge, nil) }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse else {
            completionHandler(.cancel); finish(.failure(OperatorFailure("operator_unavailable"))); return
        }
        guard http.statusCode == 200 else {
            completionHandler(.cancel)
            let code = http.statusCode == 401 ? "unauthorized" : http.statusCode == 429 ? "rate_limited" : "operator_unavailable"
            finish(.failure(OperatorFailure(code))); return
        }
        guard response.mimeType?.lowercased() == "application/json",
              response.expectedContentLength <= Int64(OperatorPolicy.maximumResponseBytes) else {
            completionHandler(.cancel); finish(.failure(OperatorFailure("invalid_response"))); return
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard bytes.count <= OperatorPolicy.maximumResponseBytes - data.count else {
            finish(.failure(OperatorFailure("response_too_large"))); return
        }
        bytes.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error as? URLError {
            let code = error.code == .timedOut ? "timeout" : error.code == .cancelled ? "request_cancelled" : "network_unavailable"
            finish(.failure(OperatorFailure(code))); return
        }
        if error != nil { finish(.failure(OperatorFailure("network_unavailable"))); return }
        do {
            guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], object["ok"] as? Bool == true else {
                throw OperatorFailure("invalid_response")
            }
            if object["status"] as? String == "runtime_key_missing" {
                finish(.failure(OperatorFailure("runtime_key_missing"))); return
            }
            finish(.success(object))
        } catch { finish(.failure(OperatorFailure("invalid_response"))) }
    }
}

final class OperatorBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private let trustedURL: URL
    private let connection: OperatorConnection
    private var requests: [String: OperatorRequest] = [:]
    private var actions = Set<String>()
    private var epoch: UInt64 = 0

    init(trustedURL: URL, connection: OperatorConnection = OperatorConnection()) {
        self.trustedURL = trustedURL
        self.connection = connection
        super.init()
    }

    private func reply(_ id: String, result: Result<[String: Any], OperatorFailure>) {
        guard OperatorPolicy.isTrustedDocument(webView?.url, trusted: trustedURL) else { return }
        var object: [String: Any] = ["id": id]
        switch result {
        case .success(let data): object["ok"] = true; object["data"] = data
        case .failure(let error): object["ok"] = false; object["error"] = error.code
        }
        guard let json = try? OperatorPolicy.replyJSON(object) else { return }
        webView?.evaluateJavaScript("if (typeof window.operatorReceive === 'function') { window.operatorReceive(" + json + "); }") { _, _ in }
    }

    private func cancelActive() {
        epoch &+= 1
        let pending = Array(requests.values)
        requests.removeAll()
        actions.removeAll()
        for request in pending { request.cancel() }
    }

    private func fetch(action: String, id: String, token: String,
                       completion: @escaping (Result<[String: Any], OperatorFailure>) -> Void) throws {
        guard requests.count < 3, !actions.contains(action), requests[id] == nil else { throw OperatorFailure("request_busy") }
        let request = try OperatorPolicy.request(action: action, token: token)
        let generation = epoch
        let job = OperatorRequest { [weak self] result in
            guard let self = self else { return }
            guard generation == self.epoch else { self.reply(id, result: .failure(OperatorFailure("request_cancelled"))); return }
            self.requests.removeValue(forKey: id)
            self.actions.remove(action)
            completion(result)
        }
        requests[id] = job
        actions.insert(action)
        job.start(request)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "operator", message.frameInfo.isMainFrame, message.webView === webView,
              OperatorPolicy.isTrustedDocument(message.frameInfo.request.url, trusted: trustedURL),
              OperatorPolicy.isTrustedDocument(webView?.url, trusted: trustedURL),
              let body = message.body as? [String: Any], let id = body["id"] as? String,
              OperatorPolicy.validMessageID(id), let action = body["action"] as? String, action.utf8.count <= 40 else { return }
        do {
            switch action {
            case "connection-status": reply(id, result: .success(try connection.metadata()))
            case "save-connection":
                guard let payload = body["payload"] as? [String: Any], let token = payload["token"] as? String else { throw OperatorFailure("invalid_token") }
                try OperatorPolicy.validateToken(token)
                cancelActive()
                try fetch(action: "status", id: id, token: token) { [weak self] result in
                    guard let self = self else { return }
                    switch result {
                    case .failure(let error): self.reply(id, result: .failure(error))
                    case .success:
                        do {
                            try self.connection.persistValidatedToken(token)
                            self.reply(id, result: .success(try self.connection.metadata()))
                        } catch { self.reply(id, result: .failure(OperatorFailure("keychain_access_denied"))) }
                    }
                }
            case "disconnect":
                cancelActive()
                try connection.disconnect()
                reply(id, result: .success(["storedToken": false, "serviceURL": OperatorPolicy.serviceURL]))
            case "open-secure-setup":
                guard let setup = Bundle.main.url(forResource: "SETUP", withExtension: "html") else { throw OperatorFailure("setup_unavailable") }
                guard NSWorkspace.shared.open(setup) else { throw OperatorFailure("setup_unavailable") }
                reply(id, result: .success(["opened": true]))
            default:
                guard OperatorPolicy.methods[action] != nil else { throw OperatorFailure("unsupported_action") }
                guard let token = try connection.token() else { throw OperatorFailure("not_connected") }
                try fetch(action: action, id: id, token: token) { [weak self] result in self?.reply(id, result: result) }
            }
        } catch let failure as OperatorFailure { reply(id, result: .failure(failure)) }
        catch { reply(id, result: .failure(OperatorFailure("operator_unavailable"))) }
    }
}

final class OperatorApplicationDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow?
    private var bridge: OperatorBridge?
    private var trustedURL: URL?

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let pageURL = Bundle.main.url(forResource: "index", withExtension: "html"), let resources = Bundle.main.resourceURL else {
            let alert = NSAlert()
            alert.messageText = "The desktop interface is missing."
            alert.informativeText = "Download a complete NOSHASHI Operator app bundle and try again."
            alert.runModal()
            NSApp.terminate(nil)
            return
        }
        trustedURL = pageURL
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        let bridge = OperatorBridge(trustedURL: pageURL)
        configuration.userContentController.add(bridge, name: "operator")
        self.bridge = bridge
        let webView = WKWebView(frame: .zero, configuration: configuration)
        bridge.webView = webView
        webView.navigationDelegate = self
        webView.uiDelegate = self
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 850),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "NOSHASHI Operator"
        window.minSize = NSSize(width: 820, height: 640)
        window.backgroundColor = NSColor(calibratedRed: 0.09, green: 0.10, blue: 0.09, alpha: 1)
        window.isReleasedWhenClosed = false
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window
        installMenu()
        webView.loadFileURL(pageURL, allowingReadAccessTo: resources)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func installMenu() {
        let menu = NSMenu()
        let applicationItem = NSMenuItem(title: "NOSHASHI Operator", action: nil, keyEquivalent: "")
        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "About NOSHASHI Operator", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        applicationMenu.addItem(.separator())
        applicationMenu.addItem(withTitle: "Hide NOSHASHI Operator", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        applicationMenu.addItem(withTitle: "Quit NOSHASHI Operator", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        menu.addItem(applicationItem)
        let editItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        let editMenu = NSMenu(title: "Edit")
        for (title, selector, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        let redo = NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.insertItem(redo, at: 1)
        editItem.submenu = editMenu
        menu.addItem(editItem)
        NSApp.mainMenu = menu
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { return true }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.targetFrame?.isMainFrame == true, let trusted = trustedURL,
              OperatorPolicy.isTrustedDocument(navigationAction.request.url, trusted: trusted) else {
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { return nil }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) { completionHandler(nil) }

    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
}

@main
struct OperatorMain {
    static func main() {
        if CommandLine.arguments.contains("--native-self-test") { exit(NativeSmoke.run()) }
        let application = NSApplication.shared
        application.setActivationPolicy(.regular)
        let delegate = OperatorApplicationDelegate()
        application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }
}
