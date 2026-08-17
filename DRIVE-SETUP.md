# Google Drive setup (your event folder)

Your shared root folder:

[Ridhaan event Drive folder](https://drive.google.com/drive/folders/1YHgsXpwEY9jL4zwlGv0SgoC54dJbo8vR?usp=drive_link)

Expected folders inside it:

- `photos` → official ceremony photos (shown in Gallery → Photos)
- `videos` → official ceremony videos (shown in Gallery → Videos)
- `Guest Uploads` → approved guest files from the website

Folder ID saved in `gallery.json`:

`1YHgsXpwEY9jL4zwlGv0SgoC54dJbo8vR`

## Important sharing setting

For the website to show Drive images/videos publicly:

1. Open the root folder in Drive
2. Share → **Anyone with the link** → Viewer
3. Do the same for `photos`, `videos`, and `Guest Uploads` (or inherit from root)

## Connect Apps Script (required for listing + guest sync)

1. Open [script.google.com](https://script.google.com) → **New project**
2. Paste `scripts/google-apps-script-guest-upload.gs`
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the Web app URL
5. In `gallery.json` set:

```json
"driveUpload": {
  "enabled": true,
  "endpoint": "https://script.google.com/macros/s/XXXX/exec",
  "folderName": "Guest Uploads",
  "folderId": "",
  "listAction": "list"
}
```

## Admin password (keep off the website)

Do **not** put the admin password in `gallery.json` (it would be public on the live site).

Set it only in Apps Script `Code.gs`:

```js
const ADMIN_PASSWORD = "your-strong-password";
```

Then redeploy a **New version**. Admin login on `review.html` checks this password through Apps Script and never exposes it in frontend files.
  "listAction": "list"
}
```

6. Refresh the website

## What each part does

| Folder | Website |
|--------|---------|
| `photos` | Gallery → Photos (same masonry UI) |
| `videos` | Gallery → Videos |
| `Guest Uploads` | Receives files when you **Approve** in `review.html` |

## Netlify note

Keep the 5GB media in Drive. Netlify only hosts the website files, not the full album.
