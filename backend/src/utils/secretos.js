// Cifrado simétrico (AES-256-GCM) para secretos que la página debe poder USAR más adelante — hoy,
// las claves DIAN de las empresas (ver services/dianDeudasService.js). No sirve para contraseñas de
// usuarios de la página: esas se guardan con hash (bcrypt), porque nunca hace falta recuperarlas.
//
// La llave vive en DIAN_CLAVES_KEY (32 bytes, en hex de 64 caracteres o base64). Sin ella, cifrar y
// descifrar fallan con un error claro: nunca se cae a "guardar en claro". Perder o cambiar la llave
// deja ilegibles las claves ya guardadas (habría que volver a cargarlas).
//
// Formato guardado: "v1:<iv>:<tag>:<cifrado>", todo en base64.
const crypto = require('crypto');

const VERSION = 'v1';

function obtenerLlave() {
  const bruta = (process.env.DIAN_CLAVES_KEY || '').trim();
  if (!bruta) {
    throw new Error('Falta DIAN_CLAVES_KEY en el entorno (32 bytes en hex o base64): sin ella no se pueden guardar ni leer claves DIAN.');
  }
  const llave = /^[0-9a-fA-F]{64}$/.test(bruta) ? Buffer.from(bruta, 'hex') : Buffer.from(bruta, 'base64');
  if (llave.length !== 32) {
    throw new Error('DIAN_CLAVES_KEY debe tener exactamente 32 bytes (64 caracteres hex, o base64 de 32 bytes).');
  }
  return llave;
}

const llaveConfigurada = () => {
  try { obtenerLlave(); return true; } catch { return false; }
};

function cifrar(texto) {
  if (typeof texto !== 'string' || texto === '') throw new Error('No hay nada que cifrar');
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', obtenerLlave(), iv);
  const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), cifrado.toString('base64')].join(':');
}

function descifrar(guardado) {
  const partes = typeof guardado === 'string' ? guardado.split(':') : [];
  if (partes.length !== 4 || partes[0] !== VERSION) throw new Error('Formato de secreto cifrado no reconocido');
  const [, iv, tag, cifrado] = partes.map((p, i) => (i === 0 ? p : Buffer.from(p, 'base64')));
  const descifrador = crypto.createDecipheriv('aes-256-gcm', obtenerLlave(), iv);
  descifrador.setAuthTag(tag);
  try {
    return Buffer.concat([descifrador.update(cifrado), descifrador.final()]).toString('utf8');
  } catch {
    throw new Error('No se pudo descifrar el secreto (¿cambió DIAN_CLAVES_KEY?)');
  }
}

module.exports = { cifrar, descifrar, llaveConfigurada };
