'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Zap } from 'lucide-react'

export default function LoginPage() {
  const supabase = createClient()

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Zap className="w-6 h-6 text-primary" />
            <span className="text-2xl font-bold tracking-tight">Outbound AI</span>
          </div>
          <p className="text-sm text-muted-foreground">Your AI phone agent.</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border/40 rounded-2xl p-8 shadow-2xl space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Continue with Google to get started.
            </p>
          </div>

          <Button
            onClick={signInWithGoogle}
            className="w-full gap-3 h-11 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90"
          >
            <GoogleIcon />
            Continue with Google
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          By signing in you agree to our terms of service.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="currentColor" fillOpacity="0.9"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="currentColor" fillOpacity="0.7"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="currentColor" fillOpacity="0.8"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="currentColor"/>
    </svg>
  )
}
