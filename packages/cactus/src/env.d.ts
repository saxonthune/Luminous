// Augment ImportMeta with Vite's env properties so cactus source files
// can use import.meta.env.DEV without a vite/client type dependency.
interface ImportMeta {
  readonly env: {
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
    readonly BASE_URL: string;
    readonly SSR: boolean;
    [key: string]: unknown;
  };
}
