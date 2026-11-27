// Player page: join a room with its PIN (typed, or from the host's QR code).
import {
  db, signIn, watchConnection,
  ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp,
} from './firebase.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'quiz-player';

let user;
let playerRef = null;
let listeners = [];

function show(sectionId) {
  for (const id of ['loading', 'joinForm', 'waiting']) $(id).hidden = id !== sectionId;
}

function showError(message) {
  $('joinError').textContent = message;
  $('joinError').hidden = !message;
}

function stopListening() {
  listeners.forEach((off) => off());
  listeners = [];
}

async function findRoom(pin) {
  const codeSnap = await get(ref(db, `roomCodes/${pin}`));
  if (!codeSnap.exists()) throw new Error('رمز الغرفة غير صحيح.');
  const roomId = codeSnap.val();
  const roomSnap = await get(ref(db, `rooms/${roomId}`));
  if (!roomSnap.exists()) throw new Error('الغرفة لم تعد موجودة.');
  return { roomId, room: roomSnap.val() };
}

async function join(pin, name) {
  const { roomId, room } = await findRoom(pin);
  const pRef = ref(db, `roomPlayers/${roomId}/${user.uid}`);
  const existing = await get(pRef);
  if (existing.exists()) {
    await update(pRef, { name, online: true }); // coming back to the same room
  } else {
    if (room.status !== 'waiting') throw new Error('بدأت اللعبة في هذه الغرفة، لا يمكن الانضمام الآن.');
    await set(pRef, { name, score: 0, joinedAt: serverTimestamp(), online: true });
  }
  playerRef = pRef;
  sessionStorage.setItem(STORE_KEY, JSON.stringify({ pin, name }));
  enterWaiting(roomId, pin, name);
}

function enterWaiting(roomId, pin, name) {
  $('waitPin').textContent = `${pin.slice(0, 3)} ${pin.slice(3)}`;
  $('waitName').textContent = name;
  show('waiting');

  // Presence: when the WebSocket drops, the server marks the player offline;
  // when it reconnects, the player is marked online again.
  listeners.push(onValue(ref(db, '.info/connected'), async (snap) => {
    if (snap.val() !== true || !playerRef) return;
    try {
      await onDisconnect(playerRef).update({ online: false });
      await update(playerRef, { online: true });
    } catch (err) {
      console.warn('presence update failed', err);
    }
  }));

  listeners.push(onValue(ref(db, `roomPlayers/${roomId}`), (snap) => {
    const players = snap.val() || {};
    $('waitCount').textContent = String(Object.keys(players).length);
    if (!players[user.uid]) backToForm('تمت إزالتك من الغرفة.'); // removed by the host
  }));

  listeners.push(onValue(ref(db, `rooms/${roomId}/status`), (snap) => {
    const status = snap.val();
    $('waitStatus').textContent = status === 'playing' ? 'بدأت اللعبة!' : 'بانتظار المضيف ليبدأ اللعبة…';
  }));
}

function backToForm(message = '') {
  stopListening();
  playerRef = null;
  sessionStorage.removeItem(STORE_KEY);
  showError(message);
  show('joinForm');
}

async function leave() {
  if (playerRef) {
    const leaving = playerRef;
    stopListening();
    await onDisconnect(leaving).cancel();
    await remove(leaving);
  }
  backToForm();
}

async function main() {
  watchConnection($('conn'));
  user = await signIn();

  const pinFromUrl = new URLSearchParams(location.search).get('pin');
  if (pinFromUrl) $('pinInput').value = pinFromUrl.replace(/\D/g, '').slice(0, 6);

  $('joinForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const pin = $('pinInput').value.replace(/\D/g, '');
    const name = $('nameInput').value.trim().replace(/\s+/g, ' ');
    if (pin.length !== 6) return showError('رمز الغرفة 6 أرقام.');
    if (!name) return showError('اكتب اسمك.');
    $('joinButton').disabled = true;
    showError('');
    try {
      await join(pin, name);
    } catch (err) {
      console.error(err);
      showError(err.message.includes('PERMISSION_DENIED') ? 'لا يمكن الانضمام إلى هذه الغرفة.' : err.message);
    } finally {
      $('joinButton').disabled = false;
    }
  });
  $('leaveButton').addEventListener('click', leave);

  // Rejoin automatically after a page reload.
  const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
  if (saved) {
    try {
      await join(saved.pin, saved.name);
      return;
    } catch {
      sessionStorage.removeItem(STORE_KEY);
    }
  }
  show('joinForm');
  ($('pinInput').value ? $('nameInput') : $('pinInput')).focus();
}

main().catch((err) => {
  console.error(err);
  show('joinForm');
  showError(`تعذّر الاتصال: ${err.message}`);
});
