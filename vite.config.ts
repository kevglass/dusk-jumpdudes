import path from "node:path"
import { defineConfig } from "vite"
import { qrcode } from "vite-plugin-qrcode"
import dusk from "vite-plugin-dusk"
import { GLTFLoader } from 'node-three-gltf';

const packedPlugin = {
  name: 'packed-loader',
  async transform(code, id) {
      const [path, query] = id.split('?');
      if (query != 'packed')
          return null;

      const loader = new GLTFLoader();
      const model = await loader.loadAsync(path);

      const packed = [];
      let temp = 0;

      model.scene.traverse((model) => {
        if (model.isMesh) {
          const box = {
            min: {
              x: model.geometry.boundingBox.min.x * model.scale.x,
              y: model.geometry.boundingBox.min.y * model.scale.y,
              z: model.geometry.boundingBox.min.z * model.scale.z,
            },
            max: {
              x: model.geometry.boundingBox.max.x * model.scale.x,
              y: model.geometry.boundingBox.max.y * model.scale.y,
              z: model.geometry.boundingBox.max.z * model.scale.z,
            }
          }

          if (Math.abs(model.rotation.x) >= Math.PI) {
            model.rotation.y = Math.PI - model.rotation.y;
          }

          if (Math.abs(model.rotation.x) > 0 && Math.abs(model.rotation.x) <= (Math.PI / 2) + 0.1) {
            console.log(model.name);

            temp = box.min.y; box.min.y = box.min.z; box.min.z = temp;
            temp = box.max.y; box.max.y = box.max.z; box.max.z = temp;
          }

          if (box.max.y < box.min.y) {
            temp = box.min.y; box.min.y = box.max.y; box.max.y = temp;
          }
          packed.push({
            id: model.name,
            box,
            rotation: model.rotation.y,
            translation: model.position
          })
        }
      });

      return `export default '${btoa(JSON.stringify(packed))}';`;
  }
};

// https://vitejs.dev/config/
export default defineConfig({
  base: "", // Makes paths relative
  assetsInclude: ['**/*.glb'],
  build: {
    assetsInlineLimit: 100000000,
  },
  plugins: [
    packedPlugin,
    qrcode(), // only applies in dev mode
    dusk({
      logicPath: path.resolve("./src/logic.ts"),
      minifyLogic: false, // This flag can be used if your logic reaches the allowed limit. However, it will make it significantly more difficult to detect validation issues
      ignoredDependencies: [],
    }),
  ],
})
