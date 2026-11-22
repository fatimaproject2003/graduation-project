# Real-Time Cloud-Native Multiplayer Quiz Platform

Utilizing Serverless Architecture and Auto-Scaling.

- إعداد الطالبة: فاطمة عبدالله عبدالعالي — المرحلة الرابعة
- بإشراف: د. وفاء شاكر محمد

| | |
|---|---|
| Firebase project | `graduation-project-a0d1e` |
| Live site | https://graduation-project-a0d1e.web.app |
| Realtime Database | `graduation-project-a0d1e-default-rtdb` |
| Deploy | Hosting: automatic on every push to `main` (GitHub Actions). Database rules: `firebase deploy --only database` |

## Week 1: environment and cloud

- Node.js and Firebase CLI installed
- Firebase project created and linked to this repository (GitHub Actions)

## Week 2: database and security

### JSON tree

```
/
├── admins/{uid}: true                      admin accounts (written from the console only)
├── categories/{categoryId}                 name, nameEn, order
├── questions/{questionId}                  categoryId, text, options[4], difficulty, timeLimitSec, createdAt
├── answerKeys/{questionId}                 correctIndex (0-3), kept apart so players never download it
├── rooms/{roomId}                          code, hostUid, status, createdAt,
│                                           settings {categoryId, questionCount, timePerQuestionSec},
│                                           questionIds[], current {index, questionId, startedAt}
├── roomCodes/{code}: roomId                6-character join code -> room
├── roomPlayers/{roomId}/{uid}              name, score, joinedAt, online
└── roomAnswers/{roomId}/{questionId}/{uid} choice (0-3), answeredAt
```

The tree is flat on purpose: a player listening to `rooms/{roomId}` does not download
every answer, and answer keys live outside `questions` so they can be locked separately.

### Security rules (`database.rules.json`)

| Path | Read | Write |
|---|---|---|
| `/` (everything else) | nobody | nobody |
| `questions`, `categories` | signed-in users | admins, validated (4 options, known category, difficulty, time 5-60 s) |
| `answerKeys` | admins only | admins only |
| `rooms/{roomId}` | signed-in users (no listing of all rooms) | creator becomes host; only the host changes it; host and code cannot change |
| `roomCodes/{code}` | signed-in users | the host of the room the code points to |
| `roomPlayers/{roomId}/{uid}` | signed-in users | the player themself, joining only while the room is waiting, starting at score 0; score changes are admin/server only |
| `roomAnswers/{roomId}/{questionId}/{uid}` | the player (own answer), the host | the player, once, only for the current question, only inside the time limit |

### Sample question bank

`database/seed.json`: 4 categories x 5 questions (cloud, programming, networks, databases) plus one demo room.

```bash
firebase database:set / database/seed.json
```

### Tests

27 tests in `tests/rules.test.mjs` run the rules on the Firebase Database Emulator (needs Java):

```bash
npm install
npm run test:rules
```
