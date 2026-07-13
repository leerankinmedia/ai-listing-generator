import type { Metadata } from "next"
import { Manrope, Syne } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
})

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "ListWise — AI Crosslisting Platform",
    template: "%s · ListWise",
  },
  description:
    "ListWise is the AI-powered crosslisting platform for multi-marketplace sellers. List once, publish everywhere, sell faster.",
  keywords: [
    "ListWise",
    "crosslisting",
    "AI listings",
    "eBay",
    "Poshmark",
    "Mercari",
    "Depop",
    "reselling",
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${syne.variable} ${manrope.variable}`}>
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
