import Tesseract from 'tesseract.js';

export interface ScannedReceiptData {
  totalAmount: number | null;
  currency: string | null;
  category: string | null;
}

export const scanReceipt = async (imageFile: File | Blob): Promise<ScannedReceiptData> => {
  try {
    const imageUrl = URL.createObjectURL(imageFile);
    
    // We use the English training data. It reads standard Latin characters and numbers 
    // fine for Swedish/European receipts without needing extra large downloads.
    const result = await Tesseract.recognize(
      imageUrl,
      'eng',
      {
         logger: m => console.log(m)
      }
    );
    
    const text = result.data.text;
    URL.revokeObjectURL(imageUrl);
    
    return parseReceiptText(text);
  } catch (error) {
    console.error("OCR Scanning failed", error);
    return { totalAmount: null, currency: null, category: null };
  }
}

export const parseReceiptText = (text: string): ScannedReceiptData => {
  const lines = text.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
  
  let bestAmount: number | null = null;
  let currencyCandidate: string | null = null;
  
  const fullTextLower = text.toLowerCase();

  // 1. Try to guess currency
  if (fullTextLower.includes('nok')) {
      currencyCandidate = 'NOK';
  } else if (fullTextLower.includes('dkk')) {
      currencyCandidate = 'DKK';
  } else if (fullTextLower.includes('sek')) {
      currencyCandidate = 'SEK';
  } else if (fullTextLower.includes('usd')) {
      currencyCandidate = 'USD';
  } else if (fullTextLower.includes('eur')) {
      currencyCandidate = 'EUR';
  } else if (fullTextLower.includes('gbp')) {
      currencyCandidate = 'GBP';
  } else if (fullTextLower.includes('$')) {
      currencyCandidate = 'USD';
  } else if (fullTextLower.includes('€')) {
      currencyCandidate = 'EUR';
  } else if (fullTextLower.includes('£')) {
      currencyCandidate = 'GBP';
  } else if (fullTextLower.includes('kr') || fullTextLower.includes('kr.')) {
      currencyCandidate = 'SEK'; // fallback
  }

  // 1.5 Try to guess category based on keywords
  let categoryCandidate: string | null = null;
  const categoryKeywords: Record<string, string[]> = {
    restaurant: ['restaurant', 'restaurang', 'cafe ', 'bistro', 'pizza', 'burger', 'sushi', 'max', 'mcdonalds', 'burger king', 'dinner', 'lunch'],
    groceries: [' ica ', 'coop', 'willys', 'hemköp', 'lidl', 'supermarket', 'market', 'matrebellen', 'city gross'],
    drinks: [' bar ', ' pub ', 'systembolaget', 'cocktail', ' öl ', ' vin ', 'beer', 'wine'],
    accommodation: ['hotel', 'hotell', 'hostel', 'airbnb', 'motel', 'resort', 'booking.com'],
    transport: ['taxi', 'uber', 'bolt', 'sj ', ' sl ', 'ticket', 'biljett', 'parking', 'parkering', 'bensin', 'shell', 'circle k', 'okq8', 'preem', 'flight', 'train', 'bus'],
    activities: ['museum', 'tour', 'cinema', 'inträde', 'biljett', 'activity', 'guide'],
    shopping: ['shop', 'store', 'mall', 'boutique', 'ikea', 'clothes', 'kläder', 'shoes', 'skor', 'zara', 'h&m']
  };

  const categoryScores: Record<string, number> = {};
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    let score = 0;
    keywords.forEach(kw => {
      const count = fullTextLower.split(kw).length - 1;
      score += count;
    });
    if (score > 0) categoryScores[category] = score;
  }
  
  if (Object.keys(categoryScores).length > 0) {
    const sorted = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]);
    categoryCandidate = sorted[0][0];
  }

  // 2. Look for keywords that often precede the total
  const totalKeywords = ['total', 'summa', 'att betala', 'amount', 'belopp'];
  const excludeKeywords = ['subtotal', 'moms', 'tax', 'netto'];
  
  // Regex to match things like 150.00, 150,00 or 1 500.00
  const numberRegex = /(?:^|\s)((?:\d{1,3}[\s.]?)*\d+[.,]\d{2})(?:\s|$|a-z)/i;
  
  for (let i = 0; i < lines.length; i++) {
     const line = lines[i];
     
     // Skip lines that have excluded keywords
     if (excludeKeywords.some(kw => line.includes(kw))) {
         continue;
     }

     const hasTotalKeyword = totalKeywords.some(kw => line.includes(kw));
     
     if (hasTotalKeyword) {
         // See if the number is on the same line
         const match = line.match(numberRegex);
         if (match) {
             const cleanNum = match[1].replace(/\s/g, '').replace(',', '.');
             const val = parseFloat(cleanNum);
             if (!isNaN(val) && val > 0) {
                 bestAmount = val;
                 break;
             }
         } else if (i + 1 < lines.length) {
             // The number might be on the next line
             const matchNext = lines[i+1].match(numberRegex);
             if (matchNext) {
                 const cleanNum = matchNext[1].replace(/\s/g, '').replace(',', '.');
                 const val = parseFloat(cleanNum);
                 if (!isNaN(val) && val > 0) {
                     bestAmount = val;
                     break;
                 }
             }
         }
     }
  }
  
  // 3. Fallback: If we couldn't confidently find a total keyword, grab the absolute largest valid amount near the bottom.
  if (!bestAmount) {
      let maxNum = 0;
      // Search bottom half of receipt
      const bottomLines = lines.slice(Math.floor(lines.length / 2));
      for (const line of bottomLines) {
          // If the line looks like typical extra noise, skip it
          if (excludeKeywords.some(kw => line.includes(kw))) continue;

          const match = line.match(numberRegex);
          if (match) {
               const cleanNum = match[1].replace(/\s/g, '').replace(',', '.');
               const val = parseFloat(cleanNum);
               if (!isNaN(val) && val > maxNum) {
                   maxNum = val;
               }
          }
      }
      if (maxNum > 0) {
          bestAmount = maxNum;
      }
  }

  return {
    totalAmount: bestAmount,
    currency: currencyCandidate,
    category: categoryCandidate
  };
}
