import { createApp } from 'vue'
import './app.scss';

import App from './App.vue'

let app = createApp(App);
app.provide('Module', Module);
app.mount('#app')
