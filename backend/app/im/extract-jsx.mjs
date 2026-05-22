import fs from 'fs';
const content = fs.readFileSync('app/im/page.tsx', 'utf8');

const returnMatch = content.match(/return \(\s*$/m);
if (!returnMatch) { console.log('No return found'); process.exit(1); }

const returnIndex = returnMatch.index;
let lineNum = 1;
for (let i = 0; i < returnIndex; i++) { if (content[i] === '\n') lineNum++; }
console.log('Return at line:', lineNum);

let depth = 0;
let inString = false;
let stringChar = '';
let jsxStart = returnIndex + 'return ('.length;
let jsxEnd = jsxStart;

for (let i = jsxStart; i < content.length; i++) {
  const char = content[i];
  const prev = content[i-1];
  if (inString) {
    if (char === stringChar && prev !== '\\') inString = false;
    continue;
  }
  if (char === '"' || char === "'" || char === '`') { inString = true; stringChar = char; continue; }
  if (char === '(' || char === '{' || char === '[') depth++;
  else if (char === ')' || char === '}' || char === ']') {
    depth--;
    if (depth < 0) { jsxEnd = i + 1; break; }
  }
}

let endLine = lineNum;
for (let i = returnIndex; i < jsxEnd; i++) { if (content[i] === '\n') endLine++; }
console.log('JSX end line:', endLine);
