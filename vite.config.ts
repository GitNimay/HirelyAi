import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      // Clerk's "node" variant require()s node:fs for keyless mode; workerd has no filesystem, so use its no-fs build
      "#safe-node-apis": fileURLToPath(
        new URL("./node_modules/@clerk/nextjs/dist/esm/runtime/browser/safe-node-apis.js", import.meta.url),
      ),
    },
  },
  environments: {
    // ClerkProvider is a "use client" boundary inside the package, which plugin-rsc loads unbundled.
    // Pre-bundling @clerk/nextjs for our own imports would create a second copy with its own React context.
    client: { optimizeDeps: { exclude: ["@clerk/nextjs"] } },
  },
  plugins: [
    {
      // Clerk calls require("server-only") inside auth()/currentUser() as a Next bundler marker.
      // workerd has no require; the RSC environment is already server-only, so drop the marker.
      name: "clerk-server-only-marker",
      enforce: "pre",
      transform(code, id) {
        if (id.includes("@clerk/nextjs") && code.includes('require("server-only")'))
          return code.replaceAll('require("server-only");', "");
      },
    },
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
