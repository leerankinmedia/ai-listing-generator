import { SiteHeader } from "@/components/layout/site-header"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { Marketplaces } from "@/components/landing/marketplaces"
import { HowItWorks } from "@/components/landing/how-it-works"
import { CtaBand } from "@/components/landing/cta-band"
import { SiteFooter } from "@/components/landing/site-footer"

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <Marketplaces />
        <HowItWorks />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  )
}
