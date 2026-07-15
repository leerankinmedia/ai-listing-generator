import {
  PLAN_FEATURES,
  type PlanFeature,
} from "@/lib/billing/config"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export function PlanFeaturesList({
  features = PLAN_FEATURES,
  className,
}: {
  features?: PlanFeature[]
  className?: string
}) {
  return (
    <ul className={cn("space-y-2.5 text-sm", className)}>
      {features.map((feature) => (
        <li key={feature.label} className="flex items-start gap-2.5">
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-accent"
            aria-hidden
          />
          <span className="leading-snug text-foreground">
            {feature.label}
            {feature.comingSoon ? (
              <span className="ml-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Coming soon
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
