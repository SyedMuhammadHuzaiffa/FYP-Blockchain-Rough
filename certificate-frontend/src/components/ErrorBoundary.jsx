import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Application error boundary caught an error:", error, errorInfo);
  }

  refreshPage = () => {
    window.location.reload();
  };

  goToLogin = () => {
    window.location.assign("/login");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="error-boundary-shell">
        <section className="card error-boundary-card">
          <p className="eyebrow">Application Error</p>
          <h1>Something went wrong</h1>
          <p className="muted">
            The app hit an unexpected issue. Refresh the page, or return to login
            and start again.
          </p>
          <div className="button-row">
            <button type="button" className="button" onClick={this.refreshPage}>
              Refresh page
            </button>
            <button
              type="button"
              className="button button-tonal"
              onClick={this.goToLogin}
            >
              Go to login
            </button>
          </div>
        </section>
      </main>
    );
  }
}
