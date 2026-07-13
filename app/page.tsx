"use client"

import { useState } from "react"
import { ArrowRight, Layers3, ShieldCheck, Zap } from "lucide-react"
import { ListingForm } from "@/components/listing/listing-form"
import { ResultSection } from "@/components/listing/result-section"
import type { ListingResult } from "@/types/listing"

export default function HomePage() {
  const [result, setResult] = useState<ListingResult | null>(null)
  const [mode, setMode] = useState<"live" | "demo">("demo")
  const [model, setModel] = useState<string | undefined>()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="texture-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:flex-row lg:items-end lg:gap-16">
          <div className="animate-rise max-w-2xl flex-1">
            <p className="mb-4 font-[family-name:var(--font-display)] text-5xl font-semibold tracking-tight text-[var(--ink)] sm:text-6xl lg:text-7xl">
              Listora
            </p>
            <h1 className="max-w-xl text-2xl font-semibold leading-tight tracking-tight text-[var(--foreground)] sm:text-3xl">
              AI listings that sell — eBay titles, specifics, and pricing in one pass.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--muted-foreground)] sm:text-lg">
              Built for resellers who need SEO titles in the 70–80 character window,
              complete item specifics, and honest confidence — not generic fluff.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#generator"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-sm transition-all hover:brightness-105 active:scale-[0.98]"
              >
                Open generator
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="https://github.com/leerankinmedia/ai-listing-generator"
                className="inline-flex h-12 items-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                target="_blank"
                rel="noreferrer"
              >
                View roadmap
              </a>
            </div>
          </div>

          <div className="animate-rise grid flex-1 grid-cols-1 gap-3 delay-100 sm:grid-cols-3 lg:max-w-md lg:grid-cols-1">
            <HeroPoint
              icon={<Zap className="h-4 w-4" />}
              title="SEO titles"
              body="Hard-enforced 70–80 character eBay titles with brand-first keywords."
            />
            <HeroPoint
              icon={<Layers3 className="h-4 w-4" />}
              title="Complete specifics"
              body="Category, item specifics, keywords, and price bands in one generation."
            />
            <HeroPoint
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Confidence & gaps"
              body="Per-field scores plus missing-info warnings before you publish."
            />
          </div>
        </div>
      </section>

      <section id="generator" className="border-t border-[var(--border)]/80 bg-[var(--card)]/55">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          <div className="animate-rise space-y-5">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)]">
                Listing generator
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base">
                Upload photos, add what you know, and generate a sell-ready eBay draft.
                Works in demo mode without an API key.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-soft)] sm:p-6">
              <ListingForm
                onResult={(data, meta) => {
                  setResult(data)
                  setMode(meta.mode)
                  setModel(meta.model)
                  setError("")
                }}
                onError={setError}
                onGeneratingChange={setBusy}
              />
              {error && (
                <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="min-h-[320px]">
            {busy && !result && (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-6 text-center">
                <div className="animate-pulse-soft mb-3 h-2 w-28 rounded-full bg-[var(--accent)]" />
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Crafting title, specifics, and pricing…
                </p>
              </div>
            )}
            {!busy && !result && (
              <div className="flex h-full min-h-[320px] flex-col justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)]/20 px-6 py-10">
                <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
                  Results appear here
                </p>
                <p className="mt-2 max-w-sm text-sm text-[var(--muted-foreground)]">
                  After generation you&apos;ll get a copy-ready title, description,
                  category path, item specifics, keywords, pricing, confidence, and warnings.
                </p>
              </div>
            )}
            {result && (
              <ResultSection result={result} mode={mode} model={model} />
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] py-8 text-center text-xs text-[var(--muted-foreground)]">
        Listora Phase 1 · Inventory, billing, and crosslisting ship in later phases.
      </footer>
    </div>
  )
}

function HeroPoint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/90 p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ink)] text-[var(--ink-foreground)]">
        {icon}
      </div>
      <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">{body}</p>
    </div>
  )
}
