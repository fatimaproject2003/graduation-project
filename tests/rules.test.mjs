// Security rules tests for database.rules.json, run on the Firebase Database Emulator:
//   npm run test:rules
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const NOW = { '.sv': 'timestamp' }; // server timestamp

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-graduation-project',
    database: { rules: readFileSync('database.rules.json', 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

// Fresh data before every test: one admin, one category, two questions,
// one room hosted by "host" with "player1" already in it.
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      admins: { admin1: true },
      categories: { cloud: { name: 'الحوسبة السحابية', nameEn: 'Cloud Computing', order: 1 } },
      questions: {
        q01: { categoryId: 'cloud', text: 'سؤال تجريبي أول؟', options: ['أ', 'ب', 'ج', 'د'], difficulty: 'easy', timeLimitSec: 15, createdAt: 1 },
        q02: { categoryId: 'cloud', text: 'سؤال تجريبي ثان؟', options: ['أ', 'ب', 'ج', 'د'], difficulty: 'easy', timeLimitSec: 15, createdAt: 1 },
      },
      answerKeys: { q01: { correctIndex: 2 }, q02: { correctIndex: 0 } },
      rooms: {
        room1: {
          code: 'ABC123', hostUid: 'host', status: 'waiting', createdAt: 1,
          settings: { categoryId: 'cloud', questionCount: 2, timePerQuestionSec: 20 },
          questionIds: ['q01', 'q02'],
        },
      },
      roomCodes: { ABC123: 'room1' },
      roomPlayers: { room1: { player1: { name: 'Ali', score: 0, joinedAt: 1, online: true } } },
    });
  });
});

const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();

async function startGame() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref('rooms/room1').update({
      status: 'playing',
      current: { index: 0, questionId: 'q01', startedAt: Date.now() },
    });
  });
}

describe('Question bank', () => {
  test('a visitor who is not signed in cannot read questions', async () => {
    await assertFails(db().ref('questions').once('value'));
  });

  test('a signed-in player can read questions', async () => {
    await assertSucceeds(db('player1').ref('questions').once('value'));
  });

  test('a player cannot read the answer keys', async () => {
    await assertFails(db('player1').ref('answerKeys').once('value'));
    await assertFails(db('player1').ref('answerKeys/q01').once('value'));
  });

  test('an admin can read the answer keys', async () => {
    await assertSucceeds(db('admin1').ref('answerKeys').once('value'));
  });

  test('a player cannot add or edit questions', async () => {
    await assertFails(db('player1').ref('questions/q99').set({
      categoryId: 'cloud', text: 'سؤال من لاعب؟', options: ['1', '2', '3', '4'], difficulty: 'easy', timeLimitSec: 15, createdAt: NOW,
    }));
    await assertFails(db('player1').ref('questions/q01/text').set('تغيير السؤال'));
  });

  test('an admin can add a valid question', async () => {
    await assertSucceeds(db('admin1').ref('questions/q03').set({
      categoryId: 'cloud', text: 'سؤال جديد صحيح؟', options: ['1', '2', '3', '4'], difficulty: 'hard', timeLimitSec: 30, createdAt: NOW,
    }));
  });

  test('an invalid question is rejected even for an admin', async () => {
    // only 3 options
    await assertFails(db('admin1').ref('questions/q04').set({
      categoryId: 'cloud', text: 'سؤال ناقص؟', options: ['1', '2', '3'], difficulty: 'easy', timeLimitSec: 15, createdAt: NOW,
    }));
    // category that does not exist
    await assertFails(db('admin1').ref('questions/q05').set({
      categoryId: 'sports', text: 'تصنيف غير موجود؟', options: ['1', '2', '3', '4'], difficulty: 'easy', timeLimitSec: 15, createdAt: NOW,
    }));
    // unknown difficulty and an extra field
    await assertFails(db('admin1').ref('questions/q06').set({
      categoryId: 'cloud', text: 'حقل إضافي؟', options: ['1', '2', '3', '4'], difficulty: 'impossible', timeLimitSec: 15, createdAt: NOW, hacked: true,
    }));
  });

  test('the sample question bank (database/seed.json) passes every validation rule', async () => {
    const seed = JSON.parse(readFileSync('database/seed.json', 'utf8'));
    const admin = db('admin1');
    await assertSucceeds(admin.ref('categories').update(seed.categories));
    for (const [id, question] of Object.entries(seed.questions)) {
      await assertSucceeds(admin.ref(`questions/${id}`).set(question));
      await assertSucceeds(admin.ref(`answerKeys/${id}`).set(seed.answerKeys[id]));
    }
  });

  test('a correct index outside 0-3 is rejected', async () => {
    await assertFails(db('admin1').ref('answerKeys/q01/correctIndex').set(7));
  });
});

