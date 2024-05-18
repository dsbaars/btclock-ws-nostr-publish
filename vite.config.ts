import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import vue from '@vitejs/plugin-vue';
import viteFastifyVue from '@fastify/vue/plugin'

import EnvironmentPlugin from 'vite-plugin-environment';
import terser from '@rollup/plugin-terser';

const path = fileURLToPath(import.meta.url)
const root = resolve(dirname(path), 'src')


export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    return {
        plugins: [
            vue(),
            viteFastifyVue(),
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
        root,
        // define: {
        //     __NOSTR_PUB__: `"${env.NOSTR_PUB}"`,
        //     BLA: '"test"',
        // },
        build: {
            minify: "terser",
            cssCodeSplit: false,
            rollupOptions: {
                output: {
                    plugins: [terser()]
                }
            },
            outDir: '../public'
        }
    };
});