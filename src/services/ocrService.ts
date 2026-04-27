import { httpsCallable, FunctionsError } from 'firebase/functions';
import { functions } from './firebase';

export interface ParsedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ScannedReceiptData {
  merchantName: string | null;
  transactionDate: string | null;
  currency: string | null;
  totalAmount: number | null;
  tip: number | null;
  tax: number | null;
  category: string | null;
  lineItems: ParsedLineItem[];
}

interface ScanRequest {
  imageBase64: string;
  mimeType: string;
}

export type ScanFailureReason =
  | 'quota-exceeded'   // user hit the daily 50-scan cap
  | 'rate-limited'     // Vertex AI is overloaded (429/503 after retries)
  | 'image-too-large'  // > 7 MB after base64
  | 'unauthenticated'  // no signed-in user
  | 'failed';          // anything else

export class ScanError extends Error {
  reason: ScanFailureReason;
  constructor(reason: ScanFailureReason, message: string) {
    super(message);
    this.reason = reason;
    this.name = 'ScanError';
  }
}

const scanReceiptCallable = httpsCallable<ScanRequest, ScannedReceiptData>(functions, 'scanReceipt');

const fileToBase64 = (file: File | Blob): Promise<{ data: string; mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      if (comma === -1) return reject(new Error('Invalid data URL'));
      resolve({ data: result.slice(comma + 1), mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });

const mapCallableError = (err: unknown): ScanError => {
  if (err instanceof FunctionsError) {
    const msg = err.message || 'Skanningen misslyckades.';
    switch (err.code) {
      case 'functions/resource-exhausted':
        // Server returns this for both quota-cap and Vertex rate limit.
        // Distinguish by the message text we set on the server.
        if (/dagens gräns/i.test(msg)) return new ScanError('quota-exceeded', msg);
        return new ScanError('rate-limited', msg);
      case 'functions/unauthenticated':
        return new ScanError('unauthenticated', 'Du måste vara inloggad för att skanna kvitton.');
      case 'functions/invalid-argument':
        if (/too large/i.test(msg)) return new ScanError('image-too-large', 'Bilden är för stor. Prova en mindre.');
        return new ScanError('failed', msg);
      case 'functions/unavailable':
        return new ScanError('rate-limited', msg);
      default:
        return new ScanError('failed', msg);
    }
  }
  return new ScanError('failed', err instanceof Error ? err.message : 'Okänt fel.');
};

export const scanReceipt = async (imageFile: File | Blob): Promise<ScannedReceiptData> => {
  let payload: { data: string; mimeType: string };
  try {
    payload = await fileToBase64(imageFile);
  } catch (e) {
    throw new ScanError('failed', e instanceof Error ? e.message : 'Kunde inte läsa bildfilen.');
  }
  try {
    const result = await scanReceiptCallable({ imageBase64: payload.data, mimeType: payload.mimeType });
    if (!result.data) {
      throw new ScanError('failed', 'Tomt svar från skanningstjänsten.');
    }
    return result.data;
  } catch (err) {
    if (err instanceof ScanError) throw err;
    console.error('OCR scan failed', err);
    throw mapCallableError(err);
  }
};
