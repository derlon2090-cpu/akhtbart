import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: false,
  preview: {
    realtime: {
      allowedOrigins: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "https://akhtbart.vercel.app",
        ...(process.env.PUBLIC_SITE_ORIGIN ? [process.env.PUBLIC_SITE_ORIGIN] : []),
      ],
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
