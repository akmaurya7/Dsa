# DSA Practice Board

A browser-based study tracker built from the supplied Striver SDE Sheet workbook.

## Features

- 455 problems grouped by topic and difficulty.
- Search by problem, topic, or subtopic.
- Mark problems complete or pending.
- Add and edit notes per problem.
- Open the practice links from the sheet.
- Progress and notes persist in browser local storage.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Firebase security

Deploy `firestore.rules` in the Firebase console or with the Firebase CLI before enabling cloud sync. It restricts each document to its owner and caps stored progress data, which also limits accidental Firestore cost.

The `vercel.json` headers add browser-side protections when deployed to Vercel.

For Google sign-in, enable Google under Firebase Authentication → Sign-in method, add the deployed hostname under Authentication → Settings → Authorized domains, and set the Firebase web config variables in Vercel for the production environment.