describe('Rooms', () => {
  test('a signed-in user can create a room as its host, with its join code', async () => {
    await assertSucceeds(db('alice').ref().update({
      'rooms/room2': {
        code: 'XYZ789', hostUid: 'alice', status: 'waiting', createdAt: NOW,
        settings: { categoryId: 'cloud', questionCount: 2, timePerQuestionSec: 15 },
        questionIds: ['q01', 'q02'],
      },
      'roomCodes/XYZ789': 'room2',
    }));
  });

  test('nobody can create a room in someone else\'s name', async () => {
    await assertFails(db('alice').ref('rooms/room3').set({
      code: 'QWE456', hostUid: 'bob', status: 'waiting', createdAt: NOW,
      settings: { categoryId: 'cloud', questionCount: 2, timePerQuestionSec: 15 },
    }));
  });

  test('a join code cannot point to another user\'s room', async () => {
    await assertFails(db('alice').ref('roomCodes/ZZZ999').set('room1'));
  });

  test('players cannot list every room, but can open a room they know', async () => {
    await assertFails(db('player1').ref('rooms').once('value'));
    await assertSucceeds(db('player1').ref('rooms/room1').once('value'));
    await assertSucceeds(db('player1').ref('roomCodes/ABC123').once('value'));
  });

  test('only the host can start the game', async () => {
    await assertFails(db('player1').ref('rooms/room1/status').set('playing'));
    await assertSucceeds(db('host').ref('rooms/room1').update({
      status: 'playing',
      current: { index: 0, questionId: 'q01', startedAt: NOW },
    }));
  });

  test('the current question must match the room\'s question list', async () => {
    await assertFails(db('host').ref('rooms/room1').update({
      status: 'playing',
      current: { index: 0, questionId: 'q02', startedAt: NOW },
    }));
  });

  test('the host cannot hand the room to someone else', async () => {
    await assertFails(db('host').ref('rooms/room1/hostUid').set('player1'));
  });
});

describe('Players and scores', () => {
  test('a player can join a waiting room with a score of 0', async () => {
    await assertSucceeds(db('player2').ref('roomPlayers/room1/player2').set({
      name: 'Sara', score: 0, joinedAt: NOW, online: true,
    }));
  });

  test('a player cannot join with a score above 0', async () => {
    await assertFails(db('player2').ref('roomPlayers/room1/player2').set({
      name: 'Sara', score: 100, joinedAt: NOW, online: true,
    }));
  });

  test('a player cannot raise their own score', async () => {
    await assertFails(db('player1').ref('roomPlayers/room1/player1/score').set(50));
  });

  test('a player cannot edit another player', async () => {
    await assertFails(db('player2').ref('roomPlayers/room1/player1/name').set('Hacked'));
  });

  test('a new player cannot join after the game has started', async () => {
    await startGame();
    await assertFails(db('player2').ref('roomPlayers/room1/player2').set({
      name: 'Late', score: 0, joinedAt: NOW, online: true,
    }));
  });
});

