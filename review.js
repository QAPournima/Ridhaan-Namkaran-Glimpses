(() => {
    "use strict";

    const ADMIN_KEY = "namkaran_admin_authenticated";
    const ADMIN_TOKEN_KEY = "namkaran_admin_token";
    const STATUS_PENDING = "pending";
    const STATUS_APPROVED = "approved";
    const STATUS_REJECTED = "rejected";

    const reviewLogin = document.getElementById("reviewLogin");
    const reviewDashboard = document.getElementById("reviewDashboard");
    const adminLoginForm = document.getElementById("adminLoginForm");
    const adminPasswordInput = document.getElementById("adminPassword");
    const adminLoginError = document.getElementById("adminLoginError");
    const adminLogout = document.getElementById("adminLogout");
    const reviewGrid = document.getElementById("reviewGrid");
    const reviewEmpty = document.getElementById("reviewEmpty");
    const countPending = document.getElementById("countPending");
    const countApproved = document.getElementById("countApproved");
    const countRejected = document.getElementById("countRejected");
    const countDownloads = document.getElementById("countDownloads");
    const driveStatus = document.getElementById("driveStatus");

    let galleryConfig = null;
    let records = [];
    let downloadRecords = [];
    let activeStatus = STATUS_PENDING;

    function isAdmin() {
        return (
            sessionStorage.getItem(ADMIN_KEY) === "true" &&
            Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY))
        );
    }

    function getAdminToken() {
        return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
    }

    function setAdmin(value, token) {
        if (value && token) {
            sessionStorage.setItem(ADMIN_KEY, "true");
            sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
        } else {
            sessionStorage.removeItem(ADMIN_KEY);
            sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        }
    }

    function showLoginError(message) {
        adminLoginError.hidden = !message;
        adminLoginError.textContent = message || "";
    }

    function setDriveStatus(message, isError) {
        if (!driveStatus) return;
        if (!message) {
            driveStatus.hidden = true;
            driveStatus.textContent = "";
            driveStatus.classList.remove("is-error", "is-success");
            return;
        }
        driveStatus.hidden = false;
        driveStatus.textContent = message;
        driveStatus.classList.toggle("is-error", Boolean(isError));
        driveStatus.classList.toggle("is-success", !isError);
    }

    function showDashboard(show) {
        reviewLogin.hidden = show;
        reviewDashboard.hidden = !show;
        adminLogout.hidden = !show;
        if (show) {
            setDriveStatus("Loading guest uploads from Google Drive…");
        }
    }

    async function loadConfig() {
        if (window.location.protocol === "file:") {
            throw new Error(
                "Open review via http://localhost:8000/review.html (not as a local file). file:// cannot load Drive."
            );
        }
        if (!window.NamkaranDrive) {
            throw new Error("drive.js failed to load");
        }
        galleryConfig = await window.NamkaranDrive.loadGalleryConfig();
        const endpoint = galleryConfig.driveUpload && galleryConfig.driveUpload.endpoint;
        if (!endpoint || String(endpoint).includes("PASTE_") || String(endpoint).includes("/macros/library/")) {
            throw new Error(
                "Set gallery.json → driveUpload.endpoint to your Web app URL ending in /exec"
            );
        }
    }

    async function refreshRecords() {
        if (!window.NamkaranDrive || !galleryConfig) {
            records = [];
            updateCounts();
            renderList();
            return;
        }

        try {
            const guests = await window.NamkaranDrive.loadDriveGuestList(galleryConfig);
            records = guests.map((guest) => ({
                id: guest.driveId,
                driveId: guest.driveId,
                type: guest.type === "video" ? "video" : "image",
                name: guest.name || guest.title || "Guest upload",
                guestName: guest.guestName || "Guest",
                status: guest.status || STATUS_PENDING,
                createdAt: guest.createdAt || 0,
                src:
                    guest.type === "video"
                        ? window.NamkaranDrive.drivePreviewUrl(guest.driveId)
                        : window.NamkaranDrive.driveImageUrl(guest.driveId),
                viewUrl: guest.viewUrl || "",
            }));
            records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setDriveStatus(`Loaded ${records.length} guest file(s) from Drive.`);
        } catch (error) {
            console.error(error);
            records = [];
            setDriveStatus(
                error.message ||
                    "Could not load guest uploads from Drive. Update & redeploy Apps Script, then hard-refresh.",
                true
            );
        }

        try {
            const stats = await window.NamkaranDrive.loadDownloadStats(galleryConfig);
                downloadRecords = (stats || []).map((item) => ({
                    id: item.driveId,
                    driveId: item.driveId,
                    name: item.title || "Photo",
                    count: Number(item.count || 0),
                    lastDownloadedAt: item.lastDownloadedAt || 0,
                    src:
                        item.src ||
                        (window.NamkaranDrive.extractDriveId(item.driveId)
                            ? window.NamkaranDrive.driveImageUrl(item.driveId)
                            : item.driveId),
                }));
        } catch (statsError) {
            console.warn(statsError);
            downloadRecords = [];
        }

        updateCounts();
        renderList();
    }

    function updateCounts() {
        const pending = records.filter((r) => r.status === STATUS_PENDING).length;
        const approved = records.filter((r) => r.status === STATUS_APPROVED).length;
        const rejected = records.filter((r) => r.status === STATUS_REJECTED).length;
        countPending.textContent = String(pending);
        countApproved.textContent = String(approved);
        countRejected.textContent = String(rejected);
        if (countDownloads) {
            const totalDownloads = downloadRecords.reduce((sum, item) => sum + Number(item.count || 0), 0);
            countDownloads.textContent = String(totalDownloads);
        }
    }

    function renderDownloads() {
        reviewGrid.innerHTML = "";
        reviewEmpty.hidden = downloadRecords.length > 0;
        if (!downloadRecords.length) {
            reviewEmpty.textContent = "No photo downloads recorded yet.";
            return;
        }
        reviewEmpty.textContent = "No items in this list.";

        downloadRecords.forEach((record) => {
            const card = document.createElement("article");
            card.className = "review-card";

            const media = document.createElement("div");
            media.className = "review-media";
            const img = document.createElement("img");
            img.alt = record.name;
            img.referrerPolicy = "no-referrer";
            if (
                record.driveId &&
                window.NamkaranDrive &&
                window.NamkaranDrive.extractDriveId(record.driveId)
            ) {
                window.NamkaranDrive.bindDriveImage(img, record.driveId, record.src);
            } else {
                img.src = record.src || record.driveId;
            }
            media.appendChild(img);

            const pill = document.createElement("span");
            pill.className = "review-status-pill is-approved";
            pill.textContent = `${record.count} download${record.count === 1 ? "" : "s"}`;
            media.appendChild(pill);

            const body = document.createElement("div");
            body.className = "review-card-body";
            const title = document.createElement("h3");
            title.textContent = record.name;
            const meta = document.createElement("p");
            meta.className = "review-meta";
            const when = record.lastDownloadedAt
                ? new Date(record.lastDownloadedAt).toLocaleString()
                : "";
            meta.textContent = when ? `Last downloaded ${when}` : "Downloaded from the gallery";
            body.append(title, meta);
            card.append(media, body);
            reviewGrid.appendChild(card);
        });
    }

    function renderList() {
        if (activeStatus === "downloads") {
            renderDownloads();
            return;
        }

        const filtered = records.filter((r) => r.status === activeStatus);
        reviewGrid.innerHTML = "";
        reviewEmpty.hidden = filtered.length > 0;
        reviewEmpty.textContent = "No items in this list.";

        filtered.forEach((record) => {
            const card = document.createElement("article");
            card.className = "review-card";

            const media = document.createElement("div");
            media.className = "review-media";

            if (record.type === "image") {
                const img = document.createElement("img");
                img.alt = record.name;
                if (record.driveId && window.NamkaranDrive && window.NamkaranDrive.bindDriveImage) {
                    window.NamkaranDrive.bindDriveImage(img, record.driveId, record.src);
                } else {
                    img.referrerPolicy = "no-referrer";
                    img.src = record.src;
                }
                media.appendChild(img);
            } else {
                const iframe = document.createElement("iframe");
                iframe.src = record.src;
                iframe.title = record.name;
                iframe.allow = "autoplay";
                iframe.loading = "lazy";
                media.appendChild(iframe);
            }

            const pill = document.createElement("span");
            pill.className = "review-status-pill";
            if (activeStatus === STATUS_APPROVED) pill.classList.add("is-approved");
            if (activeStatus === STATUS_REJECTED) pill.classList.add("is-rejected");
            pill.textContent =
                activeStatus === STATUS_PENDING
                    ? "Under review"
                    : activeStatus === STATUS_APPROVED
                      ? "Approved"
                      : "Rejected";
            media.appendChild(pill);

            const body = document.createElement("div");
            body.className = "review-card-body";

            const title = document.createElement("h3");
            title.textContent = record.name;

            const meta = document.createElement("p");
            meta.className = "review-meta";
            const when = record.createdAt
                ? new Date(record.createdAt).toLocaleString()
                : "";
            meta.textContent = `${record.guestName || "Guest"}${when ? " · " + when : ""}`;

            const actions = document.createElement("div");
            actions.className = "review-actions";

            if (activeStatus !== STATUS_APPROVED) {
                const approve = document.createElement("button");
                approve.type = "button";
                approve.className = "review-approve";
                approve.textContent = "Approve";
                approve.addEventListener("click", () => setStatus(record, STATUS_APPROVED, approve));
                actions.appendChild(approve);
            }

            if (activeStatus !== STATUS_REJECTED) {
                const reject = document.createElement("button");
                reject.type = "button";
                reject.className = "review-reject";
                reject.textContent = "Reject";
                reject.addEventListener("click", () => setStatus(record, STATUS_REJECTED, reject));
                actions.appendChild(reject);
            }

            if (record.viewUrl) {
                const open = document.createElement("a");
                open.className = "review-open-link";
                open.href = record.viewUrl;
                open.target = "_blank";
                open.rel = "noopener noreferrer";
                open.textContent = "Open in Drive";
                actions.appendChild(open);
            }

            body.append(title, meta, actions);
            card.append(media, body);
            reviewGrid.appendChild(card);
        });
    }

    async function setStatus(record, status, button) {
        if (button) {
            button.disabled = true;
            button.textContent = status === STATUS_APPROVED ? "Approving…" : "Rejecting…";
        }

        try {
            await window.NamkaranDrive.setGuestStatus(
                galleryConfig,
                record.driveId,
                status,
                getAdminToken()
            );
            record.status = status;
            setDriveStatus(
                status === STATUS_APPROVED
                    ? `Approved “${record.name}”. It will show in Guest Uploads.`
                    : `Rejected “${record.name}”.`
            );
            await refreshRecords();
        } catch (error) {
            console.error(error);
            const message = error.message || "Could not update status on Drive.";
            setDriveStatus(message, true);
            if (/admin|login|session|expired/i.test(message)) {
                setAdmin(false);
                showDashboard(false);
                showLoginError("Admin session expired. Please log in again.");
            }
            if (button) {
                button.disabled = false;
                button.textContent = status === STATUS_APPROVED ? "Approve" : "Reject";
            }
        }
    }

    adminLoginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const value = adminPasswordInput.value.trim();
        if (!value) {
            showLoginError("Enter the admin password.");
            return;
        }

        const submitBtn = adminLoginForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Checking…";
        }
        showLoginError("");

        try {
            const result = await window.NamkaranDrive.adminLogin(galleryConfig, value);
            if (!result || !result.ok || !result.token) {
                throw new Error((result && result.message) || "Admin login failed.");
            }
            setAdmin(true, result.token);
            adminPasswordInput.value = "";
            showDashboard(true);
            await refreshRecords();
        } catch (error) {
            console.error(error);
            setAdmin(false);
            showLoginError(error.message || "That admin password doesn't seem right.");
            adminPasswordInput.value = "";
            adminPasswordInput.focus();
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Enter review";
            }
        }
    });

    adminLogout.addEventListener("click", () => {
        setAdmin(false);
        showDashboard(false);
        adminPasswordInput.value = "";
        setDriveStatus("");
    });

    document.querySelectorAll(".review-tab").forEach((tab) => {
        tab.addEventListener("click", async () => {
            activeStatus = tab.dataset.status;
            document.querySelectorAll(".review-tab").forEach((btn) => {
                const on = btn === tab;
                btn.classList.toggle("is-active", on);
                btn.setAttribute("aria-selected", String(on));
            });
            if (activeStatus === "downloads" && window.NamkaranDrive && galleryConfig) {
                try {
                    const stats = await window.NamkaranDrive.loadDownloadStats(galleryConfig);
                    downloadRecords = (stats || []).map((item) => ({
                        id: item.driveId,
                        driveId: item.driveId,
                        name: item.title || "Photo",
                        count: Number(item.count || 0),
                        lastDownloadedAt: item.lastDownloadedAt || 0,
                        src:
                            item.src ||
                            (window.NamkaranDrive.extractDriveId(item.driveId)
                                ? window.NamkaranDrive.driveImageUrl(item.driveId)
                                : item.driveId),
                    }));
                    updateCounts();
                } catch (error) {
                    console.warn(error);
                }
            }
            renderList();
        });
    });

    (async function boot() {
        try {
            await loadConfig();
            if (isAdmin()) {
                showDashboard(true);
                await refreshRecords();
            }
        } catch (error) {
            console.error(error);
            setDriveStatus(error.message || "Could not load review config.", true);
        }
    })();
})();
