// =====================================================================
// Firebase configuration
// ---------------------------------------------------------------------
// Leave `apiKey` empty to run in DEMO MODE (data stored in this browser,
// real-time between tabs on the same device).
// Fill in your Firebase web-app config (Firebase console → Project
// settings → Your apps) to switch to PRODUCTION MODE (multi-device
// real-time sync, Cloud Functions price validation, Storage uploads).
// =====================================================================
export const firebaseConfig = {
  apiKey: 'AIzaSyDrgNJwZLuOSMRQg1XnJ4zkvqNBF4hS-PQ',
  authDomain: 'order-pickup-891f2.firebaseapp.com',
  projectId: 'order-pickup-891f2',
  storageBucket: 'order-pickup-891f2.firebasestorage.app',
  messagingSenderId: '356022096623',
  appId: '1:356022096623:web:76b461b2c3ebbeeac9411a',
  // false = "Firestore only": business rules run in the browser inside Firestore
  // transactions – no Cloud Functions or Storage needed (free Spark plan).
  // true  = trusted Cloud Functions backend (Blaze plan) – see /functions.
  useCloudFunctions: false,
  // Region where /functions is deployed (must match functions/index.js)
  functionsRegion: 'asia-southeast1',
};
