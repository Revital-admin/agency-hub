# Add Firebase Authentication and Fix Cloud Syncing

The Hub currently displays "Guest" in the profile section, and cross-tab/incognito syncing is failing. We will implement Firebase Authentication to handle user logins and update the Firestore real-time listeners to securely and reliably sync data across devices.

## User Review Required

> [!WARNING]
> Because we are adding real authentication, you will need to go to your Firebase Console and enable the **Email/Password** sign-in method under the **Authentication** tab. You will also need to create a user account for yourself there, or we can add a quick "Sign Up" button. Let me know which you prefer!

## Proposed Changes

### Core Logic

#### [MODIFY] app.js
- Remove the unreliable `docSnap.metadata.hasPendingWrites` check in the Firestore listener, and replace it with a robust `JSON.stringify` comparison. This ensures that when a change is detected from *another* tab (like your incognito window), the UI will instantly refresh to match the cloud database.
- Integrate Firebase Authentication listeners (`onAuthStateChanged`) to detect when a user logs in.
- Update the UI to display the logged-in user's email and initial in the top right corner instead of "Guest".
- Redirect unauthenticated users to a login modal/screen, preventing them from accessing the Hub until they log in.

#### [MODIFY] index.html
- Import the Firebase Authentication library `firebase-auth.js`.
- Create a simple Login Modal overlay that handles Email/Password authentication.
- Attach the login modal to the Firebase Auth SDK.

## Verification Plan

### Manual Verification
1. I will provide you with the updated ZIP file.
2. You will open the Hub, log in with your email/password (after enabling it in Firebase).
3. The top right corner should display your email.
4. You will open an incognito window, log in there as well.
5. Checking a box in the main window should instantly visually check the box in the incognito window.
