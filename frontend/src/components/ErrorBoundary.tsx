import React from 'react';
import { TriangleAlert } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error caught by ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--sr-bg-page)] px-6 text-center"
          style={{ fontFamily: 'var(--sr-font-sans)' }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(208,59,59,0.1)]">
            <TriangleAlert className="h-6 w-6 text-[var(--sr-sev-critical)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--sr-text-primary)]">Something went wrong.</h1>
            <p className="mt-1.5 max-w-sm text-sm text-[var(--sr-text-secondary)]">
              This part of the console hit an unexpected error. Reloading usually fixes it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-[var(--sr-radius-sm)] bg-[var(--sr-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--sr-accent-hover)]"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
