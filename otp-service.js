(() => {
    "use strict";

    const config = window.OTP_CONFIG || { enabled: false };
    let confirmationResult = null;
    let recaptchaVerifier = null;
    let auth = null;
    let ready = false;

    function isConfigured() {
        return Boolean(
            config.enabled &&
            config.firebase &&
            config.firebase.apiKey &&
            config.firebase.authDomain &&
            config.firebase.projectId &&
            config.firebase.appId &&
            window.firebase
        );
    }

    function initFirebase() {
        if (!isConfigured()) return false;
        if (ready) return true;

        if (!firebase.apps.length) {
            firebase.initializeApp(config.firebase);
        }
        auth = firebase.auth();
        ready = true;
        return true;
    }

    function setupRecaptcha(containerId) {
        if (!initFirebase()) {
            throw new Error("OTP is not configured yet.");
        }

        if (recaptchaVerifier) {
            try {
                recaptchaVerifier.clear();
            } catch (_) {
                /* ignore */
            }
            recaptchaVerifier = null;
        }

        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = "";
        }

        recaptchaVerifier = new firebase.auth.RecaptchaVerifier(containerId, {
            size: "invisible",
            callback: () => {},
        });

        return recaptchaVerifier;
    }

    async function sendOtp(e164Phone, containerId) {
        if (!initFirebase()) {
            return {
                ok: false,
                needsSetup: true,
                message:
                    "SMS OTP needs setup. Add your Firebase keys in otp-config.js and set enabled: true.",
            };
        }

        try {
            const verifier = setupRecaptcha(containerId || "recaptcha-container");
            confirmationResult = await auth.signInWithPhoneNumber(e164Phone, verifier);
            return {
                ok: true,
                message: "OTP sent by SMS. Please enter the 6-digit code.",
            };
        } catch (error) {
            console.error("sendOtp failed", error);
            let message = "Could not send OTP. Please check the number and try again.";
            if (error && error.code === "auth/too-many-requests") {
                message = "Too many attempts. Please wait a few minutes and try again.";
            } else if (error && error.code === "auth/invalid-phone-number") {
                message = "That mobile number looks invalid.";
            } else if (error && error.code === "auth/argument-error") {
                message =
                    "OTP setup looks incomplete. Check Firebase Phone Auth and otp-config.js.";
            }
            return { ok: false, message };
        }
    }

    async function verifyOtp(code) {
        if (!confirmationResult) {
            return {
                ok: false,
                message: "Please send the OTP first.",
            };
        }

        try {
            await confirmationResult.confirm(String(code || "").trim());
            return {
                ok: true,
                message: "Mobile number verified.",
            };
        } catch (error) {
            console.error("verifyOtp failed", error);
            return {
                ok: false,
                message: "Incorrect OTP. Please try again.",
            };
        }
    }

    function reset() {
        confirmationResult = null;
    }

    window.NamkaranOtp = {
        isConfigured,
        sendOtp,
        verifyOtp,
        reset,
    };
})();
