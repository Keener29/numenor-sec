import { reactRouter } from "@react-router/dev/vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load environment variables that start with VITE_
  const env = loadEnv(mode, process.cwd());

  // Map the VITE_* variables to keys without the prefix.
  const processEnv = Object.keys(env)
    .filter((key) => key.startsWith("VITE_"))
    .reduce((acc, key) => {
      acc[`process.env.${key}`] = JSON.stringify(env[key]);
      return acc;
    }, {} as Record<string, string>);

  return {
    plugins: [reactRouter(), tsconfigPaths()],
    define: processEnv,
  };
});