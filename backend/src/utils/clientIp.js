// IP real de quien llama. Detrás del túnel de Cloudflare, `req.ip` es una IP interna de Docker (la
// del túnel/proxy), igual para todo el equipo: el bloqueo de login por IP contaba a todos juntos y
// la pantalla Actividad no podía mostrar desde dónde se entra. Cloudflare manda la IP real en
// `CF-Connecting-IP` (y nginx la reenvía tal cual). Solo se acepta si es una IP válida; sin ese
// encabezado (acceso directo desde la red de la oficina) se usa `req.ip`.
const net = require('net');

const clientIp = (req) => {
  const cf = req.headers?.['cf-connecting-ip'];
  if (typeof cf === 'string' && net.isIP(cf.trim())) return cf.trim();
  return req.ip || req.connection?.remoteAddress;
};

module.exports = { clientIp };
