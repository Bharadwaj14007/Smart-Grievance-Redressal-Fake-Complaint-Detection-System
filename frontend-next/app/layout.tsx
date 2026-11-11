import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AuthProvider } from '../src/components/AuthProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nagrik Setu',
  description: 'Public grievance redressal portal',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
