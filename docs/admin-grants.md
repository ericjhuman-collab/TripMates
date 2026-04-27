# Granting Admin Role

`role: 'admin'` on a user doc unlocks app-wide privileges (gallery edit on
others' photos, payment delete, future moderation tools). It is **never**
written from the client — the Firestore rule on `users/{uid}` rejects role
escalation from any authenticated request.

The grant must come from one of two server-side paths:

## Option 1 — Manual Firebase Console flip

1. https://console.firebase.google.com/project/alen-8797d/firestore/data
2. Open the `users` collection.
3. Find the user document by uid (or filter by `email`).
4. Edit the `role` field — change from `user` to `admin`. Save.
5. The user must reload the app for the new role to take effect.

## Option 2 — Cloud Function (future)

When we build a moderation panel, an admin-only callable function will set
the role atomically with audit logging. Until then, Option 1 is the way.

## Revoking admin

Same as Option 1 but flip back to `user`. The Firestore rule lets the same
admin do this server-side via the console — no rule update needed.

## Why no client-side promotion?

Earlier the codebase had a hardcoded `ADMIN_EMAILS` array in `AuthContext`.
That signalled an insecure intent (compromise an email → get admin) and was
removed in commit history (see git log around 2026-04-27). The current
firestore.rules block role rewrites from any authenticated path, so admin
membership is governed entirely by who can write the user doc directly via
the Firebase Admin SDK / console.
