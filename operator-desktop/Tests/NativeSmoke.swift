import Foundation

private final class MemoryTokenStore: OperatorTokenStore {
    var value: String?
    var writes = 0
    func load() throws -> String? { return value }
    func save(_ token: String) throws { value = token; writes += 1 }
    func delete() throws { value = nil }
}

enum NativeSmoke {
    static func run() -> Int32 {
        var checks = 0
        func require(_ condition: @autoclosure () throws -> Bool) throws {
            guard try condition() else { throw OperatorFailure("native_self_test_failed") }
            checks += 1
        }
        func requireReject(_ body: () throws -> Void) throws {
            do { try body() } catch { checks += 1; return }
            throw OperatorFailure("native_self_test_failed")
        }
        do {
            let token = String(repeating: "A", count: 64)
            try OperatorPolicy.validateToken(token)
            checks += 1
            for invalid in ["", String(repeating: "a", count: 31), String(repeating: "a", count: 1025), token + "\n", token + " ", token + "\u{00e9}"] {
                try requireReject { try OperatorPolicy.validateToken(invalid) }
            }
            for (action, method) in OperatorPolicy.methods {
                let request = try OperatorPolicy.request(action: action, token: token)
                try require(request.url?.absoluteString == OperatorPolicy.serviceURL + "/" + action)
                try require(request.httpMethod == method)
                try require(request.httpBody == nil)
                try require(request.value(forHTTPHeaderField: "Authorization") == "Bearer " + token)
                try require(request.url?.query == nil && request.url?.user == nil && request.url?.password == nil)
                try require(request.httpShouldHandleCookies == false)
            }
            for action in ["https://evil.example", "../report", "status?account=other", "/status", "charge", "refund"] {
                try requireReject { _ = try OperatorPolicy.request(action: action, token: token) }
            }
            let trusted = URL(fileURLWithPath: "/Applications/NOSHASHI Operator.app/Contents/Resources/index.html")
            try require(OperatorPolicy.isTrustedDocument(trusted, trusted: trusted))
            for invalid in [URL(string: "https://noshashi-operator.joshedmond18.workers.dev")!,
                            URL(fileURLWithPath: "/tmp/index.html"), URL(string: trusted.absoluteString + "?token=bad")!,
                            URL(string: trusted.absoluteString + "#frame")!] {
                try require(!OperatorPolicy.isTrustedDocument(invalid, trusted: trusted))
            }
            try require(OperatorPolicy.validMessageID("abc_123-DEF"))
            try require(!OperatorPolicy.validMessageID(""))
            try require(!OperatorPolicy.validMessageID("quote\";alert(1)"))
            try require(!OperatorPolicy.validMessageID(String(repeating: "a", count: 101)))
            let malicious = "</script><img onerror='attack()'> \" ); attack(); // \u{2028}\u{2029}"
            let json = try OperatorPolicy.replyJSON(["id": "safe", "ok": true, "data": ["title": malicious]])
            let decoded = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
            try require((decoded?["data"] as? [String: Any])?["title"] as? String == malicious)
            try require(!json.contains("<") && !json.contains(">") && !json.contains("\u{2028}") && !json.contains("\u{2029}"))
            let memory = MemoryTokenStore()
            let connection = OperatorConnection(store: memory)
            try require(try connection.metadata()["storedToken"] as? Bool == false)
            try requireReject { try connection.persistValidatedToken("short") }
            try require(memory.writes == 0)
            try connection.persistValidatedToken(token)
            try require(memory.writes == 1)
            let metadata = try connection.metadata()
            try require(metadata["storedToken"] as? Bool == true)
            try require(metadata["token"] == nil && metadata["Authorization"] == nil)
            try require(try connection.token() == token)
            try connection.disconnect()
            try require(try connection.token() == nil)
            print("Native self-test passed (\(checks) checks; no real Keychain or network access)")
            return 0
        } catch {
            print("Native self-test failed")
            return 1
        }
    }
}
