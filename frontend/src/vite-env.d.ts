/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GENLAYER_NETWORK?: string;
  readonly VITE_GENLAYER_RPC_URL?: string;
  readonly VITE_LAWGUARD_CONTRACT_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
