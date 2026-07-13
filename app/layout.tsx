import type { Metadata, Viewport } from "next"
import { DM_Sans, Syne } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"

import "./globals.css"

const display = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
})

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: {
    default: "Listora — AI Listing Generator",
    template: "%s · Listora",
  },
  description:
    "Generate eBay-optimized titles, descriptions, categories, item specifics, keywords, and pricing with AI. Built for professional resellers.",
  applicationName: "Listora",
}

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
