const fs = require('fs');
const { encode } = require('@msgpack/msgpack');
const data = JSON.parse(fs.readFileSync('src/data/bible.json', 'utf-8'));
const packed = encode(data);
fs.writeFileSync('src/data/bible.bin', packed);
console.log(`bible.bin: ${(packed.length / 1024 / 1024).toFixed(1)}MB`);
