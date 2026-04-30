import type { Metadata } from 'next'
import { Inter, Bricolage_Grotesque, Geist_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'

import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
const bricolage = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Outbound AI',
  description: 'Your AI phone agent.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable} ${geistMono.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
