"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Also push to the diagnostic bar
    if (typeof window !== "undefined" && (window as any).__diagLog) {
      (window as any).__diagLog(
        "❌ REACT ERROR BOUNDARY: " + error.message + "\n" + (info.componentStack || "")
      );
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            margin: 16,
            background: "#7f1d1d",
            color: "#fca5a5",
            borderRadius: 8,
            fontFamily: "monospace",
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            marginTop: 60, // clear the diagnostic bar
          }}
        >
          <strong>React crashed during render:</strong>
          {"\n\n"}
          {this.state.error?.message || "Unknown error"}
          {"\n\n"}
          {this.state.error?.stack || "No stack trace"}
        </div>
      );
    }

    return this.props.children;
  }
}
