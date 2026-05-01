# Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit finding High #5 (no email verification on signup) by sending a verification mail at account creation and showing a persistent dismissable banner to unverified users until they confirm.

**Architecture:** Soft-warn approach — verification is encouraged via a banner on every page inside Layout, but unverified users can still use the app. Hard-blocking sensitive actions can be layered on later when needed. `auth.currentUser.emailVerified` is the source of truth (Firebase Auth manages it; OAuth providers populate `true` automatically). The signup path triggers `sendEmailVerification`; existing users see the same banner with a "Resend" button.

**Tech Stack:** Firebase Auth `sendEmailVerification`, React 19, CSS modules.

---

## File Structure

| File | Purpose |
|---|---|
| `src/pages/Login.tsx` | Modify — send verification email after `createUserWithEmailAndPassword` |
| `src/components/EmailVerificationBanner.tsx` | Create — banner with resend + reload buttons |
| `src/components/EmailVerificationBanner.module.css` | Create — banner styles |
| `src/components/Layout.tsx` | Modify — render banner above main content for unverified users |

---

### Task 1: Send verification email at signup

**Files:**
- Modify: `src/pages/Login.tsx` (signup branch around line 173)

- [ ] **Step 1: Add `sendEmailVerification` to firebase/auth import**

In `src/pages/Login.tsx` line 5-9, change:
```tsx
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
} from 'firebase/auth';
```
to:
```tsx
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    sendEmailVerification,
} from 'firebase/auth';
```

- [ ] **Step 2: Trigger verification email after createUser succeeds**

Find this block (around line 172-205):
```tsx
} else if (mode === 'signup') {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const first = firstName.trim();
```

Right after `const cred = ...` — before the firestore setDoc — append:
```tsx
                // Fire-and-forget verification email. Failure (e.g. quota) is
                // non-fatal; the banner has a Resend button. Logged so the
                // tester knows to expect the mail.
                sendEmailVerification(cred.user).catch(e => {
                    console.error('Failed to send verification email', e);
                });
```

So the block becomes:
```tsx
} else if (mode === 'signup') {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    sendEmailVerification(cred.user).catch(e => {
        console.error('Failed to send verification email', e);
    });
    const first = firstName.trim();
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit code 0, no output.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Login.tsx
git commit -m "feat(auth): send email verification on signup

Fires sendEmailVerification(user) right after the password account is
created. Failure is logged but non-fatal — the in-app banner (next
commit) carries a Resend button so users can recover."
```

---

### Task 2: Verification banner shown to unverified users

**Files:**
- Create: `src/components/EmailVerificationBanner.tsx`
- Create: `src/components/EmailVerificationBanner.module.css`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Create the banner component**

`src/components/EmailVerificationBanner.tsx`:
```tsx
import React, { useState } from 'react';
import { Mail, RefreshCw, X } from 'lucide-react';
import { sendEmailVerification, reload } from 'firebase/auth';
import { auth } from '../services/firebase';
import styles from './EmailVerificationBanner.module.css';

export const EmailVerificationBanner: React.FC = () => {
    const [dismissed, setDismissed] = useState(false);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');

    const user = auth.currentUser;
    if (!user || user.emailVerified || dismissed) return null;

    const handleResend = async () => {
        setError('');
        setSent(false);
        setSending(true);
        try {
            await sendEmailVerification(user);
            setSent(true);
        } catch (e) {
            console.error('Resend verification failed', e);
            setError('Kunde inte skicka mailet. Försök igen om en stund.');
        } finally {
            setSending(false);
        }
    };

    const handleCheckStatus = async () => {
        setError('');
        setChecking(true);
        try {
            await reload(user);
            if (user.emailVerified) {
                // Force a refresh so the banner unmounts and any feature
                // gates re-evaluate against the new verified status.
                window.location.reload();
            } else {
                setError('Inte verifierat ännu — klicka på länken i mailet och försök igen.');
            }
        } catch (e) {
            console.error('Reload user failed', e);
            setError('Kunde inte kontrollera status just nu.');
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className={styles.banner} role="status">
            <Mail size={18} className={styles.icon} />
            <div className={styles.text}>
                <strong>Verifiera din e-post.</strong>{' '}
                Vi skickade ett mail till <span className={styles.email}>{user.email}</span>.
                {sent && <span className={styles.sentNote}> Mail skickat.</span>}
                {error && <span className={styles.errorNote}> {error}</span>}
            </div>
            <div className={styles.actions}>
                <button
                    className={styles.actionBtn}
                    onClick={handleCheckStatus}
                    disabled={checking}
                    title="Jag har verifierat — uppdatera"
                >
                    <RefreshCw size={14} className={checking ? styles.spinning : ''} />
                    Jag har verifierat
                </button>
                <button
                    className={styles.actionBtn}
                    onClick={handleResend}
                    disabled={sending}
                >
                    {sending ? 'Skickar…' : 'Skicka nytt mail'}
                </button>
                <button
                    className={styles.dismissBtn}
                    onClick={() => setDismissed(true)}
                    title="Dölj tills nästa sidladdning"
                    aria-label="Dölj banner"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Create the banner styles**

`src/components/EmailVerificationBanner.module.css`:
```css
.banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    margin: 0.5rem 1rem 0;
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 12px;
    color: #78350f;
    font-size: 0.85rem;
    line-height: 1.4;
    flex-wrap: wrap;
}

