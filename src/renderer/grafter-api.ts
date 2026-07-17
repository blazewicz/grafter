import type { GrafterApi } from '../shared/contracts';
import { previewApi } from './preview-api';

export const api: GrafterApi =
  typeof window === 'undefined' ? previewApi : (window.grafter ?? previewApi);

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '');
}
