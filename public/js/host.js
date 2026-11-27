// Host screen: creates a room with a 6-digit PIN and a QR code,
// then shows the players who join, live, over the Realtime Database WebSocket.
import qrcode from '../vendor/qrcode.mjs';
import {
  db, signIn, watchConnection, escapeText,
  ref, get, update, push, query, orderByChild, equalTo, onValue, serverTimestamp,
} from './firebase.js';

const $ = (id) => document.getElementById(id);
const AVATAR_COLORS = ['#4b3fd6', '#d6336c', '#0c8599', '#e8590c', '#2f9e44', '#7048e8', '#c2255c', '#1971c2'];

let user;
let categories = {};

function show(sectionId) {
  for (const id of ['loading', 'setup', 'lobby', 'failure']) $(id).hidden = id !== sectionId;
}

function fail(message) {
  $('failureText').textContent = message;
  show('failure');
}

function randomPin() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
  return String(100000 + n); // 100000-999999
}

function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function colorFor(uid) {
  let h = 0;
  for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

async function loadCategories() {
  const snap = await get(ref(db, 'categories'));
  categories = snap.val() || {};
  const sorted = Object.entries(categories).sort((a, b) => a[1].order - b[1].order);
  $('category').innerHTML = sorted
    .map(([id, c]) => `<option value="${escapeText(id)}">${escapeText(c.name)}</option>`)
    .join('');
}

async function createRoom() {
  const button = $('create');
  button.disabled = true;
  $('setupError').hidden = true;
  try {
    const categoryId = $('category').value;
    const wanted = Number($('questionCount').value);
    const timePerQuestionSec = Number($('timePerQuestion').value);

    const qSnap = await get(query(ref(db, 'questions'), orderByChild('categoryId'), equalTo(categoryId)));
    const questionIds = shuffle(Object.keys(qSnap.val() || {})).slice(0, wanted);
    if (questionIds.length === 0) throw new Error('لا توجد أسئلة في هذا التصنيف.');

    const roomId = push(ref(db, 'rooms')).key;
    let pin;
    // Room and PIN are written together; if the PIN is already taken the rules
    // reject the whole write, so try again with a new PIN.
    for (let attempt = 1; ; attempt += 1) {
      pin = randomPin();
      try {
        await update(ref(db), {
          [`rooms/${roomId}`]: {
            code: pin,
            hostUid: user.uid,
            status: 'waiting',
            createdAt: serverTimestamp(),
            settings: { categoryId, questionCount: questionIds.length, timePerQuestionSec },
            questionIds,
          },
          [`roomCodes/${pin}`]: roomId,
        });
        break;
      } catch (err) {
        if (attempt >= 5) throw err;
      }
    }

    history.replaceState(null, '', `/host?room=${roomId}`);
    openLobby(roomId);
  } catch (err) {
    console.error(err);
    $('setupError').textContent = `تعذّر إنشاء الغرفة: ${err.message}`;
    $('setupError').hidden = false;
  } finally {
    button.disabled = false;
  }
}

function renderPlayers(players) {
  const list = Object.entries(players || {})
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  const online = list.filter(([, p]) => p.online !== false).length;

  $('playerCount').textContent = String(list.length);
  $('empty').hidden = list.length > 0;
  $('players').innerHTML = list.map(([uid, p]) => `
    <li class="player${p.online === false ? ' is-offline' : ''}" data-uid="${escapeText(uid)}">
      <span class="avatar" style="background:${colorFor(uid)}">${escapeText((p.name || '?').trim().charAt(0))}</span>
      <span class="name">${escapeText(p.name || '')}</span>
      <span class="dot" title="${p.online === false ? 'غير متصل' : 'متصل'}"></span>
    </li>`).join('');
  document.title = `شاشة المضيف (${list.length})`;
  return online;
}

async function openLobby(roomId) {
  const roomSnap = await get(ref(db, `rooms/${roomId}`));
  const room = roomSnap.val();
  if (!room) return fail('الغرفة غير موجودة.');
  if (room.hostUid !== user.uid) return fail('هذه الغرفة لمضيف آخر.');
  if (!Object.keys(categories).length) await loadCategories();

  const joinUrl = `${location.origin}/join?pin=${room.code}`;
  $('joinUrl').textContent = `${location.host}/join`;
  $('pin').textContent = `${room.code.slice(0, 3)} ${room.code.slice(3)}`;
  $('pin').dataset.pin = room.code;

  const qr = qrcode(0, 'M');
  qr.addData(joinUrl);
  qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  $('qr').dataset.url = joinUrl;

  const category = categories[room.settings.categoryId]?.name || room.settings.categoryId;
  $('roomInfo').textContent =
    `${category} · ${room.settings.questionCount} أسئلة · ${room.settings.timePerQuestionSec} ثانية لكل سؤال`;

  show('lobby');

  // Live list: the SDK keeps one WebSocket open and pushes every change here.
  onValue(ref(db, `roomPlayers/${roomId}`), (snap) => renderPlayers(snap.val()));
}

async function main() {
  watchConnection($('conn'));
  try {
    user = await signIn();
  } catch (err) {
    console.error(err);
    return fail(`تعذّر تسجيل الدخول: ${err.message}`);
  }

  const roomId = new URLSearchParams(location.search).get('room');
  if (roomId) return openLobby(roomId).catch((err) => fail(err.message));

  await loadCategories();
  $('create').addEventListener('click', createRoom);
  show('setup');
}

main();
