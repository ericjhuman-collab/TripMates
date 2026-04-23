import { parseReceiptText } from '../src/services/ocrService';

const receipts = [
  {
    name: "ICA Groceries",
    text: "ICA Supermarket\nKvitto\nMjölk 15.00\nBröd 25.00\nTotal 40.00 SEK\nTack för besöket!"
  },
  {
    name: "Systembolaget",
    text: "Systembolaget AB\nKvittens\nÖl 50.00\nVin 150.00\nSUMMA 200.00 SEK"
  },
  {
    name: "Uber Ride",
    text: "Uber Receipts\nYour ride with John\nTotal $15.50\nThank you for riding with Uber"
  },
  {
    name: "Hotel Stay",
    text: "Grand Hotel Stockholm\nRoom 204\nTotal 1500.00 SEK\nAtt betala 1500.00"
  },
  {
    name: "McDonalds",
    text: "McDonalds\nKvittens\nBig Mac Meny 89.00\nTotal 89.00 SEK"
  }
];

console.log("=== Testing Receipt Category Scanning ===");
receipts.forEach(r => {
  const result = parseReceiptText(r.text);
  console.log(`\nReceipt: ${r.name}`);
  console.log(`Detected Category: ${result.category || 'None'}`);
  console.log(`Detected Amount: ${result.totalAmount} ${result.currency || ''}`);
});
