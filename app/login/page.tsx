"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { GoogleOAuthProvider, GoogleLogin, CredentialResponse } from "@react-oauth/google"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return
    setLoading(true)
    setErrorMessage(null)

    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Đăng nhập bằng Google thất bại')
      }

      const data = await response.json()
      localStorage.setItem("token", data.token)
      localStorage.setItem("user", JSON.stringify(data.user))
      const redirectPath = localStorage.getItem("redirectAfterLogin") || "/"
      localStorage.removeItem("redirectAfterLogin")
      router.push(redirectPath)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Lỗi kết nối với server")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleError = () => {
    setErrorMessage("Đăng nhập bằng Google thất bại")
    setLoading(false)
  }

  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>  {/* 🔥 Fix: Thêm NEXT_PUBLIC_ */}
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative z-50">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%239C92AC%22 fill-opacity=%220.05%22%3E%3Ccircle cx=%2230%22 cy=%2230%22 r=%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20" />

        {/* Floating orbs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '4s' }}></div>

        <Card className="w-full max-w-md bg-white/10 backdrop-blur-lg border-white/20 shadow-2xl relative z-10">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Đăng nhập
            </CardTitle>
            <CardDescription className="text-gray-300">
              Sử dụng Google để truy cập tài khoản của bạn
            </CardDescription>
          </CardHeader>

          {errorMessage && (
            <div className="mx-4 mb-4 p-3 bg-red-500/20 border border-red-500/30 text-red-300 rounded-md text-sm">
              {errorMessage}
            </div>
          )}

          <CardContent className="space-y-6">
            {/* <Button
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                "Đăng nhập với Google"
              )}
            </Button> */}

            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              text="signin_with"
              theme="filled_blue"
              size="large"
              width="384"
              shape="rectangular"
            />

           
          </CardContent>
        </Card>
      </div>
    </GoogleOAuthProvider>
  )
}