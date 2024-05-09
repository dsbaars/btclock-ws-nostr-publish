import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import EnvironmentPlugin from 'vite-plugin-environment'

const path = fileURLToPath(import.meta.url)
const root = resolve(dirname(path), 'client')


export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    return {
        plugins: [
            viteStaticCopy({
                targets: [
                    {
                        src: 'js/*',
                        dest: 'js'
                    }
                ]
            }),
            EnvironmentPlugin({'NOSTR_PUB': env.NOSTR_PUB}),
        ],
        root: 'src',
        // define: {
        //     __NOSTR_PUB__: `"${env.NOSTR_PUB}"`,
        //     BLA: '"test"',
        // },
        build: {
            minify: true,
            cssCodeSplit: false,
            rollupOptions: {
                output: {
                    manualChunks: false
                }
            },
            outDir: '../public'
        }
    };
});