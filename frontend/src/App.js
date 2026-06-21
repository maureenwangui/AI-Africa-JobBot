// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import { AuthProvider, useAuth } from './context/AuthContext';

import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import ApplicationsPage from './pages/ApplicationsPage';
import ProfilePage from './pages/ProfilePage';
import PricingPage from './pages/PricingPage';
import SubscriptionSuccessPage from './pages/SubscriptionSuccessPage';
import AdminPage from './pages/AdminPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={styles.loader}>Loading...</div>;
  return user ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={styles.loader}>Loading...</div>;
  return user ? <Navigate to="/dashboard" /> : children;
}

const styles = {
  loader: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', background: '#041B3D', color: '#42A5F5', fontSize: '1.1rem',
  }
};

export default function App() {
  return (
    <AuthProvider>
      <PayPalScriptProvider options={{ 'client-id': process.env.REACT_APP_PAYPAL_CLIENT_ID, vault: true, intent: 'subscription' }}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            <Route path="/dashboard" element={<PrivateRoute><Layout><DashboardPage /></Layout></PrivateRoute>} />
            <Route path="/jobs" element={<PrivateRoute><Layout><JobsPage /></Layout></PrivateRoute>} />
            <Route path="/applications" element={<PrivateRoute><Layout><ApplicationsPage /></Layout></PrivateRoute>} />
            <Route path="/profile" element={<PrivateRoute><Layout><ProfilePage /></Layout></PrivateRoute>} />
            <Route path="/subscription/success" element={<PrivateRoute><SubscriptionSuccessPage /></PrivateRoute>} />
            <Route path="/admin" element={<PrivateRoute><AdminPage /></PrivateRoute>} />
          </Routes>
        </BrowserRouter>
      </PayPalScriptProvider>
    </AuthProvider>
  );
}