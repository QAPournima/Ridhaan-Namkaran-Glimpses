const PASSWORD = "Ridhaan2026";
const AUTH_KEY = "namkaran_authenticated";
const MUSIC_AUTOPLAY_KEY = "namkaran_autoplay_music";

const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const errorMessage = document.getElementById("errorMessage");

function isAuthenticated() {
    return localStorage.getItem(AUTH_KEY) === "true";
}

function setAuthenticated() {
    localStorage.setItem(AUTH_KEY, "true");
}

function showError() {
    if (!errorMessage) return;
    errorMessage.hidden = false;
    errorMessage.style.display = "block";
    errorMessage.textContent =
        "That password doesn't seem right. Please try again.";
}

function clearError() {
    if (!errorMessage) return;
    errorMessage.hidden = true;
    errorMessage.style.display = "none";
}

async function login() {
    if (!passwordInput) return;

    const enteredPassword = passwordInput.value.trim();

    if (enteredPassword === PASSWORD) {
        setAuthenticated();
        clearError();
        sessionStorage.setItem(MUSIC_AUTOPLAY_KEY, "true");

        // Unlock audio from the login click, then open the gallery
        try {
            const preview = new Audio("music/flute.mp3");
            preview.volume = 0.6;
            await preview.play();
            preview.pause();
        } catch (_) {
            // Gallery will still attempt autoplay / resume on first tap
        }

        window.location.href = "glimpses.html";
        return;
    }

    showError();
    passwordInput.value = "";
    passwordInput.focus();
}

if (loginButton) {
    loginButton.addEventListener("click", login);
}

if (passwordInput) {
    passwordInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            login();
        }
    });

    passwordInput.addEventListener("input", clearError);
}
