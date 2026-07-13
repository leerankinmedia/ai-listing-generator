import type { Metadata } from "next"
import { Syne, Manrope } from "next/font/google"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const display = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
})

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: {
    default: "ListWise — AI Crosslisting for Resellers",
    template: "%s · ListWise",
  },
  description:
    "ListWise is an AI-powered crosslisting platform. List once, sell on eBay, Poshmark, Mercari, Depop, Grailed, Facebook Marketplace, Etsy, Vinted, and Whatnot.",
  applicationName: "ListWise",
  icons: {
    icon: "/favicon.svg",
  },
  keywords: [
    "crosslisting",
    "reseller",
    "AI listings",
    "eBay",
    "Poshmark",
    "Mercari",
    "Depop",
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
