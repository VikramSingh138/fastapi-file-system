import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom'; // Added useNavigate import

function Login({ onLoginSuccess, isAlreadyAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const location = useLocation();
  const navigate = useNavigate(); // Navigation engine trigger instance

  // 1. Safe Redirect guard if token is already established globally
  useEffect(() => {
    if (isAlreadyAuthenticated && !location.search.includes('token')) {
      navigate('/dashboard');
    }
  }, [isAlreadyAuthenticated, navigate, location]);

  // 2. Catch incoming Google OAuth Redirect tokens on component mounting phase
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const oauthToken = queryParams.get('token');

    if (oauthToken) {
      try {
        // Decode payload out of the JWT to find the user's assigned role
        const payloadBase64 = oauthToken.split('.')[1];
        const decodedPayload = JSON.parse(atob(payloadBase64));
        const role = decodedPayload.role;

        // Commit token to global context state
        onLoginSuccess(oauthToken, role);
        
        // Instantly push the routing path smoothly over to your console dashboard workspace
        navigate('/dashboard');
      } catch (err) {
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      const token = response.data.access_token;
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(atob(payloadBase64));
      const role = decodedPayload.role;

      onLoginSuccess(token, role);
      navigate('/dashboard'); // Take traditional logins to dashboard too
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || 'Authentication failed. Verify credentials.');
    }
  };

  const redirectToGoogleOAuth = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID; 

    if (!clientId) {
      console.error("❌ Environment Error: VITE_GOOGLE_CLIENT_ID is undefined!");
      setErrorMessage("OAuth Configuration missing. Check frontend console.");
      return;
    }
    
    const redirectUri = "http://localhost:8000/auth/oauth2/google/callback";
    const scope = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
    
    window.location.href = googleAuthUrl;
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Cloud Storage System</h2>
        
        {errorMessage && <div style={styles.error}>{errorMessage}</div>}

        <form onSubmit={handleTraditionalSubmit} style={styles.form}>
          <input 
            type="email" 
            placeholder="Email address" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            style={styles.input}
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            style={styles.input}
          />
          <button type="submit" style={styles.button}>Sign In</button>
        </form>

        <div style={styles.divider}>OR</div>

        <button onClick={redirectToGoogleOAuth} style={styles.googleButton}>
          <img src="https://docs.greatexpectations.io/assets/images/google_logo-736025bc0b7849e7943d04d701046755.png" alt="Google" style={styles.googleIcon} />
          Continue with Google
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#eef2f5' },
  card: { padding: '40px', borderRadius: '12px', backgroundColor: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', width: '360px', textAlign: 'center' },
  title: { margin: '0 0 24px 0', color: '#1e293b', fontWeight: 'bold' },
  error: { padding: '10px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  input: { padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none' },
  button: { padding: '12px', borderRadius: '6px', border: 'none', backgroundColor: '#2563eb', color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' },
  divider: { margin: '20px 0', color: '#64748b', fontSize: '14px', position: 'relative' },
  googleButton: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', fontSize: '15px', fontWeight: '500', cursor: 'pointer' },
  googleIcon: { width: '18px', height: '18px' }
};

export default Login;