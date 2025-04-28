'use client';

import React, { useState, ChangeEvent, FormEvent } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import BackgroundLayout from '../components/layout/BackgroundLayout';
import zoomIcon from '../assets/zoom-icon.png';

const CLIENT_ID    = import.meta.env.VITE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
const ZOOM_AUTH_URL = 'https://zoom.us/oauth/authorize';

interface FormData {
  firstName: string;
  lastName:  string;
  email:     string;
  password:  string;
}

const FIELDS: {
  name: keyof FormData;
  label: string;
  placeholder: string;
}[] = [
  { name: 'firstName', label: 'First Name', placeholder: 'John' },
  { name: 'lastName',  label: 'Last Name',  placeholder: 'Doe'  },
];

const SignUp: React.FC = () => {
  const [formData, setFormData]         = useState<FormData>({ firstName: '', lastName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // → your sign-up logic
    console.log('Signing up with', formData);
  };

  const zoomOAuthLink = [
    ZOOM_AUTH_URL,
    `?response_type=code`,
    `&client_id=${encodeURIComponent(CLIENT_ID)}`,
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  ].join('');

  return (
    <BackgroundLayout>
      <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-lg space-y-6">
        <h2 className="text-2xl font-semibold text-center text-gray-800">
          Create Your Account
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map(f => (
              <div key={f.name} className="space-y-1">
                <label htmlFor={f.name} className="block text-sm font-medium text-gray-700">
                  {f.label}
                </label>
                <input
                  id={f.name}
                  name={f.name}
                  type="text"
                  placeholder={f.placeholder}
                  value={formData[f.name]}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Work Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a strong password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-500"
              >
                {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-start">
            <input
              id="terms"
              type="checkbox"
              required
              className="mt-1 mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="terms" className="text-sm text-gray-600">
              I agree to the{' '}
              <a href="#" className="text-blue-600 hover:underline">Terms of Service</a>{' '}
              and <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>
            </label>
          </div>

          <button
            type="submit"
            className="w-full py-2 font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            Create Account
          </button>

          <div className="relative text-center my-4">
            <div className="absolute inset-x-0 top-1/2">
              <span className="block border-t border-gray-300"></span>
            </div>
            <span className="relative px-2 bg-white text-gray-500">Or continue with</span>
          </div>

          <button
            type="button"
            onClick={() => window.location.href = zoomOAuthLink}
            className="flex items-center justify-center w-full px-4 py-2 border rounded-lg hover:bg-gray-100 transition"
          >
            <img src={zoomIcon} alt="Zoom" className="w-5 h-5 mr-2" />
            Sign in with Zoom
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <a href="/signin" className="text-blue-600 hover:underline">Sign in</a>
        </p>
      </div>
    </BackgroundLayout>
  );
};

export default SignUp;
