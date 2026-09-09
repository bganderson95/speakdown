import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { assemblyaiTokenPlugin } from "./vite-plugins/assemblyaiToken.js";

export default defineConfig(({ mode }) => {
  // An empty prefix loads every variable, including ones without VITE_. These
  // stay on the server: nothing here is passed to `define`, so the API key is
  // never inlined into the client bundle.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), assemblyaiTokenPlugin({ apiKey: env["ASSEMBLYAI_API_KEY"] })],
  };
});
