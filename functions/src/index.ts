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
