import { AsyncLocalStorage } from 'node:async_hooks';

export const apiKeyStore = new AsyncLocalStorage<string>();
