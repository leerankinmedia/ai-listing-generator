import { randomBytes } from "crypto"

export interface StagingImage {
  contentType: string
  buffer: Buffer
}

interface StagingEntry extends StagingImage {
  expiresAt: number
}

const TTL_MS = 15 * 60 * 1000
const globalStore = globalThis as typeof globalThis & {
  __listwiseMediaStaging?: Map<string, StagingEntry>
}

function store() {
  if (!globalStore.__listwiseMediaStaging) {
    globalStore.__listwiseMediaStaging = new Map()
  }
  return globalStore.__listwiseMediaStaging
}

function prune(map: Map<string, StagingEntry>) {
  const now = Date.now()
  for (const [id, entry] of map) {
    if (entry.expiresAt <= now) map.delete(id)
  }
}

export function putStagingImage(image: StagingImage): string {
  const map = store()
  prune(map)
  const id = randomBytes(16).toString("hex")
  map.set(id, {
    ...image,
    expiresAt: Date.now() + TTL_MS,
  })
  return id
}

export function getStagingImage(id: string): StagingImage | null {
  const map = store()
  prune(map)
  const entry = map.get(id)
  if (!entry) return null
  return { contentType: entry.contentType, buffer: entry.buffer }
}

export function deleteStagingImage(id: string) {
  store().delete(id)
}
