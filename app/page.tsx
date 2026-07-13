import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { LandingCta } from "@/components/landing/cta"
import { LandingFeatures } from "@/components/landing/features"
import { LandingHero } from "@/components/landing/hero"
import { LandingHowItWorks } from "@/components/landing/how-it-works"
import { LandingMarketplaces } from "@/components/landing/marketplaces"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--lw-bg)] text-[var(--lw-fg)]">
      <SiteHeader />
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingMarketplaces />
        <LandingHowItWorks />
        <LandingCta />
      </main>
      <SiteFooter />
    </div>
  )
}
