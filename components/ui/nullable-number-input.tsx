"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Number input that allows clearing the field while editing.
 * Does not force a leading 0 — blank stays blank until blur/commit.
 */
export function NullableNumberInput({
  id,
  value,
  onValueChange,
  disabled,
  min,
  max,
  step,
  placeholder,
  className,
  integer,
}: {
  id?: string
  value: number | null | undefined
  onValueChange: (value: number | null) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number | string
  placeholder?: string
  className?: string
  /** When true, floor on commit. */
  integer?: boolean
}) {
  const [text, setText] = useState(() =>
    value == null || Number.isNaN(value) ? "" : String(value)
  )
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (focused) return
    setText(value == null || Number.isNaN(value) ? "" : String(value))
  }, [value, focused])

  function commit(raw: string) {
    const trimmed = raw.trim()
    if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") {
      onValueChange(null)
      setText("")
      return
    }
    let n = Number(trimmed)
    if (!Number.isFinite(n)) {
      onValueChange(null)
      setText("")
      return
    }
    if (integer) n = Math.floor(n)
    if (typeof min === "number") n = Math.max(min, n)
    if (typeof max === "number") n = Math.min(max, n)
    onValueChange(n)
    setText(String(n))
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        commit(text)
      }}
      onChange={(e) => {
        const next = e.target.value
        // Allow empty, digits, one dot, optional leading minus while typing.
        if (next !== "" && !/^-?\d*\.?\d*$/.test(next)) return
        setText(next)
        if (next.trim() === "") {
          onValueChange(null)
          return
        }
        const n = Number(next)
        if (Number.isFinite(n)) {
          // Live-update when the typed value is a complete number (not trailing dot).
          if (!next.endsWith(".") && next !== "-") {
            onValueChange(integer ? Math.floor(n) : n)
          }
        }
      }}
      className={cn(
        "flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      step={step}
    />
  )
}
