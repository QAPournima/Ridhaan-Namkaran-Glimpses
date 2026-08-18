/*!
 * Shared helpers for Google Drive links + gallery config.
 * Paste Drive share links or file IDs into gallery.json.
 * Files must be shared as “Anyone with the link”.
 */
(function (global) {
    "use strict";

    function extractDriveId(value) {
        if (!value) return "";
        const text = String(value).trim();

        if (/^[a-zA-Z0-9_-]{20,}$/.test(text) && !text.includes("/")) {
            return text;
        }

        const patterns = [
            /\/file\/d\/([^/]+)/,
            /[?&]id=([^&]+)/,
            /\/d\/([^/]+)/,
            /\/open\?id=([^&]+)/,
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) return match[1];
        }

        return "";
    }

    function driveImageUrl(idOrLink, size) {
        const id = extractDriveId(idOrLink);
        if (!id) return "";
        const sz = size || "w1600";
        // thumbnail endpoint is the most reliable hotlink for shared Drive images
        return `https://drive.google.com/thumbnail?id=${id}&sz=${sz}`;
    }

    function driveImageCandidates(idOrLink, size) {
        const id = extractDriveId(idOrLink);
        if (!id) return [];
        const sz = size || "w1600";
        return [
            `https://drive.google.com/thumbnail?id=${id}&sz=${sz}`,
            `https://drive.google.com/uc?export=view&id=${id}`,
            `https://lh3.googleusercontent.com/d/${id}=${sz}`,
        ];
    }

    function bindDriveImage(img, idOrLink, preferredSrc, size) {
        if (!img) return;
        const candidates = [];
        if (preferredSrc && !String(preferredSrc).startsWith("blob:")) {
            candidates.push(preferredSrc);
        }
        candidates.push(...driveImageCandidates(idOrLink, size));
        if (preferredSrc && String(preferredSrc).startsWith("blob:")) {
            candidates.unshift(preferredSrc);
        }

        const unique = [];
        candidates.forEach((url) => {
            if (url && !unique.includes(url)) unique.push(url);
        });

        let index = 0;
        img.referrerPolicy = "no-referrer";
        img.decoding = "async";
        img.src = unique[0] || "";
        img.onerror = () => {
            index += 1;
            if (index < unique.length) {
                img.src = unique[index];
            }
        };
    }

    function drivePreviewUrl(idOrLink) {
        const id = extractDriveId(idOrLink);
        if (!id) return "";
        return `https://drive.google.com/file/d/${id}/preview`;
    }

    function driveDownloadUrl(idOrLink) {
        const id = extractDriveId(idOrLink);
        if (!id) return "";
        return `https://drive.google.com/uc?export=download&id=${id}`;
    }

    function normalizePhotoItem(item, index) {
        const title = item.title || item.name || `Photo ${index + 1}`;
        const driveRef = item.driveId || item.drive || item.url || item.src || "";
        const driveId = extractDriveId(driveRef);
        const isLocal = Boolean(item.url && !/^https?:/i.test(item.url) && !driveId);
        const src = isLocal
            ? item.url
            : item.thumb || driveImageUrl(driveRef) || item.url || "";
        const download = item.download || (driveId ? driveDownloadUrl(driveRef) : src);

        return {
            id: item.id || driveId || src || `photo-${index}`,
            driveId: driveId || "",
            src,
            name: title,
            download,
            source: driveId ? "drive" : "local",
        };
    }

    function normalizeVideoItem(item, index) {
        const title = item.title || item.name || `Video ${index + 1}`;
        const driveRef = item.driveId || item.drive || item.url || item.src || "";
        const driveId = extractDriveId(driveRef);
        const isLocal = Boolean(item.url && !/^https?:/i.test(item.url) && !driveId);
        const embed = item.embed || (driveId ? drivePreviewUrl(driveRef) : "");
        const src = isLocal ? item.url : embed || item.url || "";
        const download = item.download || (driveId ? driveDownloadUrl(driveRef) : src);

        return {
            id: item.id || driveId || src || `video-${index}`,
            driveId: driveId || "",
            src,
            name: title,
            download,
            embed: Boolean(driveId || item.embed),
            source: driveId ? "drive" : "local",
        };
    }

    async function loadGalleryConfig() {
        const response = await fetch("gallery.json", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load gallery.json");
        return response.json();
    }

    async function loadDriveAlbumList(config) {
        const endpoint = config && config.driveUpload && config.driveUpload.endpoint;
        if (!endpoint || String(endpoint).includes("PASTE_")) {
            return null;
        }

        if (String(endpoint).includes("/macros/library/")) {
            throw new Error(
                "gallery.json has a Library URL. Deploy as Web app and use the URL ending in /exec."
            );
        }

        const listUrl = endpoint.includes("?")
            ? `${endpoint}&action=list`
            : `${endpoint}?action=list`;

        const response = await fetch(listUrl, { cache: "no-store" });
        if (!response.ok) {
            throw new Error("Could not list Drive album");
        }

        const text = await response.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (_) {
            throw new Error(
                "Drive bridge did not return JSON. Use a Web app /exec URL with access set to Anyone."
            );
        }
        if (!data || data.ok === false) {
            throw new Error((data && data.message) || "Drive list failed");
        }
        if (!Array.isArray(data.photos) && !Array.isArray(data.videos)) {
            throw new Error(
                "Drive bridge is live but did not return photos/videos. Redeploy Code.gs as a New version."
            );
        }

        return {
            photos: Array.isArray(data.photos) ? data.photos : [],
            videos: Array.isArray(data.videos) ? data.videos : [],
            guests: Array.isArray(data.guests) ? data.guests : [],
        };
    }

    function inferMimeAndName(file, preferredName) {
        const originalName = String(preferredName || (file && file.name) || "guest-upload").trim();
        let name = originalName || "guest-upload";
        let mime = String((file && file.type) || "").trim().toLowerCase();

        const extMatch = name.match(/\.([a-z0-9]+)$/i);
        let ext = extMatch ? extMatch[1].toLowerCase() : "";

        const mimeFromExt = {
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

        const extFromMime = {
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

        if ((!mime || mime === "application/octet-stream") && ext && mimeFromExt[ext]) {
            mime = mimeFromExt[ext];
        }

        if ((!ext || ext === "txt" || ext === "bin") && mime && extFromMime[mime]) {
            ext = extFromMime[mime];
            name = name.replace(/\.[^.]+$/, "") + "." + ext;
        }

        if (!mime && !ext) {
            mime = "image/jpeg";
            name = name.replace(/\.[^.]+$/, "") + ".jpg";
        }

        if (!mime) {
            mime = mimeFromExt[ext] || "application/octet-stream";
        }

        if (!/\.[a-z0-9]+$/i.test(name) && extFromMime[mime]) {
            name += "." + extFromMime[mime];
        }

        return { fileName: name, mimeType: mime };
    }

    async function loadDriveGuestList(config) {
        const endpoint = config && config.driveUpload && config.driveUpload.endpoint;
        if (!endpoint || String(endpoint).includes("PASTE_")) {
            return [];
        }

        if (String(endpoint).includes("/macros/library/")) {
            throw new Error(
                "gallery.json has a Library URL. Deploy as Web app and use the URL ending in /exec."
            );
        }

        // Prefer listGuests; fall back to action=list → guests[]
        const urls = [
            endpoint.includes("?") ? `${endpoint}&action=listGuests` : `${endpoint}?action=listGuests`,
            endpoint.includes("?") ? `${endpoint}&action=list` : `${endpoint}?action=list`,
        ];

        let lastError = null;
        for (const listUrl of urls) {
            try {
                const response = await fetch(listUrl, { cache: "no-store" });
                if (!response.ok) {
                    lastError = new Error("Could not list guest uploads");
                    continue;
                }

                const text = await response.text();
                let data = null;
                try {
                    data = JSON.parse(text);
                } catch (_) {
                    lastError = new Error(
                        "Drive bridge did not return JSON. Use a Web app /exec URL with access set to Anyone."
                    );
                    continue;
                }

                if (!data || data.ok === false) {
                    lastError = new Error((data && data.message) || "Guest list failed");
                    continue;
                }

                if (Array.isArray(data.guests)) {
                    return data.guests;
                }

                lastError = new Error(
                    "STALE_DEPLOY: Apps Script is old. In script.google.com → Deploy → Manage deployments → pencil → Version: New version → Deploy. Then hard-refresh. Ping must show version 2026-08-17-guests-v2."
                );
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError || new Error("Could not list guest uploads");
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || "");
                const base64 = result.includes(",") ? result.split(",")[1] : result;
                resolve(base64);
            };
            reader.onerror = () => reject(reader.error || new Error("Could not read file"));
            reader.readAsDataURL(blob);
        });
    }

    async function postToDrive(endpoint, payload) {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
        });
        const text = await response.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (_) {
            throw new Error("Drive endpoint returned an unexpected response. Redeploy Apps Script.");
        }
        if (!data || !data.ok) {
            throw new Error((data && data.message) || "Drive request failed");
        }
        return data;
    }

    async function uploadGuestFile(config, file, meta) {
        const driveUpload = (config && config.driveUpload) || {};
        if (!driveUpload.enabled) {
            throw new Error("Drive upload is disabled in gallery.json");
        }
        if (!driveUpload.endpoint || String(driveUpload.endpoint).includes("PASTE_")) {
            throw new Error("Add your Apps Script URL to gallery.json → driveUpload.endpoint");
        }

        const inferred = inferMimeAndName(file, (meta && meta.fileName) || (file && file.name));
        if (!inferred.mimeType.startsWith("image/") && !inferred.mimeType.startsWith("video/")) {
            throw new Error("Only JPG/PNG/WEBP photos or MP4/WEBM videos can be uploaded.");
        }

        const base64 = await blobToBase64(file);
        return postToDrive(driveUpload.endpoint, {
            fileName: inferred.fileName,
            mimeType: inferred.mimeType,
            base64,
            guestName: (meta && meta.guestName) || "Guest",
            guestMobile: (meta && meta.guestMobile) || "",
            recordId: (meta && meta.recordId) || "",
            status: (meta && meta.status) || "pending",
            folderName: driveUpload.folderName || "Guest Uploads",
            folderId: driveUpload.folderId || "",
        });
    }

    async function setGuestStatus(config, fileId, status, adminToken) {
        const driveUpload = (config && config.driveUpload) || {};
        if (!driveUpload.endpoint || String(driveUpload.endpoint).includes("PASTE_")) {
            throw new Error("Drive endpoint is not configured");
        }
        return postToDrive(driveUpload.endpoint, {
            action: "setStatus",
            fileId,
            status,
            token: adminToken || "",
        });
    }

    async function adminLogin(config, password) {
        const driveUpload = (config && config.driveUpload) || {};
        if (!driveUpload.endpoint || String(driveUpload.endpoint).includes("PASTE_")) {
            throw new Error("Drive endpoint is not configured");
        }
        try {
            return await postToDrive(driveUpload.endpoint, {
                action: "adminLogin",
                password: password || "",
            });
        } catch (error) {
            const message = String((error && error.message) || error || "");
            if (/missing file data/i.test(message)) {
                throw new Error(
                    "Apps Script is outdated. Paste the latest Code.gs, then Deploy → Manage deployments → New version → Deploy."
                );
            }
            throw error;
        }
    }

    const DOWNLOAD_STATS_KEY = "namkaran_download_stats";

    function readLocalDownloadStats() {
        try {
            const parsed = JSON.parse(localStorage.getItem(DOWNLOAD_STATS_KEY) || "{}");
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function listLocalDownloadStats() {
        return Object.keys(readLocalDownloadStats())
            .map((key) => readLocalDownloadStats()[key])
            .filter(Boolean)
            .sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
    }

    function bumpLocalDownload(item) {
        const id = String((item && (item.driveId || item.id)) || "").trim();
        if (!id) return null;
        const stats = readLocalDownloadStats();
        const prev = stats[id] || {};
        const next = {
            driveId: id,
            title: (item && (item.title || item.name)) || prev.title || id,
            kind: (item && item.kind) || prev.kind || "image",
            count: Number(prev.count || 0) + 1,
            lastDownloadedAt: Date.now(),
            src: (item && item.src) || prev.src || "",
        };
        stats[id] = next;
        localStorage.setItem(DOWNLOAD_STATS_KEY, JSON.stringify(stats));
        return next;
    }

    function mergeDownloadStats(remoteItems, localItems) {
        const byId = new Map();
        []
            .concat(remoteItems || [])
            .concat(localItems || [])
            .forEach((item) => {
                if (!item) return;
                const id = String(item.driveId || item.id || "").trim();
                if (!id) return;
                const prev = byId.get(id) || {};
                byId.set(id, {
                    driveId: id,
                    title: item.title || item.name || prev.title || id,
                    kind: item.kind || prev.kind || "image",
                    count: Math.max(Number(item.count || 0), Number(prev.count || 0)),
                    lastDownloadedAt: Math.max(
                        Number(item.lastDownloadedAt || 0),
                        Number(prev.lastDownloadedAt || 0)
                    ),
                    src: item.src || prev.src || "",
                });
            });
        return Array.from(byId.values()).sort(
            (a, b) => Number(b.count || 0) - Number(a.count || 0)
        );
    }

    async function recordDownload(config, item, options) {
        if (!(options && options.skipLocal)) {
            bumpLocalDownload(item);
        }
        const driveUpload = (config && config.driveUpload) || {};
        if (!driveUpload.endpoint || String(driveUpload.endpoint).includes("PASTE_")) {
            return { ok: true, localOnly: true };
        }
        try {
            return await postToDrive(driveUpload.endpoint, {
                action: "recordDownload",
                driveId: (item && (item.driveId || item.id)) || "",
                title: (item && (item.title || item.name)) || "",
                kind: (item && item.kind) || "image",
            });
        } catch (error) {
            console.warn("Remote download count not saved", error);
            return { ok: true, localOnly: true };
        }
    }

    async function loadDownloadStats(config) {
        let remote = [];
        const endpoint = config && config.driveUpload && config.driveUpload.endpoint;
        if (endpoint && !String(endpoint).includes("PASTE_")) {
            try {
                const listUrl = endpoint.includes("?")
                    ? `${endpoint}&action=downloadStats`
                    : `${endpoint}?action=downloadStats`;
                const response = await fetch(listUrl, { cache: "no-store" });
                const text = await response.text();
                const data = JSON.parse(text);
                if (data && data.ok !== false && Array.isArray(data.downloads)) {
                    remote = data.downloads;
                }
            } catch (error) {
                console.warn("Remote download stats unavailable", error);
            }
        }
        return mergeDownloadStats(remote, listLocalDownloadStats());
    }

    function base64ToBlob(base64, mimeType) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType || "image/jpeg" });
    }

    async function fetchDriveImageBlob(config, driveId) {
        const endpoint = config && config.driveUpload && config.driveUpload.endpoint;
        const id = String(driveId || "").trim();
        if (!endpoint || String(endpoint).includes("PASTE_") || !id) {
            throw new Error("Missing download source");
        }
        const listUrl = endpoint.includes("?")
            ? `${endpoint}&action=downloadImage&id=${encodeURIComponent(id)}`
            : `${endpoint}?action=downloadImage&id=${encodeURIComponent(id)}`;
        const response = await fetch(listUrl, { cache: "no-store" });
        const text = await response.text();
        const data = JSON.parse(text);
        if (!data || !data.ok || !data.base64) {
            throw new Error((data && data.message) || "Could not fetch photo");
        }
        return base64ToBlob(data.base64, data.mimeType);
    }

    global.NamkaranDrive = {
        extractDriveId,
        driveImageUrl,
        driveImageCandidates,
        bindDriveImage,
        drivePreviewUrl,
        driveDownloadUrl,
        normalizePhotoItem,
        normalizeVideoItem,
        loadGalleryConfig,
        loadDriveAlbumList,
        loadDriveGuestList,
        blobToBase64,
        postToDrive,
        uploadGuestFile,
        setGuestStatus,
        adminLogin,
        recordDownload,
        loadDownloadStats,
        bumpLocalDownload,
        listLocalDownloadStats,
        mergeDownloadStats,
        fetchDriveImageBlob,
    };
})(window);
