/**
 * Google Apps Script — Ridhaan's Namkaran Drive bridge
 * ----------------------------------------------------
 * Uses your shared event folder:
 * https://drive.google.com/drive/folders/19kyYw30b3oeF0KuBJZHZMbYH0UzYVc-B
 *
 * Expected subfolders inside it:
 *   - photos
 *   - videos
 *   - Guest Uploads
 *
 * SETUP
 * 1. https://script.google.com → open your existing project (or New project)
 * 2. Replace Code.gs with this entire file (paste once — no duplicates)
 * 3. Save → Deploy → Manage deployments → Edit → Version: New version → Deploy
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web app URL into gallery.json → driveUpload.endpoint
 * 5. Set driveUpload.enabled = true
 * 6. Share the root folder (and files) as “Anyone with the link” for public viewing
 *
 * ENDPOINTS
 *   GET  ?action=list        → photos + videos + guest uploads (all statuses)
 *   GET  ?action=listGuests  → guest uploads only
 *   POST { action: "adminLogin", password }   → verify admin password (server-side only)
 *   POST { fileName, base64, … }              → save guest file (default status: pending)
 *   POST { action: "setStatus", fileId, status, token } → approve / reject a guest file
 */

const ROOT_FOLDER_ID = "19kyYw30b3oeF0KuBJZHZMbYH0UzYVc-B";
const PHOTOS_FOLDER_NAME = "photos";
const VIDEOS_FOLDER_NAME = "videos";
const GUEST_FOLDER_NAME = "Guest Uploads";
// Keep this ONLY in Apps Script — never put it in gallery.json or the website files
const ADMIN_PASSWORD = "AdminRidhaan2026";
// Bump this whenever you redeploy so the website can detect stale deployments
const BRIDGE_VERSION = "2026-08-17-admin-auth-v3";
const ADMIN_TOKEN_TTL_SECONDS = 6 * 60 * 60; // 6 hours

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "ping";

    if (action === "list") {
      return json_(listGallery_());
    }

    if (action === "listGuests") {
      return json_({
        ok: true,
        version: BRIDGE_VERSION,
        guests: listGuestFiles_(),
      });
    }

    return json_({
      ok: true,
      version: BRIDGE_VERSION,
      message: "Ridhaan Namkaran Drive bridge is live.",
      rootFolderId: ROOT_FOLDER_ID,
      features: ["list", "listGuests", "setStatus", "adminLogin"],
    });
  } catch (err) {
    return json_({
      ok: false,
      message: String(err && err.message ? err.message : err),
    });
  }
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || "";
    const data = JSON.parse(raw);

    if (data && data.action === "adminLogin") {
      return json_(adminLogin_(data.password));
    }

    if (data && data.action === "setStatus") {
      requireAdminToken_(data.token);
      return json_(setGuestStatus_(data.fileId, data.status));
    }

    if (!data || !data.base64 || !data.fileName) {
      return json_({ ok: false, message: "Missing file data." });
    }

    // Rough safety limit for Apps Script (~40MB)
    if (String(data.base64).length > 55 * 1024 * 1024) {
      return json_({
        ok: false,
        message: "File too large for Apps Script upload. Please use a smaller file.",
      });
    }

    const status = normalizeStatus_(data.status || "pending");
    const folder = getSubFolder_(GUEST_FOLDER_NAME, true);
    const bytes = Utilities.base64Decode(data.base64);
    const resolved = resolveMimeAndName_(data.fileName, data.mimeType);
    const blob = Utilities.newBlob(bytes, resolved.mimeType, resolved.fileName);
    const file = folder.createFile(blob);

    const guestName = data.guestName || "Guest";
    file.setDescription(buildGuestDescription_(guestName, data.guestMobile, data.recordId, status));

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Ignore if account policy blocks public sharing
    }

    return json_({
      ok: true,
      fileId: file.getId(),
      fileName: file.getName(),
      folderId: folder.getId(),
      viewUrl: file.getUrl(),
      status: status,
    });
  } catch (err) {
    return json_({
      ok: false,
      message: String(err && err.message ? err.message : err),
    });
  }
}

function listGallery_() {
  const photoFolder = getSubFolder_(PHOTOS_FOLDER_NAME, false);
  const videoFolder = getSubFolder_(VIDEOS_FOLDER_NAME, false);

  return {
    ok: true,
    version: BRIDGE_VERSION,
    rootFolderId: ROOT_FOLDER_ID,
    photos: photoFolder ? listFilesInFolder_(photoFolder, "image") : [],
    videos: videoFolder ? listFilesInFolder_(videoFolder, "video") : [],
    guests: listGuestFiles_(),
  };
}

function listGuestFiles_() {
  const folder = getSubFolder_(GUEST_FOLDER_NAME, false);
  if (!folder) return [];

  const out = [];
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const mime = String(file.getMimeType() || "");
    const name = file.getName();
    const desc = String(file.getDescription() || "");
    let kind = "";

    if (mime.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(name)) {
      kind = "image";
    } else if (mime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(name)) {
      kind = "video";
    } else {
      continue;
    }

    out.push({
      title: name.replace(/\.[^.]+$/, ""),
      name: name,
      driveId: file.getId(),
      mimeType: mime,
      type: kind,
      status: parseStatus_(desc),
      guestName: parseUploader_(desc),
      createdAt: file.getDateCreated() ? file.getDateCreated().getTime() : 0,
      viewUrl: file.getUrl(),
    });
  }

  out.sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return out;
}

