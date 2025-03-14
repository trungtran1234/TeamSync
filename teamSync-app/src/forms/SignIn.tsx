"use client"

import type React from "react"
import { useState, type ChangeEvent, type FormEvent, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import BackgroundLayout from "../components/layout/BackgroundLayout"
import zoomIcon from "../assets/zoom-icon.png"

interface FormData {
  email: string
  password: string
  rememberMe: boolean
}

const SignIn: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
    rememberMe: false,
  })

  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("zoom_success") === "1") {
      navigate("/dashboard")
    }
  }, [navigate])

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    console.log("Sign in:", formData)
    navigate("/dashboard")
  }

  const handleZoomSignIn = () => {
    window.location.href =
      "https://zoom.us/oauth/authorize?response_type=code&client_id=TUNGtIReTpqReWOgVyQieQ&redirect_uri=https://bullfrog-ample-routinely.ngrok-free.app/oauth/callback"
  }

  return (
    <BackgroundLayout>
      <div className="space-y-6 bg-slate-800 p-8 rounded-xl">
        <h2 className="text-2xl font-semibold text-white text-center">Welcome Back</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all duration-200 ease-in-out"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all duration-200 ease-in-out"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
                className="rounded border-slate-600 bg-slate-700 text-violet-600 shadow-sm focus:border-violet-300 focus:ring focus:ring-violet-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-slate-300">Remember me</span>
            </label>
            <a href="/forgot-password" className="text-sm text-violet-400 hover:text-violet-300">
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg transition-colors duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Sign In
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-800 text-slate-400">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <button
              type="button"
              className="flex items-center justify-center px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors text-white"
              onClick={handleZoomSignIn}
            >
              <img src={zoomIcon || "/placeholder.svg"} alt="Zoom" className="w-8 h-8 mr-2" />
              Sign in with Zoom
            </button>
          </div>
        </form>

        {/* Uncomment if you want to include the Sign Up link
        <p className="text-center text-sm text-slate-400">
          Don&apos;t have an account?{' '}
          <a
            href="/signup"
            className="text-violet-400 hover:text-violet-300 font-medium"
          >
            Sign up
          </a>
        </p>
        */}
      </div>
    </BackgroundLayout>
  )
}

export default SignIn

