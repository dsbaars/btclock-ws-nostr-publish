import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const path = fileURLToPath(import.meta.url)
const root = resolve(dirname(path), 'client')

export default defineConfig({
	plugins: [
        viteStaticCopy({
            targets: [
              {
                src: 'js/*',
                dest: 'js'
              }
            ]
          })
    ],
    root: 'src',
    build: {
        minify: true,
        cssCodeSplit: false,
        outDir: '../public'
    }
});