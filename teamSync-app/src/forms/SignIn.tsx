import React, { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';  // React Router for redirect
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import BackgroundLayout from '../components/layout/BackgroundLayout';
import zoomIcon from '../assets/zoom-icon.png';

interface FormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

const SignIn: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    rememberMe: false,
  });

  const navigate = useNavigate();

  // 1) Check if Zoom OAuth was successful (e.g., "?zoom_success=1")
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoom_success') === '1') {
      // If Zoom auth succeeded on the server side and we got redirected to dashboard
      navigate('/dashboard');
    }
  }, [navigate]);

  // 2) Handle changes in input fields
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // 3) Handle the manual sign-in form submission (non-Zoom flow)
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    console.log('Sign in:', formData);
    // If credentials are valid, redirect:
    navigate('/dashboard');
  };

  // 4) Handle Zoom sign-in flow
  const handleZoomSignIn = () => {
    // This URL will start the Zoom OAuth flow. Make sure the redirect_uri on your server side
    // eventually redirects back to e.g., "http://localhost:5173/signin?zoom_success=1"
    window.location.href =
      'https://zoom.us/oauth/authorize?response_type=code&client_id=TUNGtIReTpqReWOgVyQieQ&redirect_uri=https://bullfrog-ample-routinely.ngrok-free.app/oauth/callback';
  };

  return (
    <BackgroundLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-gray-800 text-center">
          Welcome Back
        </h2>

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Field */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ease-in-out"
              placeholder="you@example.com"
              required
            />
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ease-in-out"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? (
                  <EyeOffIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-600">Remember me</span>
            </label>
            <a
              href="/forgot-password"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Forgot password?
            </a>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Sign In
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">
                Or continue with
              </span>
            </div>
          </div>

          {/* Social Login */}
          <div className="grid grid-cols-1 gap-4">
            <button
              type="button"
              className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={handleZoomSignIn}
            >
              {/* Zoom Logo or Icon */}
              <img src={zoomIcon} alt="Zoom" className="w-6 h-6 mr-2" />
              Sign in with Zoom
            </button>
          </div>
        </form>

        {/* Sign Up Link */}
        <p className="text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <a
            href="/signup"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Sign up
          </a>
        </p>
      </div>
    </BackgroundLayout>
  );
};

export default SignIn;
