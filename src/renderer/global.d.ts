import type { GrafterApi } from '../shared/contracts';

declare global {
  interface Window {
    grafter?: GrafterApi;
  }
}

export {};
