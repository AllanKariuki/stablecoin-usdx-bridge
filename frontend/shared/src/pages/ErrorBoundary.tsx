import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ServerErrorPage } from './ErrorPages';

/** Catches render crashes so a bug in one screen shows the 500 page, not a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
  }
  render() {
    return this.state.failed ? <ServerErrorPage onRetry={() => this.setState({ failed: false })} /> : this.props.children;
  }
}
