# Graduation Project

مشروع التخرج، مربوط بـ Firebase عن طريق GitHub Actions.

| | |
|---|---|
| Firebase project | `graduation-project-a0d1e` |
| Live site | https://graduation-project-a0d1e.web.app |
| Deploy | Automatic on every push to `main` (GitHub Actions) |

## الأسبوع الأول: البيئة والسحابة

- تثبيت Node.js و Firebase CLI
- إنشاء مشروع Firebase
- إنشاء مستودع GitHub وربطه بـ Firebase (نشر تلقائي)

## Run locally

```bash
npm install -g firebase-tools
firebase login
firebase serve --only hosting
```

## Deploy manually

```bash
firebase deploy --only hosting
```
