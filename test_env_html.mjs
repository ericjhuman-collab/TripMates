import fs from 'fs';
const indexHtmlContent = fs.readFileSync('index.html', 'utf8');
console.log('It supports VITE variables if Vite is run.');
