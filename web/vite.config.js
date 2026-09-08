import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import release from "../api/release.mjs";
const releaseDev = {
  name: "release-api-dev",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url.split("?")[0].endsWith("/api/release")) release(req, res);
      else next();
    });
  },
};
export default defineConfig({
  plugins: [react(), releaseDev],
  base: "/tools/casiovideo/",
  server: { port: 5178 },
  build: { target: "es2022" },
});
