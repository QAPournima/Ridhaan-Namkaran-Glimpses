/* Fill these from your Firebase project to enable real SMS OTP.
   Console: https://console.firebase.google.com
   1. Create a project
   2. Enable Authentication → Sign-in method → Phone
   3. Project settings → Your apps → Web app → copy config
*/
window.OTP_CONFIG = {
    enabled: false, // set true after pasting your Firebase config below
    provider: "firebase", // sms via Firebase (WhatsApp needs a paid Business API later)
    firebase: {
        apiKey: "",
        authDomain: "",
        projectId: "",
        appId: ""
    }
};
