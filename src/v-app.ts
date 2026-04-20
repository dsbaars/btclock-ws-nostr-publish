import { createApp } from 'vue'
import './app.css'

import App from './App.vue'
import { MODULE_KEY, type BTClockModule } from './btclock_module'

const app = createApp(App)
app.provide(MODULE_KEY, (globalThis as unknown as { Module?: BTClockModule }).Module)
app.mount('#app')
