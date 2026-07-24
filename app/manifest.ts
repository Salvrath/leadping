import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Textback",
    short_name: "Textback",
    description: "Automatiskt SMS vid missat samtal för svenska företag.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#10213f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}