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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads denied by the rules fail with "Permission denied"; writes with "PERMISSION_DENIED: …".
export function isPermissionError(err) {
  return /permission[_ ]denied/i.test(String(err?.code || '') + ' ' + String(err?.message || ''));
}

// The sign-in token lasts one hour. A page left open on a locked phone may not have
// refreshed it yet, so the database briefly treats the user as signed out. Refresh the
// token first, and if the rules still say "denied", force a new token and try once more.
export async function withFreshAuth(action) {
  const user = await signIn();
  await user.getIdToken();
  try {
    return await action(user);
  } catch (err) {
    if (!isPermissionError(err)) throw err;
    await user.getIdToken(true);
    await sleep(1500); // give the database connection time to receive the new token
    return action(user);
  }
}

// Refresh the token as soon as a backgrounded tab (a phone waking up) becomes visible again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && auth.currentUser) {
    auth.currentUser.getIdToken().catch(() => {});
  }
});

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
