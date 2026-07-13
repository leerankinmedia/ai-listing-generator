import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ListWise",
    short_name: "ListWise",
    description: "AI-powered crosslisting for modern resellers",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f8",
    theme_color: "#0f9f8a",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  }
}
