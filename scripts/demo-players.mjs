// Simulates players joining a room, to test the host screen.
// Each player is a separate Firebase app instance with its own anonymous user,
// exactly like a separate phone, and goes through the same security rules.
//
//   node scripts/demo-players.mjs <PIN> [secondsBetweenPlayers] [secondsOnline]
//
// After secondsOnline the first player drops its connection (shows as offline on
// the host screen), then everyone leaves the room.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getDatabase, ref, get, set, remove, onDisconnect, serverTimestamp, goOffline,
} from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyAHstoZBH42oVaO1SL-8brZzr-7W9s5hzg',
  authDomain: 'graduation-project-a0d1e.firebaseapp.com',
  databaseURL: 'https://graduation-project-a0d1e-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'graduation-project-a0d1e',
  appId: '1:369449051904:web:2767c61d5cb272015375e5',
};

const NAMES = ['علي', 'زينب', 'حسين', 'مريم'];
const [pin, gapArg = '3', onlineArg = '20'] = process.argv.slice(2);
if (!/^\d{6}$/.test(pin || '')) {
  console.error('usage: node scripts/demo-players.mjs <6-digit PIN> [secondsBetweenPlayers] [secondsOnline]');
  process.exit(1);
}
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const log = (msg) => console.log(`${new Date().toISOString().slice(11, 19)}  ${msg}`);

const players = [];
for (const name of NAMES) {
  const app = initializeApp(firebaseConfig, `player-${name}`);
  const { user } = await signInAnonymously(getAuth(app));
  const db = getDatabase(app);
  const roomId = (await get(ref(db, `roomCodes/${pin}`))).val();
  if (!roomId) throw new Error(`no room with PIN ${pin}`);
  const playerRef = ref(db, `roomPlayers/${roomId}/${user.uid}`);
  await set(playerRef, { name, score: 0, joinedAt: serverTimestamp(), online: true });
  // Registered after joining: the rules validate it as a change to an existing player.
  await onDisconnect(playerRef).update({ online: false });
  players.push({ name, app, db, playerRef });
  log(`${name} joined room ${pin} (uid ${user.uid.slice(0, 8)}…)`);
  await sleep(Number(gapArg));
}

await sleep(Number(onlineArg));
goOffline(players[0].db); // connection dropped: the server runs onDisconnect -> online:false
log(`${players[0].name} lost connection`);
await sleep(Number(onlineArg));

for (const p of players) {
  if (p !== players[0]) {
    await onDisconnect(p.playerRef).cancel();
    await remove(p.playerRef);
  }
  await deleteApp(p.app);
}
log('demo players left the room');
process.exit(0);
