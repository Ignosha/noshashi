# AI governance

Last reviewed 2026-09-29 against `src/lib/noshx/`, `src/lib/agent/` and
`src-tauri/src/model_proxy.rs`. It covers what the assistant (NOSHX) may do,
where data goes, and how its use is recorded.

## Position

The deterministic engine decides and the assistant explains. NOSHX:

- **never issues a verdict.** GO / HOLD / NO-GO come only from the rule
  engine ([POLICY_ENGINE.md](POLICY_ENGINE.md));
- **never signs, submits or holds keys.** Its tools are read-only ledger
  readers and NOSHASHI's own pages;
- **is never the source of a figure.** Every number it states must come from
  a tool result or the live state it was given, with the ledger index where
  the reading has one. If a tool fails or is not on the plan, it says so
  rather than guessing;
- **loses to the engine.** If an answer and a recorded verdict disagree, the
  verdict stands;
- **makes no legal claims.** A Travel Rule result is described as a review
  under the institution's configured policy, never as a statement that a
  legal obligation applies.

These rules are in the system prompt (`src/lib/agent/context.ts`,
`src/lib/noshx/loop.ts`) and, more importantly, in the architecture: the
assistant has no tool that decides or writes.

## Engines

| Engine | Where it runs | What leaves the machine |
|---|---|---|
| **NOSHX Core** (default) | Inside the app. Intent planner, tool runner and extractive answers; no language model | Only the ledger reads, to public XRPL servers |
| **Local model** (Ollama, LM Studio, llama.cpp, Jan, vLLM on loopback) | The operator's machine | Nothing beyond the machine; the prompt goes to `localhost` |
| **Hosted model** (Anthropic, OpenAI, Groq, OpenRouter, DeepSeek, Mistral, custom) | The provider, with the operator's own key | The question and the live state included in the prompt, over TLS, under that provider's terms |

Whether a call stays on the device is decided from the endpoint actually
configured, not the provider's label: a local runtime pointed at a remote
host is treated and labelled as remote. Remote endpoints must use HTTPS
(`isEndpointSafe`). The screen shows a plain statement of where prompts go
(`dataBoundary()`) and lists the fields of live state placed in each prompt
(`disclosedFields()`).

## Keys

Hosted-model keys are stored in the OS keychain and used only in Rust
(`model_request` in `model_proxy.rs`). The web view never receives them, so
script running in the web view cannot read them.

## Tools

Twenty-nine read-only tools, each backed by the same reader a screen uses:
ledger status and sync, order books, AMM pools, settlement, issuance, token
rights, control surface, provenance, claims, clusters, transaction
explanation, stuck funds, address checks and screening, security checks,
hack investigation, drainer check, link check, scam registry, market
surveillance, authority certificates, domain verification, and search over
NOSHASHI's own documentation. None signs, submits, or changes state outside
the app.

## Citations

Every tool call produces a citation (`src/lib/noshx/citations.ts`): tool,
the screen that shows the same reading, the subject asked about, the ledger
index taken from the reading itself (never from the model's text), and when
it was read. Answers list them under **SOURCES**, and each opens its screen.
A reading with no ledger index says so.

## Use record

Every model call is recorded on the device (`AiUseRecord`, newest 2,000):
time, mode, provider, model, host, on-device or not, SHA-256 and length of
the exact prompt sent, SHA-256 and length of the response, and outcome.
Digests, not text: the record proves what was sent and when without keeping
a second copy of the operator's questions. It exports to CSV.

## Prompt injection

Ledger memos, domains and web pages are untrusted text. Because the
assistant has only read-only tools and no path to a decision, the worst an
injected instruction can do is produce a wrong explanation. The receipt, the
rule results and the evidence are unaffected, and the answer's SOURCES show
which readings it used.

## What is not claimed

- No model is trained on customer data. The optional NOSHX model kit
  (`scripts/noshx-model/`) is trained only on NOSHASHI's own public content.
- An assistant answer is not advice, not a compliance determination and not
  evidence. The receipt is the evidence.
