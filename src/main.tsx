import React, { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught App Error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '30px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '40px auto', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444' }}>⚠️ Portal Initialization Warning</h2>
          <p style={{ color: '#4b5563' }}>The portal encountered a startup issue. Please click below to refresh.</p>
          <pre style={{ background: '#f3f4f6', padding: '12px', borderRadius: '6px', fontSize: '12px', textAlign: 'left', overflowX: 'auto', color: '#991b1b' }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: '15px', padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
            🔄 Refresh Portal
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