function adminLogin_(password) {
  if (!ADMIN_PASSWORD) {
    return { ok: false, message: "Admin password is not configured in Apps Script." };
  }
  if (String(password || "") !== String(ADMIN_PASSWORD)) {
    return { ok: false, message: "That admin password doesn't seem right." };
  }

  const token = Utilities.getUuid() + "-" + Utilities.getUuid();
  CacheService.getScriptCache().put(adminCacheKey_(token), "1", ADMIN_TOKEN_TTL_SECONDS);

  return {
    ok: true,
    token: token,
    expiresInSeconds: ADMIN_TOKEN_TTL_SECONDS,
    version: BRIDGE_VERSION,
  };
}

function requireAdminToken_(token) {
  if (!token) {
    throw new Error("Admin login required.");
  }
  const cached = CacheService.getScriptCache().get(adminCacheKey_(token));
  if (!cached) {
    throw new Error("Admin session expired. Please log in again.");
  }
  // Refresh TTL on activity
  CacheService.getScriptCache().put(adminCacheKey_(token), "1", ADMIN_TOKEN_TTL_SECONDS);
}

function adminCacheKey_(token) {
  return "admin_token_" + String(token || "");
}

function setGuestStatus_(fileId, status) {
  const normalized = normalizeStatus_(status);
  if (!fileId) {
    return { ok: false, message: "Missing fileId." };
  }
  if (!normalized) {
    return { ok: false, message: "Status must be pending, approved, or rejected." };
  }

  const file = DriveApp.getFileById(String(fileId));
  const desc = String(file.getDescription() || "");
  const guestName = parseUploader_(desc) || "Guest";
  const mobileMatch = desc.match(/Mobile:\s*(.+)/i);
  const recordMatch = desc.match(/Record ID:\s*(.+)/i);
  const mobile = mobileMatch ? String(mobileMatch[1]).trim() : "";
  const recordId = recordMatch ? String(recordMatch[1]).trim() : "";

  file.setDescription(buildGuestDescription_(guestName, mobile, recordId, normalized));

  return {
    ok: true,
    fileId: file.getId(),
    status: normalized,
  };
}

function buildGuestDescription_(guestName, guestMobile, recordId, status) {
  return [
    "Status: " + status,
    "Guest upload from Ridhaan's Namkaran website",
    "Uploader: " + (guestName || "Guest"),
    guestMobile ? "Mobile: " + guestMobile : "",
    recordId ? "Record ID: " + recordId : "",
    "Updated at: " + new Date().toISOString(),
  ]
    .filter(Boolean)
    .join("\n");
}

function parseStatus_(desc) {
  const match = String(desc || "").match(/Status:\s*(pending|approved|rejected)/i);
  if (match) return match[1].toLowerCase();
  // Older uploads written only on approve
  if (/Approved at:/i.test(desc)) return "approved";
  return "pending";
}

function parseUploader_(desc) {
  const match = String(desc || "").match(/Uploader:\s*(.+)/i);
  return match ? String(match[1]).trim() : "Guest";
}

function normalizeStatus_(status) {
  const value = String(status || "").toLowerCase();
  if (value === "pending" || value === "approved" || value === "rejected") {
    return value;
  }
  return "";
}

function listFilesInFolder_(folder, kind) {
  const out = [];
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const mime = String(file.getMimeType() || "");
    const name = file.getName();
    const id = file.getId();

    if (kind === "image") {
      if (!mime.startsWith("image/") && !/\.(jpe?g|png|webp|gif)$/i.test(name)) continue;
      out.push({
        title: name.replace(/\.[^.]+$/, ""),
        driveId: id,
        mimeType: mime,
      });
    } else if (kind === "video") {
      if (!mime.startsWith("video/") && !/\.(mp4|webm|mov|m4v)$/i.test(name)) continue;
      out.push({
        title: name.replace(/\.[^.]+$/, ""),
        driveId: id,
        mimeType: mime,
      });
    }
  }

  out.sort(function (a, b) {
    return String(a.title).localeCompare(String(b.title), undefined, { numeric: true });
  });

  return out;
}

function getRootFolder_() {
  return DriveApp.getFolderById(ROOT_FOLDER_ID);
}

function getSubFolder_(name, createIfMissing) {
  const root = getRootFolder_();
  const folders = root.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  if (createIfMissing) {
    return root.createFolder(name);
  }
  return null;
}

function sanitizeName_(name) {
  return String(name || "guest-file")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .slice(0, 180);
}

function resolveMimeAndName_(fileName, mimeType) {
  var name = sanitizeName_(fileName || "guest-upload");
  var mime = String(mimeType || "").toLowerCase();
  var extMatch = name.match(/\.([a-z0-9]+)$/i);
  var ext = extMatch ? extMatch[1].toLowerCase() : "";

  var mimeFromExt = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
  };
  var extFromMime = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-m4v": "m4v",
  };

  if ((!mime || mime === "application/octet-stream" || mime === "text/plain") && ext && mimeFromExt[ext]) {
    mime = mimeFromExt[ext];
  }
  if ((!ext || ext === "txt") && mime && extFromMime[mime]) {
    ext = extFromMime[mime];
    name = name.replace(/\.[^.]+$/, "") + "." + ext;
  }
  if (!mime && ext && mimeFromExt[ext]) {
    mime = mimeFromExt[ext];
  }
  if (!mime) {
    mime = "image/jpeg";
    if (!/\.(jpe?g|png|webp|gif)$/i.test(name)) {
      name = name.replace(/\.[^.]+$/, "") + ".jpg";
    }
  }
  if (!/\.[a-z0-9]+$/i.test(name) && extFromMime[mime]) {
    name += "." + extFromMime[mime];
  }

  return { fileName: name, mimeType: mime };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
