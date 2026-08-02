# Waylog — Travel Expense Tracker

A tiny, fast expense tracker for trips (domestic or international). No
backend, no accounts, no analytics — every expense is stored only in
your iPhone's browser storage (`localStorage`). Nothing is ever sent
anywhere over the network.

## 1. Put it on GitHub Pages

1. Create a new **public** GitHub repository (e.g. `waylog`).
2. Upload all the files in this folder to the repo, keeping the
   `icons/` folder structure intact:
   ```
   index.html
   style.css
   app.js
   sw.js
   manifest.json
   icons/
     icon-192.png
     icon-512.png
     apple-touch-icon.png
   ```
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to `Deploy from a
   branch`, pick the `main` branch and `/ (root)` folder, then **Save**.
5. Wait a minute, then GitHub will show your live URL, something like:
   `https://<your-username>.github.io/waylog/`

## 2. Add it to your iPhone home screen

1. Open the GitHub Pages URL above in **Safari** on your iPhone (it
   must be Safari — Chrome/other browsers on iOS can't install to the
   home screen).
2. Tap the **Share** button (square with an arrow).
3. Tap **Add to Home Screen**, then **Add**.
4. Launch Waylog from the new icon — it opens full-screen, with no
   Safari address bar, just like a native app.

Installing it this way (rather than just bookmarking it) also gives
iOS's storage a much stronger reason not to clear your data.

## 3. About your data

- Everything — trips, expenses, notes — lives in this one browser's
  `localStorage`, scoped to your GitHub Pages URL.
- It **only exists on this phone, in this app icon**. It won't show up
  if you open the same URL on another device, and won't sync anywhere.
- iOS *can*, in rare cases, clear website storage (e.g. if you haven't
  opened the app in a very long time, or you clear Safari's website
  data). Installing to the home screen makes this much less likely,
  but it's still worth backing up occasionally.
- Use **Trips → Export backup** any time to save a `.json` file (via
  the share sheet, to Files/iCloud). **Trips → Import backup** restores
  from one of these files, replacing what's currently in the app —
  handy if you get a new phone or clear your browser data.

## 4. Using the app

- Tap **+** to add an expense: title, amount, currency, category, date,
  and an optional note.
- Tap any expense in the list to edit or delete it.
- Tap the pill at the top-right (e.g. "All trips") to switch between
  trips, create a new named trip (e.g. "Japan 2026"), rename, or delete
  one. Deleting a trip keeps its expenses — they just move to "No trip".
- The card at the top totals whatever you're currently viewing (a
  single trip or "All trips"), split out by currency, since amounts in
  different currencies aren't added together.
- Use the search box and category chips to filter the list.

## 5. Customizing

Everything is plain HTML/CSS/JS, no build step or framework:

- `app.js` — all app logic and state (look for `CURRENCIES` and
  `CATEGORIES` near the top if you want to add/remove either).
- `style.css` — all visual styling; CSS custom properties (`--ink`,
  `--paper`, `--gold`, etc.) are defined at the top of the file.
- `index.html` — page structure and the sheet/modal templates.
- `sw.js` — optional offline cache for the app shell (safe to delete
  along with its `<script>` reference in `app.js` if you don't want it).

## 6. A note on browser storage

This app deliberately avoids anything fancier than `localStorage` — no
IndexedDB, no cookies, no third-party storage — to keep the codebase
small and easy to audit. That's why the export/import backup feature
exists: it's your safety net.
