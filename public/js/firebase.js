// Firebase setup shared by the host screen and the player page.
// The web config is public by design: access is controlled by database.rules.json.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { getDatabase, enableLogging, ref, onValue } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-database.js';

export {
  ref, get, set, update, remove, push, query, orderByChild, equalTo,
  onValue, onDisconnect, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAHstoZBH42oVaO1SL-8brZzr-7W9s5hzg',
  authDomain: 'graduation-project-a0d1e.firebaseapp.com',
  databaseURL: 'https://graduation-project-a0d1e-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'graduation-project-a0d1e',
  storageBucket: 'graduation-project-a0d1e.firebasestorage.app',
  messagingSenderId: '369449051904',
  appId: '1:369449051904:web:2767c61d5cb272015375e5',
};

// ?debug in the URL prints the SDK log, including the WebSocket connection.
if (new URLSearchParams(location.search).has('debug')) enableLogging(true);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Anonymous sign-in: every browser gets its own user id (uid) with no account needed.
export async function signIn() {
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}

// Shows the live WebSocket connection state in an element.
export function watchConnection(el) {
  onValue(ref(db, '.info/connected'), (snap) => {
    const online = snap.val() === true;
    el.textContent = online ? 'متصل لحظياً' : 'غير متصل';
    el.classList.toggle('is-online', online);
  });
}

export function escapeText(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
