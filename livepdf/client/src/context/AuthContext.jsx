import { createContext, useContext, useState, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const setToken = useCallback((token) => {
    // Store token in memory — never localStorage or sessionStorage
    window.__livepdf_token__ = token;
  }, []);

  const signup = useCallback(async (email, password, fullName) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', { email, password, fullName });
      return { success: true, userId: res.data.userId, otpMock: res.data.otpMock };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Signup failed' };
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyEmail = useCallback(async (userId, otp) => {
    setLoading(true);
    try {
      await api.post('/auth/verify-email', { userId, otp });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Verification failed' };
    } finally {
      setLoading(false);
    }
  }, []);

  const resendOtp = useCallback(async (userId) => {
    try {
      const res = await api.post('/auth/resend-otp', { userId });
      return { success: true, otpMock: res.data.otpMock };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to resend' };
    }
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      setToken(res.data.token);
      setUser(res.data.user);
      return { success: true };
    } catch (err) {
      const data = err.response?.data;
      return {
        success: false,
        error: data?.error || 'Login failed',
        requiresVerification: data?.requiresVerification,
        userId: data?.userId,
        otpMock: data?.otpMock,
      };
    } finally {
      setLoading(false);
    }
  }, [setToken]);

  const logout = useCallback(() => {
    window.__livepdf_token__ = null;
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout, verifyEmail, resendOtp }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
