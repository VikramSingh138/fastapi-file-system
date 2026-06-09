import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || '');

  const handleLoginSuccess = (userToken, userRole) => {
    localStorage.setItem('token', userToken);
    localStorage.setItem('role', userRole);
    setToken(userToken);
    setRole(userRole);
  };

  const handleLogout = () => {
    localStorage.clear();
    setToken('');
    setRole('');
  };

  return (
    <Router>
      <div style={{ fontFamily: 'sans-serif', backgroundColor: '#f4f6f9', minHeight: '100vh' }}>
        <Routes>
          {/* FIX: Removed the strict inline redirect conditional from the login element wrapper.
            We will let Login.jsx handle internal navigation smoothly once it commits the token.
          */}
          <Route 
            path="/login" 
            element={<Login onLoginSuccess={handleLoginSuccess} isAlreadyAuthenticated={!!token} />} 
          />

          {/* Secure Protected Dashboard Route */}
          <Route 
            path="/dashboard" 
            element={token ? <Dashboard token={token} role={role} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />

          {/* Fallback routing boundary */}
          <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;