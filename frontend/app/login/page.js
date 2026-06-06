'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'code' | 'reset'
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    newPassword: '',
    code: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push(redirect === 'checkout' ? '/checkout' : '/');
    }
  }, [router, redirect]);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError('');
  };

  const handleLogin = async () => {
    if (!form.email || !form.password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = redirect === 'checkout' ? '/checkout' : '/';
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch {
      setError('Connection failed. Please try again.');
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password) {
      setError('Please fill in all required fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          address: form.address,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = redirect === 'checkout' ? '/checkout' : '/';
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch {
      setError('Connection failed. Please try again.');
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!form.email) {
      setError('Please enter your email');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Reset code sent to your email!');
        setMode('code');
      } else {
        setError(data.error || 'Failed to send reset code');
      }
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!form.code || !form.newPassword) {
      setError('Please enter the code and new password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          code: form.code,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Password reset successful! Please login.');
        setMode('login');
        setForm((f) => ({ ...f, password: '', newPassword: '', code: '' }));
      } else {
        setError(data.error || 'Reset failed');
      }
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'login') handleLogin();
    else if (mode === 'register') handleRegister();
    else if (mode === 'forgot') handleForgotPassword();
    else if (mode === 'code' || mode === 'reset') handleResetPassword();
  };

  const inputClass = 'w-full border-2 border-amber-200 rounded-xl px-4 py-3.5 text-gray-700 placeholder:text-gray-400 transition-all';

  return (
    <div className="bg-[#FFFAEF] min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-[2rem] shadow-2xl shadow-amber-200/30 border border-amber-100/60 p-8 md:p-10 animate-scale-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-300/30">
              <span className="text-4xl">🍯</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-amber-950">
              {mode === 'login' && 'Welcome Back'}
              {mode === 'register' && 'Join AmberFlow'}
              {mode === 'forgot' && 'Forgot Password'}
              {(mode === 'code' || mode === 'reset') && 'Reset Password'}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              {mode === 'login' && 'Sign in to your honey account'}
              {mode === 'register' && 'Create your account to get started'}
              {mode === 'forgot' && "Enter your email to receive a reset code"}
              {(mode === 'code' || mode === 'reset') && 'Enter the code sent to your email'}
            </p>
          </div>

          {/* Tab Toggle (Login/Register) */}
          {(mode === 'login' || mode === 'register') && (
            <div className="flex bg-amber-50 rounded-xl p-1 mb-6">
              <button
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  mode === 'login'
                    ? 'bg-white text-amber-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Login
              </button>
              <button
                onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  mode === 'register'
                    ? 'bg-white text-amber-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Register
              </button>
            </div>
          )}

          {/* Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-4 text-sm font-medium flex items-center gap-2 animate-fade-in">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm font-medium flex items-center gap-2 animate-fade-in">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Register fields */}
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    placeholder="Enter your full name"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {/* Email - shown in login, register, forgot */}
            {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
            )}

            {/* Register extra fields */}
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    placeholder="Your phone number"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1.5">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setField('address', e.target.value)}
                    placeholder="Your delivery address"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {/* Password - login & register */}
            {(mode === 'login' || mode === 'register') && (
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">Password *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  placeholder="Enter your password"
                  className={inputClass}
                />
              </div>
            )}

            {/* Reset code input */}
            {(mode === 'code' || mode === 'reset') && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1.5">6-Digit Code *</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setField('code', e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    className={`${inputClass} text-center text-2xl tracking-[0.5em] font-bold`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1.5">New Password *</label>
                  <input
                    type="password"
                    value={form.newPassword}
                    onChange={(e) => setField('newPassword', e.target.value)}
                    placeholder="Enter new password"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {/* Forgot password link */}
            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                  className="text-amber-600 hover:text-amber-800 text-sm font-semibold transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-lg py-4 rounded-2xl shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-amber-200/50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Please wait...
                </>
              ) : (
                <>
                  {mode === 'login' && 'Sign In'}
                  {mode === 'register' && 'Create Account'}
                  {mode === 'forgot' && 'Send Reset Code'}
                  {(mode === 'code' || mode === 'reset') && 'Reset Password'}
                </>
              )}
            </button>
          </form>

          {/* Bottom links */}
          <div className="mt-6 text-center">
            {(mode === 'login' || mode === 'register') && (
              <p className="text-gray-500 text-sm">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError('');
                    setSuccess('');
                  }}
                  className="text-amber-600 font-bold hover:text-amber-800 transition-colors"
                >
                  {mode === 'login' ? 'Register' : 'Sign In'}
                </button>
              </p>
            )}
            {(mode === 'forgot' || mode === 'code' || mode === 'reset') && (
              <button
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                className="text-amber-600 font-semibold hover:text-amber-800 text-sm transition-colors"
              >
                ← Back to Login
              </button>
            )}
          </div>
        </div>

        {/* Bottom decoration */}
        <p className="text-center text-xs text-amber-700/40 mt-6">
          By continuing, you agree to AmberFlow&apos;s Terms of Service.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-float">🍯</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}