(() => {
    "use strict";

    const AUTH_KEY = "namkaran_authenticated";
    const MUSIC_AUTOPLAY_KEY = "namkaran_autoplay_music";
    const DB_NAME = "namkaran_guest_uploads";
    const DB_STORE = "uploads";
    const DB_VERSION = 1;
    const PHOTO_DIR = "assets/photos/";
    const VIDEO_DIR = "assets/videos/";
    const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
    const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)$/i;
    const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
    const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
    const STATUS_PENDING = "pending";
    const STATUS_APPROVED = "approved";
    const STATUS_REJECTED = "rejected";

    const photosCard = document.getElementById("photosCard");
    const videosCard = document.getElementById("videosCard");
    const guestCard = document.getElementById("guestCard");
    const uploadCard = document.getElementById("uploadCard");
    const photosSection = document.getElementById("photosSection");
    const videosSection = document.getElementById("videosSection");
    const guestSection = document.getElementById("guestSection");
    const uploadSection = document.getElementById("uploadSection");
    const photoGrid = document.getElementById("photoGrid");
    const videoGrid = document.getElementById("videoGrid");
    const guestPhotoGrid = document.getElementById("guestPhotoGrid");
    const guestVideoGrid = document.getElementById("guestVideoGrid");
    const photosEmpty = document.getElementById("photosEmpty");
    const videosEmpty = document.getElementById("videosEmpty");
    const guestPhotosEmpty = document.getElementById("guestPhotosEmpty");
    const guestVideosEmpty = document.getElementById("guestVideosEmpty");
    const logoutButton = document.getElementById("logoutButton");
    const galleryLoader = document.getElementById("galleryLoader");
    const galleryLoaderText = document.getElementById("galleryLoaderText");

    const uploadForm = document.getElementById("uploadForm");
    const guestNameInput = document.getElementById("guestName");
    // Mobile / OTP fields (enable later)
    // const guestMobileInput = document.getElementById("guestMobile");
    // const guestOtpInput = document.getElementById("guestOtp");
    const guestFilesInput = document.getElementById("guestFiles");
    const uploadPreview = document.getElementById("uploadPreview");
    const uploadStatus = document.getElementById("uploadStatus");
    const uploadSubmit = document.getElementById("uploadSubmit");
    const uploadThanks = document.getElementById("uploadThanks");
    const viewGuestUploadsBtn = document.getElementById("viewGuestUploadsBtn");
    // const sendOtpBtn = document.getElementById("sendOtpBtn");
    // const verifyOtpBtn = document.getElementById("verifyOtpBtn");
    // const otpField = document.getElementById("otpField");
    // const otpVerified = document.getElementById("otpVerified");
    const uploadActions = document.getElementById("uploadActions");

    const lightbox = document.getElementById("lightbox");
    const lbImage = document.getElementById("lbImage");
    const lbCaption = document.getElementById("lbCaption");
    const lbPrev = document.getElementById("lbPrev");
    const lbNext = document.getElementById("lbNext");
    const lbClose = document.getElementById("lbClose");
    const lbDownload = document.getElementById("lbDownload");
    const lbFullscreen = document.getElementById("lbFullscreen");
    const lbSlideshow = document.getElementById("lbSlideshow");
    const lbSlideshowProgress = document.getElementById("lbSlideshowProgress");
    const lbSlideshowProgressBar = document.getElementById("lbSlideshowProgressBar");
    const photosSlideshowBtn = document.getElementById("photosSlideshowBtn");
    const guestSlideshowBtn = document.getElementById("guestSlideshowBtn");

    const bgMusic = document.getElementById("bgMusic");
    const musicToggle = document.getElementById("musicToggle");
    const musicPanel = document.getElementById("musicPanel");
    const musicPlay = document.getElementById("musicPlay");
    const musicPause = document.getElementById("musicPause");
    const musicMute = document.getElementById("musicMute");
    const musicVolume = document.getElementById("musicVolume");
    const musicStatus = document.getElementById("musicStatus");

    /** @type {{ id: string, src: string, name: string }[]} */
    let photos = [];
    /** @type {{ id: string, src: string, name: string }[]} */
    let videos = [];
    /** @type {{ id: string, src: string, name: string, guestName: string, guestMobile?: string, blob?: Blob }[]} */
    let guestPhotos = [];
    /** @type {{ id: string, src: string, name: string, guestName: string, guestMobile?: string, blob?: Blob }[]} */
    let guestVideos = [];
    /** @type {{ id: string, type: string, name: string, guestName: string, guestMobile: string, blob: Blob, createdAt: number, objectUrl?: string }[]} */
    let guestRecords = [];
    /** @type {File[]} */
    let pendingFiles = [];
    /** @type {{ id: string, src: string, name: string, guestName?: string, guestMobile?: string }[]} */
    let lightboxItems = [];
    // Mobile OTP temporarily disabled — re-enable with mobile UI later
    // let mobileVerified = false;
    // let verifiedMobile = "";
    const mobileVerified = true; // allow uploads without OTP for now
    const verifiedMobile = "";

    let currentIndex = 0;
    let photosLoaded = false;
    let videosLoaded = false;
    let dbPromise = null;
    let slideshowTimer = null;
    let slideshowActive = false;
    let slideshowAnimating = false;
    const SLIDESHOW_MS = 4500;
    const SLIDE_TRANSITION_MS = 420;

    /* ---------- Auth ---------- */

    function requireAuth() {
        if (localStorage.getItem(AUTH_KEY) !== "true") {
            window.location.replace("index.html");
            return false;
        }
        return true;
    }

    function logout() {
        localStorage.removeItem(AUTH_KEY);
        window.location.href = "index.html";
    }

    /* ---------- IndexedDB ---------- */

    function openDb() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE, { keyPath: "id" });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        return dbPromise;
    }

    async function dbGetAll() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readonly");
            const store = tx.objectStore(DB_STORE);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async function dbPut(record) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function dbDelete(id) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    function createId() {
        return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    function isImageFile(file) {
        if (ALLOWED_IMAGE_TYPES.includes(file.type)) return true;
        return IMAGE_EXT.test(file.name || "");
    }

    function isVideoFile(file) {
        if (ALLOWED_VIDEO_TYPES.includes(file.type)) return true;
        return VIDEO_EXT.test(file.name || "");
    }

    function fileTooLarge(file) {
        if (isImageFile(file)) return file.size > MAX_IMAGE_BYTES;
        if (isVideoFile(file)) return file.size > MAX_VIDEO_BYTES;
        return true;
    }

    function fileLimitMessage(file) {
        if (isImageFile(file)) {
            return `${file.name} is larger than 15MB (images max).`;
        }
        if (isVideoFile(file)) {
            return `${file.name} is larger than 80MB (videos max).`;
        }
        return `${file.name} is not an allowed file type.`;
    }

    function mediaLabel(item) {
        return item.name
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ");
    }

    function uploaderLabel(item) {
        return (item.guestName || "Guest").trim() || "Guest";
    }

    function normalizeMobile(value) {
        return String(value || "").replace(/\D/g, "").slice(-10);
    }

    function isValidMobile(value) {
        return /^\d{10}$/.test(normalizeMobile(value));
    }

    function formatMobile(value) {
        return normalizeMobile(value);
    }

    function toE164India(value) {
        return `+91${normalizeMobile(value)}`;
    }

    // Mobile OTP helpers (enable later with mobile UI)
    /*
    function setMobileVerified(isVerified, mobile) {
        mobileVerified = isVerified;
        verifiedMobile = isVerified ? formatMobile(mobile) : "";
        otpVerified.hidden = !isVerified;
        uploadActions.hidden = !isVerified;

        guestMobileInput.readOnly = isVerified;
        sendOtpBtn.disabled = isVerified;
        verifyOtpBtn.disabled = isVerified;
        guestOtpInput.readOnly = isVerified;

        if (!isVerified) {
            pendingFiles = [];
            if (guestFilesInput) guestFilesInput.value = "";
            renderPendingPreview();
        }

        updateSubmitState();
    }

    function resetOtpUi() {
        if (window.NamkaranOtp) window.NamkaranOtp.reset();
        setMobileVerified(false, "");
        otpField.hidden = true;
        guestOtpInput.value = "";
        sendOtpBtn.textContent = "Send OTP";
    }
    */

    function updateSubmitState() {
        uploadSubmit.disabled = pendingFiles.length === 0;
    }

    /* ---------- Directory listing ---------- */

    async function listMedia(directory, extensionRegex) {
        try {
            const response = await fetch(directory);
            if (!response.ok) return [];

            const contentType = response.headers.get("content-type") || "";
            const text = await response.text();

            if (contentType.includes("application/json") || directory.endsWith(".json")) {
                return normalizeManifest(JSON.parse(text), directory).map((src) => ({
                    id: src,
                    src,
                    name: src.split("/").pop(),
                }));
            }

            const found = new Set();
            const hrefRegex = /href=["']([^"'#?]+?)["']/gi;
            let match;

            while ((match = hrefRegex.exec(text)) !== null) {
                const raw = decodeURIComponent(match[1]);
                const name = raw.split("/").pop();
                if (!name || name.startsWith(".") || name === "../") continue;
                if (extensionRegex.test(name)) {
                    found.add(directory + name);
                }
            }

            return [...found]
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                .map((src) => ({
                    id: src,
                    src,
                    name: src.split("/").pop(),
                }));
        } catch (error) {
            console.warn("Could not list media from", directory, error);
            return [];
        }
    }

    function normalizeManifest(data, directory) {
        const items = Array.isArray(data) ? data : data.items || data.files || [];
        return items
            .map((item) => {
                if (typeof item === "string") {
                    return item.includes("/") ? item : directory + item;
                }
                const src = item.src || item.url || item.file;
                if (!src) return null;
                return src.includes("/") ? src : directory + src;
            })
            .filter(Boolean);
    }

    function rebuildGuestMediaLists() {
        guestPhotos = [];
        guestVideos = [];

        guestRecords.forEach((record) => {
            // Only approved guest media appears in the public Guest Uploads gallery
            const status = record.status || STATUS_PENDING;
            if (status !== STATUS_APPROVED) return;

            let src = "";
            // Prefer local blob when present (same-device uploads display reliably)
            if (record.blob) {
                if (!record.objectUrl) {
                    record.objectUrl = URL.createObjectURL(record.blob);
                }
                src = record.objectUrl;
            } else if (record.src && String(record.src).startsWith("blob:")) {
                src = record.src;
            } else if (record.driveId && window.NamkaranDrive) {
                src =
                    record.type === "video"
                        ? window.NamkaranDrive.drivePreviewUrl(record.driveId)
                        : window.NamkaranDrive.driveImageUrl(record.driveId);
            } else if (record.src) {
                src = record.src;
            }
            if (!src) return;

            const item = {
                id: record.id || record.driveId,
                src,
                name: record.name,
                guestName: record.guestName || "Guest",
                guestMobile: record.guestMobile || "",
                blob: record.blob,
                driveId: record.driveId || "",
                embed: record.type === "video" && Boolean(record.driveId) && !record.blob,
            };

            if (record.type === "image") {
                guestPhotos.push(item);
            } else {
                guestVideos.push(item);
            }
        });
    }

    async function loadGuestUploads() {
        const localRecords = [];
        try {
            const fromDb = await dbGetAll();
            localRecords.push(...fromDb);
        } catch (error) {
            console.warn("Could not load local guest uploads", error);
        }

        let driveGuests = [];
        try {
            if (window.NamkaranDrive) {
                const config = await window.NamkaranDrive.loadGalleryConfig();
                driveGuests = await window.NamkaranDrive.loadDriveGuestList(config);
            }
        } catch (error) {
            console.warn("Could not load Drive guest uploads", error);
        }

        const byId = new Map();

        localRecords.forEach((record) => {
            const key = record.driveId || record.id;
            if (!key) return;
            byId.set(key, record);
        });

        driveGuests.forEach((guest) => {
            const driveId = guest.driveId;
            if (!driveId) return;
            const existing = byId.get(driveId);
            byId.set(driveId, {
                id: driveId,
                driveId,
                type: guest.type === "video" ? "video" : "image",
                name: guest.name || guest.title || "Guest upload",
                guestName: guest.guestName || (existing && existing.guestName) || "Guest",
                guestMobile: (existing && existing.guestMobile) || "",
                status: guest.status || STATUS_PENDING,
                createdAt: guest.createdAt || (existing && existing.createdAt) || 0,
                blob: existing && existing.blob,
                objectUrl: existing && existing.objectUrl,
                src:
                    guest.type === "video"
                        ? window.NamkaranDrive.drivePreviewUrl(driveId)
                        : window.NamkaranDrive.driveImageUrl(driveId),
            });
        });

        guestRecords = Array.from(byId.values());
        guestRecords.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        rebuildGuestMediaLists();
    }

    /* ---------- Photos / Videos (official: gallery.json + Drive links) ---------- */

    let galleryConfigLoaded = false;

    async function loadOfficialGallery() {
        if (galleryConfigLoaded) return;
        galleryConfigLoaded = true;

        try {
            if (!window.NamkaranDrive) {
                throw new Error("drive.js not loaded");
            }

            const config = await window.NamkaranDrive.loadGalleryConfig();
            let photoItems = Array.isArray(config.photos) ? [...config.photos] : [];
            let videoItems = Array.isArray(config.videos) ? [...config.videos] : [];

            // Prefer live list from Apps Script (photos/ + videos/ folders in Drive)
            try {
                const live = await window.NamkaranDrive.loadDriveAlbumList(config);
                if (live) {
                    if (live.photos.length) photoItems = live.photos;
                    if (live.videos.length) videoItems = live.videos;
                }
            } catch (liveError) {
                console.warn("Live Drive list unavailable; using gallery.json entries", liveError);
            }

            // Legacy albums support
            if (!photoItems.length && !videoItems.length && Array.isArray(config.albums)) {
                config.albums.forEach((album) => {
                    (album.items || []).forEach((item) => {
                        if ((item.type || "").toLowerCase() === "video") videoItems.push(item);
                        else photoItems.push(item);
                    });
                });
            }

            photos = photoItems
                .map((item, index) => window.NamkaranDrive.normalizePhotoItem(item, index))
                .filter((item) => item.src);

            videos = videoItems
                .map((item, index) => window.NamkaranDrive.normalizeVideoItem(item, index))
                .filter((item) => item.src);
        } catch (error) {
            console.warn("gallery.json / Drive load failed, falling back to local folders", error);
        }
    }

    async function ensurePhotos() {
        if (!photosLoaded) {
            await loadOfficialGallery();
            if (!photos.length) {
                photos = await listMedia(PHOTO_DIR, IMAGE_EXT);
            }
            photosLoaded = true;
        }
        renderPhotos();
    }

    async function ensureVideos() {
        if (!videosLoaded) {
            await loadOfficialGallery();
            if (!videos.length) {
                videos = await listMedia(VIDEO_DIR, VIDEO_EXT);
            }
            videosLoaded = true;
        }
        renderVideos();
    }

    function renderPhotos() {
        photoGrid.innerHTML = "";

        if (!photos.length) {
            photosEmpty.hidden = false;
            return;
        }

        photosEmpty.hidden = true;

        photos.forEach((item, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "masonry-item";
            button.style.animationDelay = `${Math.min(index * 0.05, 0.6)}s`;
            button.setAttribute("aria-label", `Open photo ${mediaLabel(item)}`);

            const img = document.createElement("img");
            img.alt = mediaLabel(item);
            img.loading = "lazy";
            img.decoding = "async";
            if (item.source === "drive" && item.id && window.NamkaranDrive && window.NamkaranDrive.bindDriveImage) {
                window.NamkaranDrive.bindDriveImage(img, item.id, item.src);
            } else {
                img.referrerPolicy = "no-referrer";
                img.src = item.src;
            }

            button.appendChild(img);
            button.addEventListener("click", () => openLightbox(photos, index));
            photoGrid.appendChild(button);
        });
    }

    function renderVideos() {
        videoGrid.innerHTML = "";

        if (!videos.length) {
            videosEmpty.hidden = false;
            return;
        }

        videosEmpty.hidden = true;

        videos.forEach((item, index) => {
            const card = document.createElement("article");
            card.className = "video-card";
            card.style.animationDelay = `${Math.min(index * 0.08, 0.5)}s`;

            if (item.embed) {
                const frame = document.createElement("iframe");
                frame.src = item.src;
                frame.title = mediaLabel(item);
                frame.allow =
                    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                frame.allowFullscreen = true;
                frame.loading = "lazy";
                frame.className = "drive-video-frame";
                card.appendChild(frame);
            } else {
                const video = document.createElement("video");
                video.src = item.src;
                video.controls = true;
                video.preload = "metadata";
                video.playsInline = true;
                card.appendChild(video);
            }

            const meta = document.createElement("div");
            meta.className = "video-meta";

            const title = document.createElement("p");
            title.className = "video-title";
            title.textContent = mediaLabel(item);

            const download = document.createElement("a");
            download.className = "video-download";
            download.href = item.download || item.src;
            download.target = "_blank";
            download.rel = "noopener noreferrer";
            if (!item.embed) download.download = item.name;
            download.textContent = "Download";

            meta.append(title, download);
            card.append(meta);
            videoGrid.appendChild(card);
        });
    }

    function renderGuestGallery() {
        guestPhotoGrid.innerHTML = "";
        guestVideoGrid.innerHTML = "";

        guestPhotosEmpty.hidden = guestPhotos.length > 0;
        guestVideosEmpty.hidden = guestVideos.length > 0;

        guestPhotos.forEach((item, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "masonry-item";
            button.style.animationDelay = `${Math.min(index * 0.05, 0.6)}s`;
            button.setAttribute(
                "aria-label",
                `Open photo by ${uploaderLabel(item)}`
            );

            const tag = document.createElement("span");
            tag.className = "uploader-tag";
            tag.textContent = uploaderLabel(item);

            const img = document.createElement("img");
            img.alt = `${mediaLabel(item)} by ${uploaderLabel(item)}`;
            img.loading = "lazy";
            img.decoding = "async";
            if (item.driveId && window.NamkaranDrive && window.NamkaranDrive.bindDriveImage) {
                window.NamkaranDrive.bindDriveImage(img, item.driveId, item.src);
            } else {
                img.referrerPolicy = "no-referrer";
                img.src = item.src;
            }

            button.append(img, tag);
            button.addEventListener("click", () => openLightbox(guestPhotos, index));
            guestPhotoGrid.appendChild(button);
        });

        guestVideos.forEach((item, index) => {
            const card = document.createElement("article");
            card.className = "video-card";
            card.style.animationDelay = `${Math.min(index * 0.08, 0.5)}s`;

            const tag = document.createElement("span");
            tag.className = "uploader-tag";
            tag.textContent = uploaderLabel(item);

            if (item.embed) {
                const frame = document.createElement("iframe");
                frame.src = item.src;
                frame.title = mediaLabel(item);
                frame.allow =
                    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                frame.allowFullscreen = true;
                frame.loading = "lazy";
                frame.className = "drive-video-frame";
                card.append(tag, frame);
            } else {
                const video = document.createElement("video");
                video.src = item.src;
                video.controls = true;
                video.preload = "metadata";
                video.playsInline = true;
                card.append(tag, video);
            }

            const meta = document.createElement("div");
            meta.className = "video-meta";

            const title = document.createElement("p");
            title.className = "video-title";
            title.textContent = mediaLabel(item);

            const download = document.createElement("a");
            download.className = "video-download";
            download.href =
                item.driveId && window.NamkaranDrive
                    ? window.NamkaranDrive.driveDownloadUrl(item.driveId)
                    : item.src;
            download.target = "_blank";
            download.rel = "noopener noreferrer";
            if (!item.embed) download.download = item.name;
            download.textContent = "Download";

            meta.append(title, download);
            card.append(meta);
            guestVideoGrid.appendChild(card);
        });
    }

    /* ---------- View switching ---------- */

    function setGalleryLoading(isLoading, message, activeCard) {
        if (!galleryLoader) return;
        galleryLoader.hidden = !isLoading;
        if (galleryLoaderText) {
            galleryLoaderText.textContent = message || "Loading moments…";
        }
        document.body.style.overflow = isLoading ? "hidden" : "";
        [photosCard, videosCard, guestCard, uploadCard].forEach((card) => {
            if (!card) return;
            card.classList.toggle("is-loading", Boolean(isLoading && activeCard && card === activeCard));
            card.disabled = Boolean(isLoading);
        });
    }

    async function showView(view) {
        const isPhotos = view === "photos";
        const isVideos = view === "videos";
        const isGuest = view === "guest";
        const isUpload = view === "upload";
        const needsLoad = isPhotos || isVideos || isGuest;

        photosCard.setAttribute("aria-pressed", String(isPhotos));
        videosCard.setAttribute("aria-pressed", String(isVideos));
        guestCard.setAttribute("aria-pressed", String(isGuest));
        uploadCard.setAttribute("aria-pressed", String(isUpload));

        photosSection.hidden = !isPhotos;
        videosSection.hidden = !isVideos;
        guestSection.hidden = !isGuest;
        uploadSection.hidden = !isUpload;

        const activeCard = isPhotos
            ? photosCard
            : isVideos
              ? videosCard
              : isGuest
                ? guestCard
                : uploadCard;

        const loaderMessage = isPhotos
            ? "Loading photos…"
            : isVideos
              ? "Loading videos…"
              : isGuest
                ? "Loading guest uploads…"
                : "Loading…";

        try {
            if (needsLoad) {
                setGalleryLoading(true, loaderMessage, activeCard);
            }

            const loadStarted = Date.now();

            if (isPhotos) await ensurePhotos();
            if (isVideos) await ensureVideos();
            if (isGuest) {
                await loadGuestUploads();
                renderGuestGallery();
            }
            if (isUpload) {
                resetUploadFormView();
                setUploadStatus("");
                updateSubmitState();
            }

            if (needsLoad) {
                const elapsed = Date.now() - loadStarted;
                if (elapsed < 400) {
                    await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
                }
            }
        } finally {
            if (needsLoad) {
                setGalleryLoading(false);
            }
        }

        const target = isPhotos
            ? photosSection
            : isVideos
              ? videosSection
              : isGuest
                ? guestSection
                : uploadSection;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    /* ---------- Guest upload UI ---------- */

    function setUploadStatus(message, isError) {
        if (!message) {
            uploadStatus.hidden = true;
            uploadStatus.textContent = "";
            uploadStatus.classList.remove("is-error");
            return;
        }
        uploadStatus.hidden = false;
        uploadStatus.textContent = message;
        uploadStatus.classList.toggle("is-error", Boolean(isError));
    }

    function showUploadThanks(name) {
        uploadForm.hidden = true;
        uploadThanks.hidden = false;
        const thanksCopy = uploadThanks.querySelector("p:not(.upload-thanks-eyebrow)");
        if (thanksCopy) {
            thanksCopy.innerHTML =
                `Thank you${name ? `, <strong>${name}</strong>` : ""} for sharing your moments from Ridhaan’s Namkaran. ` +
                `Your upload is <strong>under review</strong> and will appear in <strong>Guest Uploads</strong> after approval.`;
        }
    }

    function resetUploadFormView() {
        uploadForm.hidden = false;
        uploadThanks.hidden = true;
    }

    function renderPendingPreview() {
        uploadPreview.innerHTML = "";
        updateSubmitState();

        pendingFiles.forEach((file, index) => {
            const li = document.createElement("li");
            li.className = "upload-preview-item";

            const label = document.createElement("span");
            const kind = isImageFile(file) ? "Photo" : isVideoFile(file) ? "Video" : "File";
            label.textContent = `${kind}: ${file.name}`;

            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Remove";
            remove.addEventListener("click", () => {
                pendingFiles.splice(index, 1);
                renderPendingPreview();
            });

            li.append(label, remove);
            uploadPreview.appendChild(li);
        });
    }

    function addPendingFiles(fileList) {
        // OTP check disabled for now
        // if (!mobileVerified) {
        //     setUploadStatus("Please verify your mobile number with OTP before uploading.", true);
        //     return;
        // }

        const files = [...fileList];
        const accepted = [];

        files.forEach((file) => {
            if (!isImageFile(file) && !isVideoFile(file)) {
                setUploadStatus(
                    `Skipped ${file.name}. Allowed: JPG, PNG, WEBP photos and MP4/WEBM videos.`,
                    true
                );
                return;
            }
            if (fileTooLarge(file)) {
                setUploadStatus(fileLimitMessage(file), true);
                return;
            }
            accepted.push(file);
        });

        if (accepted.length) {
            pendingFiles = pendingFiles.concat(accepted);
            setUploadStatus(`${accepted.length} file(s) ready to add.`);
            renderPendingPreview();
        }
    }

    // Mobile OTP handlers (enable later)
    /*
    async function handleSendOtp() {
        const guestName = (guestNameInput.value || "").trim();
        if (!guestName) {
            setUploadStatus("Please enter your name first.", true);
            guestNameInput.focus();
            return;
        }

        const mobile = formatMobile(guestMobileInput.value);
        if (!isValidMobile(mobile)) {
            setUploadStatus("Enter a valid 10-digit Indian mobile number.", true);
            guestMobileInput.focus();
            return;
        }

        setMobileVerified(false, "");
        sendOtpBtn.disabled = true;
        sendOtpBtn.textContent = "Sending…";
        setUploadStatus("Sending OTP…");

        if (!window.NamkaranOtp) {
            setUploadStatus("OTP service failed to load. Please refresh the page.", true);
            sendOtpBtn.disabled = false;
            sendOtpBtn.textContent = "Send OTP";
            return;
        }

        const result = await window.NamkaranOtp.sendOtp(
            toE164India(mobile),
            "recaptcha-container"
        );

        if (!result.ok) {
            setUploadStatus(result.message, true);
            sendOtpBtn.disabled = false;
            sendOtpBtn.textContent = "Send OTP";
            return;
        }

        otpField.hidden = false;
        guestOtpInput.value = "";
        guestOtpInput.focus();
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = "Resend OTP";
        setUploadStatus(result.message);
    }

    async function handleVerifyOtp() {
        const mobile = formatMobile(guestMobileInput.value);
        const code = (guestOtpInput.value || "").replace(/\D/g, "");

        if (!/^\d{6}$/.test(code)) {
            setUploadStatus("Enter the 6-digit OTP sent to your phone.", true);
            guestOtpInput.focus();
            return;
        }

        verifyOtpBtn.disabled = true;
        setUploadStatus("Verifying OTP…");

        const result = await window.NamkaranOtp.verifyOtp(code);

        if (!result.ok) {
            setUploadStatus(result.message, true);
            verifyOtpBtn.disabled = false;
            return;
        }

        setMobileVerified(true, mobile);
        setUploadStatus("Mobile verified. You can now choose photos or videos.");
    }
    */

    async function savePendingUploads(event) {
        event.preventDefault();
        if (!pendingFiles.length) return;

        const guestName = (guestNameInput.value || "").trim();
        if (!guestName) {
            setUploadStatus("Your name is required so we can tag your uploads.", true);
            guestNameInput.focus();
            updateSubmitState();
            return;
        }

        const guestMobile = verifiedMobile || "";

        uploadSubmit.disabled = true;
        setUploadStatus("Uploading your moments for review…");

        try {
            if (!window.NamkaranDrive) {
                throw new Error("Drive helper failed to load. Please refresh the page.");
            }

            const config = await window.NamkaranDrive.loadGalleryConfig();
            if (!config.driveUpload || !config.driveUpload.enabled || !config.driveUpload.endpoint) {
                throw new Error("Guest upload is not connected to Drive yet.");
            }

            for (const file of pendingFiles) {
                const type = isImageFile(file) ? "image" : "video";
                const recordId = createId();
                const result = await window.NamkaranDrive.uploadGuestFile(config, file, {
                    fileName: file.name || `guest-${type}-${Date.now()}`,
                    guestName,
                    guestMobile,
                    recordId,
                    status: STATUS_PENDING,
                });

                const record = {
                    id: result.fileId || recordId,
                    driveId: result.fileId || "",
                    type,
                    name: file.name || `guest-${type}-${Date.now()}`,
                    guestName,
                    guestMobile,
                    mobileVerified: false,
                    status: STATUS_PENDING,
                    blob: file,
                    createdAt: Date.now(),
                };

                try {
                    await dbPut(record);
                } catch (_) {
                    /* Drive is source of truth; local cache is optional */
                }
                guestRecords.unshift(record);
            }

            pendingFiles = [];
            guestFilesInput.value = "";
            renderPendingPreview();
            rebuildGuestMediaLists();
            setUploadStatus("");
            showUploadThanks(guestName);
            guestNameInput.value = "";
        } catch (error) {
            console.error(error);
            setUploadStatus(
                error.message || "Could not upload. Please try a smaller file or try again.",
                true
            );
            updateSubmitState();
        }
    }

    function initUpload() {
        // Mobile OTP listeners (enable later)
        /*
        guestMobileInput.addEventListener("input", () => {
            guestMobileInput.value = guestMobileInput.value.replace(/\D/g, "").slice(0, 10);
            if (mobileVerified && formatMobile(guestMobileInput.value) !== verifiedMobile) {
                resetOtpUi();
            }
        });

        guestOtpInput.addEventListener("input", () => {
            guestOtpInput.value = guestOtpInput.value.replace(/\D/g, "").slice(0, 6);
        });

        sendOtpBtn.addEventListener("click", handleSendOtp);
        verifyOtpBtn.addEventListener("click", handleVerifyOtp);
        */

        guestFilesInput.addEventListener("change", () => {
            if (guestFilesInput.files?.length) {
                addPendingFiles(guestFilesInput.files);
            }
        });

        uploadForm.addEventListener("submit", savePendingUploads);

        viewGuestUploadsBtn.addEventListener("click", () => {
            resetUploadFormView();
            showView("guest");
        });

        if (uploadActions) {
            uploadActions.hidden = false;
        }
        updateSubmitState();
    }

    /* ---------- Lightbox ---------- */

    function syncSlideshowButton() {
        if (!lbSlideshow) return;
        lbSlideshow.classList.toggle("is-active", slideshowActive);
        lbSlideshow.setAttribute("aria-pressed", String(slideshowActive));
        lbSlideshow.textContent = slideshowActive ? "Pause slideshow" : "Slideshow";
        lbSlideshow.title = slideshowActive ? "Pause slideshow" : "Play slideshow";
        lbSlideshow.setAttribute(
            "aria-label",
            slideshowActive ? "Pause slideshow" : "Play slideshow"
        );
    }

    function resetSlideshowProgress() {
        if (!lbSlideshowProgress || !lbSlideshowProgressBar) return;
        lbSlideshowProgress.classList.remove("is-running");
        lbSlideshowProgressBar.style.animation = "none";
        // force reflow so animation can restart
        void lbSlideshowProgressBar.offsetWidth;
        lbSlideshowProgressBar.style.animation = "";
    }

    function startSlideshowProgress() {
        if (!lbSlideshowProgress || !lbSlideshowProgressBar) return;
        lbSlideshowProgress.hidden = false;
        lbSlideshowProgress.style.setProperty("--slideshow-ms", `${SLIDESHOW_MS}ms`);
        resetSlideshowProgress();
        lbSlideshowProgress.classList.add("is-running");
    }

    function stopSlideshowProgress() {
        if (!lbSlideshowProgress) return;
        resetSlideshowProgress();
        lbSlideshowProgress.hidden = true;
    }

    function clearSlideshowTimer() {
        if (slideshowTimer) {
            clearTimeout(slideshowTimer);
            slideshowTimer = null;
        }
    }

    function stopSlideshow() {
        slideshowActive = false;
        clearSlideshowTimer();
        stopSlideshowProgress();
        syncSlideshowButton();
        if (lightbox) lightbox.classList.remove("is-slideshow-mode");
    }

    function scheduleSlideshowAdvance() {
        clearSlideshowTimer();
        if (!slideshowActive || lightbox.hidden || lightboxItems.length < 2) return;
        startSlideshowProgress();
        slideshowTimer = setTimeout(() => {
            showNext({ fromSlideshow: true });
        }, SLIDESHOW_MS);
    }

    function startSlideshow() {
        if (lightboxItems.length < 2) {
            stopSlideshow();
            return;
        }
        slideshowActive = true;
        if (lightbox) lightbox.classList.add("is-slideshow-mode");
        syncSlideshowButton();
        const item = lightboxItems[currentIndex];
        if (item) {
            clearSlideClasses();
            lbImage.style.setProperty("--slideshow-ms", `${SLIDESHOW_MS}ms`);
            lbImage.classList.add("is-soft-zoom");
            updateCaption(item);
        }
        scheduleSlideshowAdvance();
    }

    function toggleSlideshow() {
        if (slideshowActive) stopSlideshow();
        else startSlideshow();
    }

    function startSlideshowFor(items) {
        if (!items || !items.length) return;
        openLightbox(items, 0);
        if (items.length > 1) startSlideshow();
    }

    function clearSlideClasses() {
        if (!lbImage) return;
        lbImage.classList.remove(
            "is-leaving-next",
            "is-leaving-prev",
            "is-entering-next",
            "is-entering-prev",
            "is-entering-fade",
            "is-soft-zoom"
        );
    }

    function applyImageSource(item) {
        if (item.driveId && window.NamkaranDrive && window.NamkaranDrive.bindDriveImage) {
            window.NamkaranDrive.bindDriveImage(lbImage, item.driveId, item.src, "w2000");
        } else {
            lbImage.referrerPolicy = "no-referrer";
            lbImage.onerror = null;
            lbImage.src = item.src;
        }
    }

    function updateCaption(item) {
        const uploader = item.guestName ? ` · ${uploaderLabel(item)}` : "";
        const mobile = item.guestMobile ? ` · ${item.guestMobile}` : "";
        const slideNote = slideshowActive ? " · Slideshow" : "";
        lbCaption.textContent =
            `${currentIndex + 1} / ${lightboxItems.length} · ${mediaLabel(item)}${uploader}${mobile}${slideNote}`;
    }

    function openLightbox(items, index) {
        if (!items.length) return;
        stopSlideshow();
        lightboxItems = items;
        currentIndex = index;
        updateLightbox({ animate: false });
        lightbox.hidden = false;
        document.body.style.overflow = "hidden";
        lbClose.focus();
    }

    function closeLightbox() {
        stopSlideshow();
        lightbox.hidden = true;
        document.body.style.overflow = "";
        clearSlideClasses();
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    }

    async function updateLightbox(options = {}) {
        const item = lightboxItems[currentIndex];
        if (!item) return;

        const animate = options.animate !== false;
        const direction = options.direction || "fade";

        if (!animate) {
            clearSlideClasses();
            lbImage.alt = mediaLabel(item);
            applyImageSource(item);
            updateCaption(item);
            lbCaption.classList.remove("is-swapping");
            if (slideshowActive) {
                lbImage.style.setProperty("--slideshow-ms", `${SLIDESHOW_MS}ms`);
                lbImage.classList.add("is-soft-zoom");
            }
            return;
        }

        if (slideshowAnimating) return;
        slideshowAnimating = true;
        lbCaption.classList.add("is-swapping");
        clearSlideClasses();

        const leaveClass = direction === "prev" ? "is-leaving-prev" : "is-leaving-next";
        const enterClass =
            direction === "prev"
                ? "is-entering-prev"
                : direction === "next"
                  ? "is-entering-next"
                  : "is-entering-fade";

        lbImage.classList.add(leaveClass);
        await new Promise((resolve) => setTimeout(resolve, SLIDE_TRANSITION_MS));

        clearSlideClasses();
        lbImage.alt = mediaLabel(item);
        applyImageSource(item);
        updateCaption(item);
        lbImage.classList.add(enterClass);
        lbCaption.classList.remove("is-swapping");

        await new Promise((resolve) => setTimeout(resolve, 520));
        clearSlideClasses();
        if (slideshowActive) {
            lbImage.style.setProperty("--slideshow-ms", `${SLIDESHOW_MS}ms`);
            lbImage.classList.add("is-soft-zoom");
        }
        slideshowAnimating = false;
    }

    function showPrev() {
        if (slideshowAnimating) return;
        currentIndex = (currentIndex - 1 + lightboxItems.length) % lightboxItems.length;
        updateLightbox({ animate: true, direction: "prev" }).then(() => {
            if (slideshowActive) scheduleSlideshowAdvance();
        });
    }

    function showNext(options = {}) {
        if (slideshowAnimating) return;
        currentIndex = (currentIndex + 1) % lightboxItems.length;
        updateLightbox({
            animate: true,
            direction: "next",
        }).then(() => {
            if (slideshowActive) scheduleSlideshowAdvance();
        });
    }

    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement) {
                await lightbox.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (error) {
            console.warn("Fullscreen unavailable", error);
        }
    }

    function downloadCurrent() {
        const item = lightboxItems[currentIndex];
        if (!item) return;
        const link = document.createElement("a");
        link.href = item.download || item.src;
        if (!/^https?:/i.test(link.href)) {
            link.download = item.name || "photo.jpg";
        } else {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    /* ---------- Music ---------- */

    function setMusicPlayingUi(isPlaying) {
        musicToggle.classList.toggle("is-playing", isPlaying);
        musicPlay.classList.toggle("is-active", isPlaying);
        musicPause.classList.toggle("is-active", !isPlaying);
    }

    async function playMusic() {
        try {
            if (bgMusic.error) {
                bgMusic.load();
            }

            await bgMusic.play();
            setMusicPlayingUi(true);
            if (musicStatus) {
                musicStatus.hidden = true;
                musicStatus.textContent = "";
                musicStatus.classList.remove("is-error");
            }
            return true;
        } catch (error) {
            console.warn("Music could not play", error);
            setMusicPlayingUi(false);

            if (!musicStatus) return false;

            const blocked = error && (error.name === "NotAllowedError" || error.name === "AbortError");
            musicStatus.hidden = false;
            musicStatus.classList.add("is-error");
            musicStatus.textContent = blocked
                ? "Tap Play to start the music."
                : "Music could not start. Please try Play again.";
            return false;
        }
    }

    function armMusicResumeOnFirstTap() {
        const resume = async () => {
            document.removeEventListener("pointerdown", resume, true);
            document.removeEventListener("keydown", resume, true);
            await playMusic();
        };

        document.addEventListener("pointerdown", resume, true);
        document.addEventListener("keydown", resume, true);
    }

    async function startMusicAfterLogin() {
        const shouldAutoplay = sessionStorage.getItem(MUSIC_AUTOPLAY_KEY) === "true";
        if (!shouldAutoplay) return;

        sessionStorage.removeItem(MUSIC_AUTOPLAY_KEY);
        musicPanel.hidden = false;

        const started = await playMusic();
        if (!started) {
            armMusicResumeOnFirstTap();
        }
    }

    function initMusic() {
        bgMusic.volume = Number(musicVolume.value);
        bgMusic.loop = true;

        musicToggle.addEventListener("click", () => {
            const open = musicPanel.hidden;
            musicPanel.hidden = !open;
            if (!open) return;
            // Opening the panel from a tap is a good moment to start music
            if (bgMusic.paused) {
                playMusic();
            }
        });

        musicPlay.addEventListener("click", () => {
            playMusic();
        });

        musicPause.addEventListener("click", () => {
            bgMusic.pause();
            setMusicPlayingUi(false);
        });

        musicMute.addEventListener("click", () => {
            bgMusic.muted = !bgMusic.muted;
            musicMute.setAttribute("aria-pressed", String(bgMusic.muted));
            musicMute.textContent = bgMusic.muted ? "Unmute" : "Mute";
        });

        musicVolume.addEventListener("input", () => {
            bgMusic.volume = Number(musicVolume.value);
            if (bgMusic.volume > 0 && bgMusic.muted) {
                bgMusic.muted = false;
                musicMute.setAttribute("aria-pressed", "false");
                musicMute.textContent = "Mute";
            }
        });

        bgMusic.addEventListener("playing", () => setMusicPlayingUi(true));
        bgMusic.addEventListener("pause", () => setMusicPlayingUi(false));

        startMusicAfterLogin();
    }

    /* ---------- Events ---------- */

    function bindEvents() {
        logoutButton.addEventListener("click", logout);

        photosCard.addEventListener("click", () => showView("photos"));
        videosCard.addEventListener("click", () => showView("videos"));
        guestCard.addEventListener("click", () => showView("guest"));
        uploadCard.addEventListener("click", () => showView("upload"));

        lbPrev.addEventListener("click", showPrev);
        lbNext.addEventListener("click", showNext);
        lbClose.addEventListener("click", closeLightbox);
        lbFullscreen.addEventListener("click", toggleFullscreen);
        if (lbSlideshow) {
            lbSlideshow.addEventListener("click", toggleSlideshow);
        }
        if (photosSlideshowBtn) {
            photosSlideshowBtn.addEventListener("click", async () => {
                await ensurePhotos();
                startSlideshowFor(photos);
            });
        }
        if (guestSlideshowBtn) {
            guestSlideshowBtn.addEventListener("click", async () => {
                await loadGuestUploads();
                renderGuestGallery();
                startSlideshowFor(guestPhotos);
            });
        }
        lbDownload.addEventListener("click", (event) => {
            event.preventDefault();
            downloadCurrent();
        });

        lightbox.addEventListener("click", (event) => {
            if (event.target.dataset.close === "true") {
                closeLightbox();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (lightbox.hidden) return;

            if (event.key === "Escape") closeLightbox();
            if (event.key === "ArrowLeft") showPrev();
            if (event.key === "ArrowRight") showNext();
            if (event.key === " " || event.key === "Spacebar") {
                event.preventDefault();
                toggleSlideshow();
            }
        });
    }

    /* ---------- Boot ---------- */

    if (!requireAuth()) return;

    bindEvents();
    initUpload();
    initMusic();
    loadGuestUploads();
})();
