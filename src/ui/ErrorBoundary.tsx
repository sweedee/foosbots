import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

export function errorReport(err: unknown, where = 'app') {
  const e = err instanceof Error ? err : new Error(String(err));
  const stack = (e.stack ?? '').split('\n').slice(0, 6).join('\n');
  return `[${where}] ${e.name}: ${e.message}\n${stack}\n\n${navigator.userAgent}`;
}

/** Shows the error on screen instead of a blank page (handy on mobile where there's no console). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const report = errorReport(error, this.props.label);
    return (
      <div className="crash">
        <div className="crash-title">Something broke 😵</div>
        <pre className="crash-text">{report}</pre>
        <div className="crash-actions">
          <button onClick={() => navigator.clipboard?.writeText(report)}>Copy error</button>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <button
            onClick={() => {
              try {
                localStorage.removeItem('foosbots:v1');
              } catch {
                /* ignore */
              }
              location.reload();
            }}
          >
            Reset data
          </button>
        </div>
      </div>
    );
  }
}
