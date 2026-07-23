import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({esbuild:{jsx:"automatic"},test:{environment:"jsdom",setupFiles:["./tests/setup.ts"]},resolve:{alias:{"server-only":path.resolve(__dirname,"tests/server-only.ts"),"@":path.resolve(__dirname,".")}}});
