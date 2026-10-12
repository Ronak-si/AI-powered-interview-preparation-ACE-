import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

export default defineConfig({
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  plugins: [
    tanstackStart({ server: { entry: "server" } }),
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    react(),
    nitro({ preset: "vercel" }),
  ],
});
