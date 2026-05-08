import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("CRITICAL VAULT ERROR:", error, errorInfo);
    // Trigger Panic Lock if the logout function was passed in
    if (this.props.onPanic) {
      this.props.onPanic();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#1a0000',
          color: '#ff4d4d',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>🚨</div>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Critical System Error</h1>
          <p style={{ maxWidth: '500px', lineHeight: '1.6', marginBottom: '2rem', color: '#ff9999' }}>
            A critical error occurred. As a security precaution, the vault has been <strong>Panic Locked</strong> and all encryption keys have been wiped from memory.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#ff4d4d',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Reload Application
          </button>
          <pre style={{
            marginTop: '3rem',
            padding: '1rem',
            backgroundColor: '#000',
            borderRadius: '8px',
            fontSize: '0.8rem',
            textAlign: 'left',
            maxWidth: '100%',
            overflowX: 'auto',
            color: '#888'
          }}>
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
