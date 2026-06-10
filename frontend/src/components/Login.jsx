import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';

function Login({ onLoginSuccess, isAlreadyAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAlreadyAuthenticated && !location.search.includes('token')) {
      navigate('/dashboard');
    }
  }, [isAlreadyAuthenticated, navigate, location]);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const oauthToken = queryParams.get('token');

    if (oauthToken) {
      try {
        const payloadBase64 = oauthToken.split('.')[1];
        const decodedPayload = JSON.parse(atob(payloadBase64));
        onLoginSuccess(oauthToken, decodedPayload.role);
        navigate('/dashboard');
      } catch {
        setErrorMessage('Failed to decode incoming OAuth security context.');
      }
    }
  }, [location, onLoginSuccess, navigate]);

  const handleTraditionalSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    try {
      const response = await axios.post('http://localhost:8000/auth/login/traditional', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const token = response.data.access_token;
      const decodedPayload = JSON.parse(atob(token.split('.')[1]));
      onLoginSuccess(token, decodedPayload.role);
      navigate('/dashboard');
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || 'Authentication failed. Verify credentials.');
    }
  };

  const redirectToGoogleOAuth = () => {
    window.location.href = 'http://localhost:8000/auth/google/login';
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={s.logoMark}>&#9729;</div>
        <h2 style={s.title}>Cloud Storage System</h2>
        <p style={s.subtitle}>Sign in to access your workspace</p>

        {errorMessage && <div style={s.error}>{errorMessage}</div>}

        <form onSubmit={handleTraditionalSubmit} style={s.form}>
          <div style={s.fieldGroup}>
            <label style={s.label}>Email address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={s.input}
            />
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={s.input}
            />
          </div>
          <button type="submit" style={s.primaryBtn}>Sign In</button>
        </form>

        <div style={s.dividerRow}>
          <span style={s.dividerLine} />
          <span style={s.dividerText}>or</span>
          <span style={s.dividerLine} />
        </div>

        <button onClick={redirectToGoogleOAuth} style={s.googleBtn}>
          <svg style={s.googleIcon} viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}

const s = {
  logoMark: { fontSize: '32px', marginBottom: '12px' },
  title: { margin: '0 0 6px 0', color: '#1e293b', fontWeight: '700', fontSize: '22px' },
  subtitle: { margin: '0 0 24px 0', color: '#64748b', fontSize: '14px' },
  error: { padding: '10px 14px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', textAlign: 'left' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' },
  label: { fontSize: '13px', fontWeight: '600', color: '#475569' },
  input: { padding: '11px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', color: '#1e293b', backgroundColor: '#f8fafc', width: '100%' },
  primaryBtn: { padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer', width: '100%', marginTop: '4px' },
  dividerRow: { display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' },
  dividerLine: { flex: 1, height: '1px', backgroundColor: '#e2e8f0' },
  dividerText: { color: '#94a3b8', fontSize: '13px', fontWeight: '500' },
  googleBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '11px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', fontSize: '15px', fontWeight: '500', cursor: 'pointer' },
  googleIcon: { width: '18px', height: '18px', flexShrink: 0 },
};

export default Login;