describe('Answers', () => {
  test('a player can answer the current question once', async () => {
    await startGame();
    const ref = db('player1').ref('roomAnswers/room1/q01/player1');
    await assertSucceeds(ref.set({ choice: 2, answeredAt: NOW }));
    await assertFails(ref.set({ choice: 1, answeredAt: NOW }));
  });

  test('a player cannot answer a question that is not the current one', async () => {
    await startGame();
    await assertFails(db('player1').ref('roomAnswers/room1/q02/player1').set({ choice: 0, answeredAt: NOW }));
  });

  test('a player cannot answer before the game starts', async () => {
    await assertFails(db('player1').ref('roomAnswers/room1/q01/player1').set({ choice: 0, answeredAt: NOW }));
  });

  test('someone outside the room cannot answer', async () => {
    await startGame();
    await assertFails(db('stranger').ref('roomAnswers/room1/q01/stranger').set({ choice: 0, answeredAt: NOW }));
  });

  test('an answer after the time limit is rejected', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('rooms/room1').update({
        status: 'playing',
        current: { index: 0, questionId: 'q01', startedAt: Date.now() - 60_000 },
      });
    });
    await assertFails(db('player1').ref('roomAnswers/room1/q01/player1').set({ choice: 2, answeredAt: NOW }));
  });

  test('a player cannot see other players\' answers, but the host can', async () => {
    await startGame();
    await assertSucceeds(db('player1').ref('roomAnswers/room1/q01/player1').set({ choice: 2, answeredAt: NOW }));
    await assertFails(db('player2').ref('roomAnswers/room1').once('value'));
    await assertSucceeds(db('player1').ref('roomAnswers/room1/q01/player1').once('value'));
    await assertSucceeds(db('host').ref('roomAnswers/room1').once('value'));
  });
});

describe('Week 3: host screen and joining', () => {
  const newRoom = (host, pin, roomId) => ({
    [`rooms/${roomId}`]: {
      code: pin, hostUid: host, status: 'waiting', createdAt: NOW,
      settings: { categoryId: 'cloud', questionCount: 2, timePerQuestionSec: 20 },
      questionIds: ['q01', 'q02'],
    },
    [`roomCodes/${pin}`]: roomId,
  });

  test('the host can pick questions of one category (indexed query)', async () => {
    await assertSucceeds(db('host').ref('questions').orderByChild('categoryId').equalTo('cloud').once('value'));
  });

  test('the host creates a room with a 6-digit PIN in one write', async () => {
    await assertSucceeds(db('host2').ref().update(newRoom('host2', '482913', 'roomA')));
  });

  test('a PIN that is already taken cannot be reused by another host', async () => {
    await assertSucceeds(db('host2').ref().update(newRoom('host2', '555111', 'roomB')));
    // a different host, a different room, the same PIN
    await assertFails(db('host3').ref().update(newRoom('host3', '555111', 'roomC')));
    // the same host can still create that room with a fresh PIN
    await assertSucceeds(db('host3').ref().update(newRoom('host3', '555112', 'roomC')));
  });

  test('the host and other players can see the players list, visitors cannot', async () => {
    await assertSucceeds(db('host').ref('roomPlayers/room1').once('value'));
    await assertSucceeds(db('player1').ref('roomPlayers/room1').once('value'));
    await assertFails(db().ref('roomPlayers/room1').once('value'));
  });

  test('a returning player can update their name and come back online', async () => {
    await assertSucceeds(db('player1').ref('roomPlayers/room1/player1').update({ name: 'Ali K', online: true }));
  });

  test('presence: the player can be marked offline, but only with true/false', async () => {
    await assertSucceeds(db('player1').ref('roomPlayers/room1/player1').update({ online: false }));
    await assertFails(db('player1').ref('roomPlayers/room1/player1/online').set('maybe'));
  });

  test('a player can leave the room but cannot remove someone else', async () => {
    await assertFails(db('player2').ref('roomPlayers/room1/player1').remove());
    await assertSucceeds(db('player1').ref('roomPlayers/room1/player1').remove());
  });
});