.icon {
    flex-shrink: 0;
    color: #b45309;
}

.text {
    flex: 1;
    min-width: 200px;
}

.email {
    font-weight: 600;
}

.sentNote {
    color: #166534;
    font-weight: 600;
}

.errorNote {
    color: #991b1b;
    font-weight: 600;
}

.actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
}

.actionBtn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
    border: 1px solid #fbbf24;
    background: #fffbeb;
    color: #78350f;
    font-size: 0.8rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
}

.actionBtn:hover:not(:disabled) {
    background: #fef3c7;
}

.actionBtn:disabled {
    opacity: 0.5;
    cursor: wait;
}

.dismissBtn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: #92400e;
    padding: 0.25rem;
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
}

.dismissBtn:hover {
    background: rgba(146, 64, 14, 0.1);
}

.spinning {
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Render the banner inside Layout**

In `src/components/Layout.tsx` — find the import block at top, add:
```tsx
import { EmailVerificationBanner } from './EmailVerificationBanner';
```

Find the `<main className={styles.main}>` JSX (around line 319). Insert the banner right BEFORE it:
```tsx
            <EmailVerificationBanner />

            <main className={styles.main}>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit code 0, no output.

- [ ] **Step 5: Smoke-test in dev**

Run: `npm run dev`. Sign up a new account with a real (or catch-all) email. Expected:
- Banner appears under the header on every authenticated page.
- "Skicka nytt mail" button triggers a new mail (check inbox).
- "Jag har verifierat" button reloads the page after clicking the verify link in the email.
- Existing already-verified users (Google OAuth) don't see the banner.

If the banner doesn't show: check `auth.currentUser.emailVerified` in the browser console.

- [ ] **Step 6: Commit**

```bash
git add src/components/EmailVerificationBanner.tsx \
        src/components/EmailVerificationBanner.module.css \
        src/components/Layout.tsx
git commit -m "feat(auth): in-app banner for unverified email accounts

Renders inside Layout for every signed-in route when
auth.currentUser.emailVerified is false. Provides:
  - Resend button (calls sendEmailVerification again)
  - 'I have verified' button (reload(user) → window.reload if true)
  - Dismiss for the current session

Soft warn rather than hard block — testers should be able to use the
app while we still nudge them. Hard-blocking sensitive actions can
be layered on later if abuse appears."
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Verification mail at signup (Task 1)
- ✅ Banner with resend + check + dismiss (Task 2)
- N/A: Hard-blocking — out of scope, soft-warn chosen.

**2. Placeholder scan:** No "TBD" / "appropriate" / "etc." in any task body. ✓

**3. Type/path consistency:**
- `sendEmailVerification` and `reload` exist on Firebase Auth v12 ✓
- `auth.currentUser` accessor used same way as `services/firebase.ts` exports ✓
- Banner CSS-modules pattern matches existing components (`Foo.tsx + Foo.module.css`) ✓
- Layout already wraps `<main>` so inserting before it is a clean location ✓

---

## Execution Handoff

2 tasks, ~1.5h, mix of CSS + auth code. **Inline execution** is the right pick. Skip the manual smoke-test (Step 5 of Task 2) if you don't have a fresh test inbox — type-check + the contract of `sendEmailVerification` covers most risk.
