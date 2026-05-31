import { Component } from 'react';

export class ErrorBoundary extends Component {
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
          backgroundColor: '#100000',
          color: 'var(--error)',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div className="animate-fade" style={{ maxWidth: '600px' }}>
            <div style={{ fontSize: '5rem', marginBottom: '1.5rem' }}>🚨</div>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', fontWeight: '900' }}>Panic Lock Engaged</h1>
            <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '2.5rem', color: '#ffb3b3' }}>
              A critical error occurred. As a security precaution, the vault has been <strong style={{ color: '#fff' }}>Panic Locked</strong> and all encryption keys have been wiped from memory.
            </p>
            <button 
              onClick={() => window.location.reload()} 
              style={{
                padding: '1rem 2rem',
                backgroundColor: 'var(--error)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '900',
                fontSize: '1.1rem',
                cursor: 'pointer',
                boxShadow: '0 10px 30px rgba(255, 77, 77, 0.3)'
              }}
            >
              Restart SecureStore
            </button>
            {this.state.error && (
              <pre style={{
                marginTop: '4rem',
                padding: '1.5rem',
                backgroundColor: '#000',
                borderRadius: '12px',
                fontSize: '0.85rem',
                textAlign: 'left',
                maxWidth: '100%',
                overflowX: 'auto',
                color: '#888',
                border: '1px solid #300'
              }}>
                {this.state.error?.toString()}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
