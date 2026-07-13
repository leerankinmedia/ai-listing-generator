import Link from "next/link"
import { readFile } from "node:fs/promises"
import path from "node:path"

export const metadata = {
  title: "Roadmap",
}

export default async function RoadmapPage() {
  const roadmapPath = path.join(process.cwd(), "docs", "ROADMAP.md")
  const markdown = await readFile(roadmapPath, "utf8")

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-muted-foreground transition hover:text-foreground">
        ← Back to Listora
      </Link>
      <article className="prose-listora mt-8 space-y-4">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Development roadmap</h1>
        <p className="text-muted-foreground">
          Source of truth lives in <code className="rounded bg-muted px-1.5 py-0.5 text-xs">docs/ROADMAP.md</code>.
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-border/70 bg-card/80 p-4 text-xs leading-relaxed text-foreground/90 sm:text-sm">
          {markdown}
        </pre>
      </article>
    </div>
  )
}
