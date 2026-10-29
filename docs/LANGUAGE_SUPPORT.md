# English and isiZulu

The first translated interface set covers login, registration, the member dashboard,
and funeral configuration/application screens. English is the fallback for phrases
not yet in the shared catalogue. User-entered names, community names, plan names,
prices, uploaded documents, training content and legal documents are not translated.
The isiZulu copy should receive fluent-speaker review before a public release;
translated interface consent labels do not replace the original legal documents.

## Persistence

Authenticated GET/PUT `/api/preferences/language` reads/writes only the current
user's preference. Supported values are `en` and `zu`. The preferences are stored
in the existing MariaDB platform document, alongside (not replacing) other data.
No schema migration or new database service is required. Only active accounts can
read or save preferences. Missing preferences default to English without a write.

Before authentication the preference is held in memory. Choosing a language on
login/registration saves it when that browser session receives its full access
token. An anonymous page reload resets to English. Signed-in page reloads retrieve
the choice from MariaDB. No language preference is written to browser storage.
Existing authentication storage is unchanged. Logout clears the in-memory locale.

## Development

`frontend/public/language-catalogue.js` holds interface translations;
`language.js` handles locale changes and preference requests. Angular uses the
shared standalone selector and translation pipe in `language.component.ts`.
The isiZulu catalogue is lazy loaded to preserve the existing build budget.
Standalone funeral pages use `language-page.js` for known interface phrases,
excluding input values and configured cover/plan names. Static route packaging
continues to copy these same-origin assets for Apache.

Run `node --test backend/test/language-preferences.test.js` and the production
frontend build. Browser checks should include switching in both directions,
retaining form values, login and page reload, dynamic family/child labels and
unchanged prices. Database verification must use an isolated synthetic document.
No deployment automation changes are needed.
