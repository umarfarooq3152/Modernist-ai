
// @ts-ignore - CDN imports for Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
// @ts-ignore
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
// @ts-ignore
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js';

const firebaseConfig = {
  apiKey: "AIzaSyBy3s8SW7LQyJkFy-RDMirdvdMQ-wn80wY",
  authDomain: "shopping-1079d.firebaseapp.com",
  projectId: "shopping-1079d",
  storageBucket: "shopping-1079d.firebasestorage.app",
  messagingSenderId: "75869141163",
  appId: "1:75869141163:web:27b7ae2d554d69c431dfee",
  measurementId: "G-XZPC8NQ9PD"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize analytics only in supported environments
let analytics;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn("Analytics initialization skipped", e);
}
export { analytics };
