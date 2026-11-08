// Backend selector: Firebase when configured, otherwise the demo backend.
import { firebaseConfig } from '../config/firebase-config.js';

let instance = null;

export async function initApi(scope) {
  if (instance) return instance;
  const forceDemo = new URLSearchParams(location.search).has('demo');
  if (firebaseConfig.apiKey && !forceDemo) {
    // Never silently fall back to demo mode in production – orders would be
    // stored on this device only. Surface the error instead.
    const { createFirebaseBackend } = await import('./firebase-backend.js');
    instance = await createFirebaseBackend(scope, firebaseConfig);
    return instance;
  }
  const { createLocalBackend } = await import('./local-backend.js');
  instance = await createLocalBackend(scope);
  return instance;
}
