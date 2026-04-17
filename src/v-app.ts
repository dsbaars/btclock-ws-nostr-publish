import { createApp } from 'vue'
import './app.css'

import App from './App.vue'

const app = createApp(App)
app.provide('Module', (globalThis as any).Module)
app.mount('#app')
