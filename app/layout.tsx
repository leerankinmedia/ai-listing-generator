import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Fraunces, Outfit } from "next/font/google"

import { TooltipProvider } from "@/components/ui/tooltip"

import "./globals.css"

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Listora — AI Listing Generator",
    template: "%s · Listora",
  },
  description:
    "Listora turns product photos into eBay-optimized titles, descriptions, categories, item specifics, keywords, and pricing — built for professional resellers.",
  applicationName: "Listora",
}

export const viewport: Viewport = {
  themeColor: "#1f5c64",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
      <body className="font-sans">
        <TooltipProvider>
          {children}
          <Analytics />
        </TooltipProvider>
      </body>
    </html>
  )
}
