import path from "node:path"
import { defineConfig } from "vite"
import wasm from 'vite-plugin-wasm';
import { qrcode } from "vite-plugin-qrcode"
import dusk from "vite-plugin-dusk"

// https://vitejs.dev/config/
export default defineConfig({
  base: "", // Makes paths relative
  plugins: [
    wasm(),
    qrcode(), // only applies in dev mode
    dusk({
      logicPath: path.resolve("./src/logic.ts"),
      minifyLogic: false, // This flag can be used if your logic reaches the allowed limit. However, it will make it significantly more difficult to detect validation issues
      ignoredDependencies: [],
    }),
  ],
})
