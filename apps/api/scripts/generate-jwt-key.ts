import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const keyId = new Date().toISOString().slice(0, 10);

console.log(`JWT_KEY_ID=${keyId}`);
console.log(`JWT_PRIVATE_KEY=${Buffer.from(pem).toString('base64')}`);