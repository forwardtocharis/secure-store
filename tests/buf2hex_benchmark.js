import { buf2hex as buf2hex_original } from '../src/crypto/util.js';

const lut = new Array(256);
for (let i = 0; i < 256; i++) {
  lut[i] = i.toString(16).padStart(2, '0');
}

function buf2hex_new(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += lut[bytes[i]];
  }
  return hex;
}

const largeBuffer = new Uint8Array(1024 * 1024); // 1 MB
for (let i = 0; i < largeBuffer.length; i++) {
  largeBuffer[i] = Math.floor(Math.random() * 256);
}

// Warmup
buf2hex_original(largeBuffer);
buf2hex_new(largeBuffer);

let start = performance.now();
buf2hex_original(largeBuffer);
let end = performance.now();
console.log(`Original: ${end - start} ms`);

start = performance.now();
buf2hex_new(largeBuffer);
end = performance.now();
console.log(`New: ${end - start} ms`);
