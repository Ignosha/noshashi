import { Component, type ErrorInfo, type ReactNode } from "react";
import { NovaLogo } from "./NovaLogo";
import { CONTACT } from "@/lib/brand";

type Props = {
  children: ReactNode;
  /** Named so the fallback can say which part of the console failed. */
  scope: string;
  onReset?: () => void;
};

type State = {
  error: Error | null;
  info: string | null;
};

/**
 * ErrorBoundary — a render failure should cost one panel, not the app.
 *
 * The fallback names what broke, shows the actual message rather than a
 * shrug, and offers both a retry and a route to a human. A console an
 * operator is relying on must never go to a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged locally only — there is no telemetry endpoint by design.
    console.error(`[${this.props.scope}]`, error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  private reset = () => {
    this.setState({ error: null, info: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex h-full min-h-[240px] w-full items-center justify-center p-6"
      >
        <div className="w-full max-w-[460px] border border-no-go/40 bg-card/60 p-5">
          <span className="pointer-events-none absolute" />
          <div className="flex items-center gap-3">
            <NovaLogo size={22} animated={false} className="text-no-go" />
            <div>
              <p className="stencil text-[10px] tracking-[0.24em] text-no-go">
                {this.props.scope.toUpperCase()} FAILED TO RENDER
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                The rest of the console is still running.
              </p>
            </div>
          </div>

          <p className="mono-font selectable mt-4 max-h-[120px] overflow-y-auto break-words border border-border bg-background p-2.5 text-[9.5px] leading-relaxed text-foreground/80">
            {error.message || "Unknown error"}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              onClick={this.reset}
              className="border border-input px-3 py-1.5 text-[10px] tracking-wider text-foreground transition-colors hover:bg-accent"
            >
              RETRY
            </button>
            <a
              href={`mailto:${CONTACT.support}?subject=${encodeURIComponent(
                `Render failure: ${this.props.scope}`
              )}&body=${encodeURIComponent(error.message)}`}
              className="stencil text-[8px] tracking-[0.2em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              REPORT TO SUPPORT
            </a>
          </div>
        </div>
      </div>
    );
  }
}
