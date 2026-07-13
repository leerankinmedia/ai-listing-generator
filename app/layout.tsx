import type { Metadata } from "next"
import { Outfit, Plus_Jakarta_Sans } from "next/font/google"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const display = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
})

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "ListWise — AI Crosslisting for Professional Resellers",
    template: "%s · ListWise",
  },
  description:
    "ListWise is an AI-powered crosslisting platform. List once, sell everywhere across eBay, Poshmark, Mercari, Depop, and more.",
  applicationName: "ListWise",
  keywords: [
    "crosslisting",
    "AI listing",
    "reseller",
    "eBay",
    "Poshmark",
    "Mercari",
    "Depop",
    "inventory management",
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
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
