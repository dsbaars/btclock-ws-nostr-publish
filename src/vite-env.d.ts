/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly NOSTR_PUB: string
    // more env variables...
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }