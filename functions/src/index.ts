import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10, minInstances: 1 });

if (getApps().length === 0) initializeApp();
const db = getFirestore();

// Hard cap per user per UTC day. Protects against retry-loop bugs in the client
// that could otherwise burn through the Vertex AI budget. 50 is comfortably above
// any realistic single-day usage on a trip.
const MAX_DAILY_SCANS = 50;

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'alen-8797d';
const VERTEX_LOCATION = 'europe-west4';
const MODEL = 'gemini-2.5-flash';

const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: VERTEX_LOCATION,
});

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    merchantName: { type: Type.STRING, nullable: true },
    transactionDate: { type: Type.STRING, nullable: true, description: 'ISO 8601 date YYYY-MM-DD' },
    currency: { type: Type.STRING, nullable: true, description: 'ISO 4217 code, e.g. SEK, EUR, USD' },
    totalAmount: { type: Type.NUMBER, nullable: true, description: 'Grand total including tax and tip' },
    tip: { type: Type.NUMBER, nullable: true, description: 'Tip / gratuity amount, 0 or null if none' },
    tax: { type: Type.NUMBER, nullable: true, description: 'Tax / VAT / moms amount' },
    category: {
      type: Type.STRING,
      nullable: true,
      enum: ['restaurant', 'groceries', 'drinks', 'accommodation', 'transport', 'activities', 'shopping']
    },
    lineItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.INTEGER },
          unitPrice: { type: Type.NUMBER },
          lineTotal: { type: Type.NUMBER }
        },
        required: ['description', 'quantity', 'unitPrice', 'lineTotal']
      }
    }
  },
  required: ['lineItems']
} as const;

const generationConfig = {
  temperature: 0,
  maxOutputTokens: 2048,
  responseMimeType: 'application/json',
  responseSchema: responseSchema as never,
  // Gemini 2.5 reasons by default; disable to get direct structured output for receipt extraction.
  thinkingConfig: { thinkingBudget: 0 }
};

const PROMPT = `You are extracting structured data from a photo of a retail receipt.

Return JSON matching the schema. Rules:
- lineItems are the purchased products/services. Skip subtotal, tax (moms/VAT), tip (dricks/gratuity), payment method, change, and any header/footer rows.
- For "2x Dagens Kött 240 SEK": quantity=2, unitPrice=120, lineTotal=240. Always set unitPrice = lineTotal / quantity.
- tip: capture only an explicitly written tip/dricks/gratuity amount. 0 or null if none.
- tax: total VAT/moms shown on the receipt.
- totalAmount: grand total the customer paid (includes tax and tip).
- transactionDate: format YYYY-MM-DD. Null if unreadable.
- currency: ISO 4217 code. Infer from currency symbols, language, or merchant location.
- category: pick the closest match from the enum, or null if uncertain.
- Never invent items not visible in the image. If a field is unreadable, return null (or [] for lineItems).`;

interface ScanRequest {
  imageBase64: string;
  mimeType: string;
}

export const scanReceipt = onCall<ScanRequest>(
  { memory: '512MiB', timeoutSeconds: 60, cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const { imageBase64, mimeType } = request.data ?? {};
    if (!imageBase64 || !mimeType) {
      throw new HttpsError('invalid-argument', 'imageBase64 and mimeType are required.');
    }
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(mimeType)) {
      throw new HttpsError('invalid-argument', `Unsupported mimeType: ${mimeType}`);
    }
    // Callable payload limit is 10 MB; base64 inflates by ~33%, so cap raw at ~7 MB.
    const approxBytes = (imageBase64.length * 3) / 4;
    if (approxBytes > 7 * 1024 * 1024) {
      throw new HttpsError('invalid-argument', 'Image too large. Downscale to under 7 MB.');
    }

    await reserveDailyQuota(request.auth.uid);

    try {
      const parsed = await callGeminiWithRetry(imageBase64, mimeType);
      return normalize(parsed);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Gemini scan failed', err);
      throw new HttpsError('internal', `Scan failed: ${msg}`);
    }
  }
);

const todayUTC = (): string => new Date().toISOString().slice(0, 10);

async function reserveDailyQuota(uid: string): Promise<void> {
  const ref = db.doc(`users/${uid}/scanQuota/${todayUTC()}`);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = (snap.data()?.count as number | undefined) ?? 0;
      if (count >= MAX_DAILY_SCANS) {
        throw new HttpsError(
          'resource-exhausted',
          `Du har nått dagens gräns på ${MAX_DAILY_SCANS} skanningar. Försök igen imorgon.`
        );
      }
      tx.set(
        ref,
        { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    });
  } catch (err) {
    // Re-throw quota-exceeded as-is; fail-closed on infra errors so a broken
    // Firestore can't cause unbounded Gemini spend.
    if (err instanceof HttpsError) throw err;
    console.error('Quota check failed', err);
    throw new HttpsError('unavailable', 'Kunde inte verifiera kvot. Försök igen om en stund.');
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isTransientGeminiError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err);
  // The SDK surfaces HTTP status in the error message — match common transient codes.
  return /\b(429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|deadline)\b/i.test(message);
};

async function callGeminiWithRetry(imageBase64: string, mimeType: string): Promise<unknown> {
  const backoffsMs = [400, 1500];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: PROMPT }
            ]
          }
        ],
        config: generationConfig
      });
      const text = result.text;
      if (!text) throw new HttpsError('internal', 'Empty response from Gemini.');
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpsError) throw err;
      if (attempt < backoffsMs.length && isTransientGeminiError(err)) {
        await sleep(backoffsMs[attempt]);
        continue;
      }
      // Surface rate-limit specifically so the client can show a helpful message.
      if (isTransientGeminiError(err)) {
        throw new HttpsError(
          'resource-exhausted',
          'Skanningstjänsten är överbelastad just nu. Försök igen om en stund.'
        );
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Gemini call failed');
}

interface ParsedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ScannedReceiptData {
  merchantName: string | null;
  transactionDate: string | null;
  currency: string | null;
  totalAmount: number | null;
  tip: number | null;
  tax: number | null;
  category: string | null;
  lineItems: ParsedLineItem[];
}

const num = (v: unknown): number | null => {
  if (typeof v !== 'number' || !isFinite(v)) return null;
  return Math.round(v * 100) / 100;
};

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
};

function normalize(raw: unknown): ScannedReceiptData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(r.lineItems) ? r.lineItems : [];

  const lineItems: ParsedLineItem[] = rawItems
    .map((it) => {
      const item = (it ?? {}) as Record<string, unknown>;
      const description = str(item.description);
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const lineTotal = num(item.lineTotal);
      const unitPrice = num(item.unitPrice) ?? (lineTotal !== null ? lineTotal / quantity : null);
      if (!description || lineTotal === null || unitPrice === null || lineTotal <= 0) return null;
      return { description, quantity, unitPrice, lineTotal };
    })
    .filter((x): x is ParsedLineItem => x !== null);

  return {
    merchantName: str(r.merchantName),
    transactionDate: str(r.transactionDate),
    currency: str(r.currency)?.toUpperCase() ?? null,
    totalAmount: num(r.totalAmount),
    tip: num(r.tip),
    tax: num(r.tax),
    category: str(r.category),
    lineItems
  };
}

import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

/**
 * Self-service account deletion.
 *
 * Hard-deletes user-identifying records (user doc + private subcollection +
 * username reservation + avatar storage + auth account) and removes the
 * user from every trip they're a member of. Financial / shared-trip
 * artefacts (expenses, payments, gallery photos) keep their original uid
 * references so cross-user balances and history stay correct; the UI
 * displays "Unknown user" wherever the uid no longer resolves.
 *
 * The auth account is deleted last so a partial failure leaves the user
 * able to retry from the same session.
 */
export const deleteUserAccount = onCall({ minInstances: 0 }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : null;

    // 1. Remove uid from every trip they belong to.
    const tripsSnap = await db.collection('trips')
        .where('members', 'array-contains', uid)
        .get();
    if (tripsSnap.size > 0) {
        const batch = db.batch();
        for (const trip of tripsSnap.docs) {
            batch.update(trip.ref, {
                members: FieldValue.arrayRemove(uid),
                adminIds: FieldValue.arrayRemove(uid),
            });
        }
        await batch.commit();
    }

    // 2. Delete private subcollection (currently a single 'contact' doc).
    const privateSnap = await userRef.collection('private').get();
    if (privateSnap.size > 0) {
        const batch = db.batch();
        for (const d of privateSnap.docs) batch.delete(d.ref);
        await batch.commit();
    }

    // 3. Release the username reservation, if any.
    const username = userData && typeof userData.username === 'string' ? userData.username : null;
    if (username) {
        await db.doc(`usernames/${username}`).delete().catch(() => undefined);
    }

    // 4. Delete the user doc itself.
    await userRef.delete();

    // 5. Wipe the avatar folder in Storage. Best-effort — failures don't
    //    block deletion of identity records.
    try {
        const bucket = getStorage().bucket();
        await bucket.deleteFiles({ prefix: `avatars/${uid}/` });
    } catch (err) {
        console.warn('Avatar storage cleanup failed', err);
    }

    // 6. Delete the auth account last. After this the client's auth state
    //    becomes invalid; the UI signs out and redirects.
    try {
        await getAuth().deleteUser(uid);
    } catch (err) {
        console.error('Auth user deletion failed', err);
        throw new HttpsError(
            'internal',
            'Profile data was removed but the auth account could not be deleted. Contact support.',
        );
    }

    return { ok: true };
});

/**
 * Self-service data export.
 *
 * Returns the requesting user's owned records as a single JSON object.
 * Includes: profile, private contact, username, trip memberships, the
 * user's own gallery uploads / expenses / payments / follow relationships.
 * Does NOT include image binaries (URLs only) or notifications.
 *
 * Designed for browser-side download — keeps response under a few MB
 * for typical accounts. minInstances: 0 since exports are infrequent.
 */
export const exportUserData = onCall({ minInstances: 0 }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const exportPayload: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        uid,
        email: req.auth?.token?.email ?? null,
    };

    // 1. Public user doc
    const userSnap = await db.doc(`users/${uid}`).get();
    exportPayload.profile = userSnap.exists ? userSnap.data() : null;

    // 2. Private contact subcollection
    const privateSnap = await db.collection(`users/${uid}/private`).get();
    exportPayload.privateContact = privateSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 3. Username reservation (looked up via the user doc)
    const username = userSnap.exists ? (userSnap.data()?.username as string | undefined) : undefined;
    if (username) {
        const usernameSnap = await db.doc(`usernames/${username}`).get();
        exportPayload.username = usernameSnap.exists
            ? { handle: usernameSnap.id, ...usernameSnap.data() }
            : null;
    } else {
        exportPayload.username = null;
    }

    // 4. Trip memberships (full trip docs the user is a member of)
    const tripsSnap = await db.collection('trips')
        .where('members', 'array-contains', uid)
        .get();
    exportPayload.trips = tripsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tripIds = tripsSnap.docs.map(d => d.id);

    // 5. Gallery uploads in any of the user's trips that THIS user uploaded
    const galleryUploads: unknown[] = [];
    for (const tripId of tripIds) {
        const gSnap = await db.collection(`trips/${tripId}/gallery`)
            .where('uploadedBy', '==', uid)
            .get();
        for (const g of gSnap.docs) {
            galleryUploads.push({ tripId, id: g.id, ...g.data() });
        }
    }
    exportPayload.galleryUploads = galleryUploads;

    // 6. Expenses created or paid by the user (top-level collection)
    const expensesByCreator = await db.collection('expenses')
        .where('creatorId', '==', uid)
        .get();
    const expensesByPayer = await db.collection('expenses')
        .where('payerId', '==', uid)
        .get();
    const expenseMap = new Map<string, Record<string, unknown>>();
    for (const e of expensesByCreator.docs) expenseMap.set(e.id, { id: e.id, ...e.data() });
    for (const e of expensesByPayer.docs) expenseMap.set(e.id, { id: e.id, ...e.data() });
    exportPayload.expenses = Array.from(expenseMap.values());

    // 7. Payments where user is sender or receiver
    const paymentsFrom = await db.collection('payments')
        .where('fromUid', '==', uid)
        .get();
    const paymentsTo = await db.collection('payments')
        .where('toUid', '==', uid)
        .get();
    const paymentMap = new Map<string, Record<string, unknown>>();
    for (const p of paymentsFrom.docs) paymentMap.set(p.id, { id: p.id, ...p.data() });
    for (const p of paymentsTo.docs) paymentMap.set(p.id, { id: p.id, ...p.data() });
    exportPayload.payments = Array.from(paymentMap.values());

    // 8. Follow relationships (just the arrays — pointers, not the followed users' data)
    const data = userSnap.exists ? userSnap.data() ?? {} : {};
    exportPayload.follows = {
        following: Array.isArray(data.following) ? data.following : [],
        followers: Array.isArray(data.followers) ? data.followers : [],
        friends: Array.isArray(data.friends) ? data.friends : [],
    };

    return exportPayload;
});
