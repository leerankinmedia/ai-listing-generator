import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Fraunces, Manrope } from "next/font/google"
import { SiteHeader } from "@/components/layout/site-header"
import "./globals.css"

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK", "opsz"],
})

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
})

export const metadata: Metadata = {
  title: "Listora — AI Listing Generator for Resellers",
  description:
    "Generate eBay-optimized titles, descriptions, categories, item specifics, keywords, and pricing with confidence scores. Built for professional resellers.",
  applicationName: "Listora",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <SiteHeader />
        <main>{children}</main>
        <Analytics />
      </body>
    </html>
  )
}
