'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import BackgroundLayout from '../components/layout/BackgroundLayout';
import zoomIcon from '../assets/zoom-icon.png';

const CLIENT_ID    = import.meta.env.VITE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;

const ZOOM_AUTH_URL = 'https://zoom.us/oauth/authorize';
const zoomOAuthLink = [
  ZOOM_AUTH_URL,
  `?response_type=code`,
  `&client_id=${encodeURIComponent(CLIENT_ID)}`,
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
].join('');

interface FormData {
  email:      string;
  password:   string;
  rememberMe: boolean;
}

const SignIn: React.FC = () => {
  const [formData, setFormData]         = useState<FormData>({ email: '', password: '', rememberMe: false });
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoom_success') === '1') {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(f => ({
      ...f,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Sign in:', formData);
    navigate('/dashboard');
  };

  const handleZoomSignIn = () => {
    window.location.href = zoomOAuthLink;
  };

  return (
    <BackgroundLayout>
      <div className="max-w-md mx-auto p-8 bg-slate-800 rounded-xl space-y-6">
        <h2 className="text-2xl font-semibold text-white text-center">
          Welcome Back
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-slate-300">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-violet-500 transition-all duration-200"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-slate-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-violet-500 transition-all duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPassword
                  ? <EyeOffIcon className="h-5 w-5" />
                  : <EyeIcon    className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Remember me & Forgot */}
          <div className="flex items-center justify-between">
            <label htmlFor="rememberMe" className="flex items-center">
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                checked={formData.rememberMe}
                onChange={handleChange}
                className="rounded border-slate-600 bg-slate-700 text-violet-600 focus:ring focus:ring-violet-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-slate-300">Remember me</span>
            </label>
            <a
              href="/forgot-password"
              className="text-sm text-violet-400 hover:text-violet-300"
            >
              Forgot password?
            </a>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg transition-colors duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Sign In
          </button>

          {/* Divider */}
          <div className="relative text-center my-4">
            <div className="absolute inset-x-0 top-1/2">
              <span className="block border-t border-slate-600"></span>
            </div>
            <span className="relative px-2 bg-slate-800 text-slate-400">
              Or continue with
            </span>
          </div>

          {/* Zoom OAuth */}
          <button
            type="button"
            onClick={handleZoomSignIn}
            className="flex items-center justify-center w-full px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors text-white"
          >
            <img src={zoomIcon} alt="Zoom" className="w-8 h-8 mr-2" />
            Sign in with Zoom
          </button>
        </form>
      </div>
    </BackgroundLayout>
  );
};

export default SignIn;