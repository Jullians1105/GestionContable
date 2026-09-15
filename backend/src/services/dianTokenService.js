// Generación de token de acceso a la DIAN (catalogo-vpfe.dian.gov.co/User/Login) — automatiza
// exactamente el flujo manual: Empresa > Representante legal > cédula + NIT (o Persona > solo
// cédula) > esperar Cloudflare > Entrar. La DIAN responde enviando un enlace de acceso al
// correo del RUT, válido 60 minutos — este servicio no "entra" a ninguna cuenta, solo dispara
// ese envío y confirma si la DIAN lo aceptó.
//
// Decisiones (encontradas probando en vivo, ver ESTADO_EMPRESAS_DIRECTORIO.md):
// - Chrome REAL (no el Chromium que trae Playwright) — mismo criterio que GestorDocs
//   (core/dian_service.py#open_chrome_cdp). El Chromium de Playwright trae banderas de
//   automatización que Cloudflare trata distinto a un navegador normal.
// - Un solo proceso de Chrome persistente (se lanza una vez, queda vivo) con un perfil también
//   persistente — cada solicitud abre su propia PESTAÑA nueva ahí adentro, nunca un Chrome
//   nuevo por solicitud (dos Chrome apuntando al mismo perfil chocan con un candado). El
//   perfil necesita una primera verificación manual de Cloudflare (una persona real haciendo
//   clic en "Verify you are human" una vez) — de ahí en adelante Cloudflare lo resuelve solo.
// - Cola con concurrencia máxima (DIAN_TOKEN_MAX_CONCURRENTE) — no por límite de Chrome (las
//   pestañas conviven bien) sino porque el servidor de producción es de recursos modestos.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME_PATH = process.env.DIAN_CHROME_PATH
  || (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome');
// Usa el mismo perfil que ya se calentó a mano con una verificación real de Cloudflare (ver
// ESTADO_EMPRESAS_DIRECTORIO.md) — uno nuevo pediría el checkbox otra vez. En producción, este
// path se define con la variable de entorno DIAN_CHROME_PROFILE_DIR apuntando al perfil que se
// caliente ahí (es específico de esa máquina/IP, no se puede copiar tal cual de acá).
//
// A PROPÓSITO fuera de backend/ (raíz del repo, no dentro de backend/src ni backend/): nodemon
// vigila todo backend/ para reiniciar solo, y si el perfil vive ahí adentro intenta vigilar
// hasta el archivo de cookies de Chrome (que Chrome tiene bloqueado mientras corre) — eso
// tumba a nodemon mismo con "EBUSY: resource busy or locked" (encontrado en vivo: mataba todo
// el backend sin ningún stack trace de la app, porque quien moría era nodemon, no el server).
const PERFIL_DIR = process.env.DIAN_CHROME_PROFILE_DIR || path.join(__dirname, '..', '..', '..', 'dian-perfil-real-chrome');
const CDP_PORT = parseInt(process.env.DIAN_CHROME_CDP_PORT || '9222', 10);
const MAX_CONCURRENTE = parseInt(process.env.DIAN_TOKEN_MAX_CONCURRENTE || '3', 10);
const CLOUDFLARE_TIMEOUT_MS = 120000;

let browserPromise = null; // promesa del browser conectado — un solo Chrome para todo el proceso
let enCurso = 0;
const cola = [];

function esperarCdp(host, port, timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const intentar = () => {
      const req = http.get({ host, port, path: '/json/version', timeout: 1000 }, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - t0 > timeoutMs) return reject(new Error('Chrome (CDP) nunca respondió'));
        setTimeout(intentar, 300);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - t0 > timeoutMs) reject(new Error('Chrome (CDP) nunca respondió'));
        else setTimeout(intentar, 300);
      });
    };
    intentar();
  });
}

// Lanza Chrome real una sola vez (o reutiliza el ya lanzado) — vive mientras viva el proceso
// del backend. Si Chrome se cierra solo (crash), el siguiente request lo vuelve a lanzar.
async function getBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (browser.isConnected()) return browser;
    } catch { /* se relanza abajo */ }
  }
  browserPromise = (async () => {
    fs.mkdirSync(PERFIL_DIR, { recursive: true });
    // Un Chrome anterior que se cerró mal (crash, contenedor reiniciado a la fuerza) puede
    // dejar el candado de perfil suelto — como este proceso nunca lanza dos Chrome a la vez
    // contra este perfil, es seguro limpiarlo antes de lanzar (probado en vivo: sin esto,
    // Chrome se niega a abrir con "profile appears to be in use by another process").
    for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      try { fs.rmSync(path.join(PERFIL_DIR, f), { force: true }); } catch { /* no existía */ }
    }
    if (!fs.existsSync(CHROME_PATH)) {
      throw new Error(`No se encontró Chrome en ${CHROME_PATH} — instálalo o define DIAN_CHROME_PATH`);
    }
    console.log(`[dianToken] lanzando Chrome (${CHROME_PATH}) con perfil ${PERFIL_DIR}`);
    const chromeProc = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PERFIL_DIR}`,
      '--no-first-run',
      // Requeridas corriendo dentro de un contenedor Docker — no aplican/no hacen falta en
      // Windows, pero no molesta dejarlas siempre:
      // --no-sandbox: el sandbox de Chrome necesita capacidades que el contenedor no tiene.
      // --disable-dev-shm-usage: el /dev/shm de 64MB por defecto de Docker hace que Chrome se
      // caiga ("Target crashed") a media navegación — mismo problema ya conocido acá con el
      // build de Vite (ver docker-compose.yml), esta vez en el renderer de Chrome. Con esta
      // bandera usa /tmp en cambio, evita la caída sin tener que agrandar el /dev/shm del
      // contenedor.
      ...(process.platform === 'win32' ? [] : ['--no-sandbox', '--disable-dev-shm-usage']),
    ], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    chromeProc.unref();
    // stderr de Chrome SÍ se registra (con prefijo) — sin esto, un fallo de arranque (perfil
    // bloqueado, falta de pantalla, etc.) solo se veía como "CDP nunca respondió", sin decir
    // por qué, y tocó depurarlo a ciegas la primera vez.
    chromeProc.stderr.on('data', (d) => console.error('[dianToken][chrome]', d.toString().trim()));
    await esperarCdp('127.0.0.1', CDP_PORT, 20000);
    console.log('[dianToken] CDP conectado');
    return chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  })();
  return browserPromise;
}

async function clicRobusto(locator) {
  try {
    await locator.click({ timeout: 8000 });
  } catch {
    await locator.evaluate((el) => el.click());
  }
}

const cloudflareResuelto = (page) => page.evaluate(() => {
  const el = document.querySelector('input[name="cf-turnstile-response"]');
  return !!(el && el.value && el.value.length > 20);
});

// Clic "a ciegas" en la casilla "Verify you are human" — probado en vivo (ver
// ESTADO_EMPRESAS_DIRECTORIO.md): el widget de Cloudflare vive en shadow DOM cerrado, así que
// NINGUNA búsqueda por texto/DOM lo encuentra nunca (confirmado con tiempo de sobra, 0 iframes
// detectados, 0 intentos exitosos por selector), aunque se vea perfecto en una captura de
// pantalla. La casilla SIEMPRE cae cerca de la esquina inferior derecha de la ventana — el
// clic va por coordenadas relativas al tamaño real de la ventana, sin intentar "detectarla"
// primero. No falla si Cloudflare ya se resolvió sola (el clic de más no hace nada).
async function clicCiegoCheckbox(page) {
  const { w, h } = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await page.mouse.click(w * 0.79, h * 0.96);
}

async function ejecutarFlujo({ tipo, nit, cedulaRepresentante }) {
  const browser = await getBrowser();
  // Justo despues de connectOverCDP puede que el contexto por defecto todavia no este listo
  // (carrera con el arranque de Chrome) — un reintento corto alcanza sin volver a lanzar nada.
  let context = browser.contexts()[0];
  if (!context) {
    await new Promise((r) => setTimeout(r, 1000));
    context = browser.contexts()[0] || (await browser.newContext());
  }
  const page = await context.newPage();
  try {
    console.log('[dianToken] navegando a la DIAN...');
    await page.goto('https://catalogo-vpfe.dian.gov.co/User/Login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[dianToken] pagina de login cargada, tipo=' + tipo);

    const textoInicial = await page.evaluate(() => document.body.innerText);
    if (/bloqueada por controles de seguridad/i.test(textoInicial)) {
      return { success: false, mensaje: 'La DIAN bloqueó la solicitud por controles de seguridad. No se reintentó automáticamente — revisar manualmente.' };
    }

    if (tipo === 'empresa') {
      await clicRobusto(page.locator('a.list-group-item', { hasText: 'Empresa' }).first());
      await page.waitForTimeout(600);
      await clicRobusto(page.locator('#legalRepresentative'));
      await page.waitForTimeout(600);
      await page.getByPlaceholder(/representante legal/i).fill(cedulaRepresentante);
      await page.getByPlaceholder(/nit de la empresa/i).fill(nit);
    } else {
      await clicRobusto(page.locator('a.list-group-item', { hasText: 'Persona' }).first());
      await page.waitForTimeout(600);
      // El campo de "Persona" usa el mismo tipo de identificacion/documento — se llena con el
      // primer input de texto visible del formulario (mismo patron que el flujo de Empresa).
      await page.locator('input[type="text"]:visible').first().fill(nit);
    }

    const tInicio = Date.now();
    let resuelto = false;
    let ultimoClic = 0;
    while (Date.now() - tInicio < CLOUDFLARE_TIMEOUT_MS) {
      if (await cloudflareResuelto(page)) { resuelto = true; break; }
      // Reintenta cada ~8s, no solo una vez — probado en vivo: la primera vez que se usa un
      // perfil, el primer clic puede caer antes de que el widget esté listo para recibirlo.
      if (Date.now() - ultimoClic > 8000) {
        await clicCiegoCheckbox(page);
        ultimoClic = Date.now();
      }
      await page.waitForTimeout(500);
    }

    if (!resuelto) {
      return { success: false, mensaje: `Cloudflare no validó la solicitud a tiempo (${CLOUDFLARE_TIMEOUT_MS / 1000}s). Intentar de nuevo más tarde.` };
    }

    await clicRobusto(page.getByRole('button', { name: 'Entrar' }));
    await page.waitForTimeout(3000);
    const textoFinal = await page.evaluate(() => document.body.innerText);

    const exito = /ruta de acceso/i.test(textoFinal) || /correo registrado/i.test(textoFinal);
    return {
      success: exito,
      mensaje: exito
        ? textoFinal.split('\n').find((l) => /ruta de acceso/i.test(l)) || 'Se envió el enlace de acceso al correo del RUT.'
        : (textoFinal.split('\n').find((l) => l.trim()) || 'La DIAN no confirmó el envío — revisar manualmente.'),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

// Cola simple con límite de concurrencia — no por límite de Chrome (las pestañas conviven
// bien entre sí) sino para no saturar un servidor de recursos modestos si caen muchas
// solicitudes de golpe.
function encolar(tarea) {
  return new Promise((resolve, reject) => {
    const correr = async () => {
      enCurso++;
      try {
        resolve(await tarea());
      } catch (err) {
        console.error('[dianToken] error:', err.message);
        reject(err);
      } finally {
        enCurso--;
        if (cola.length > 0) cola.shift()();
      }
    };
    if (enCurso < MAX_CONCURRENTE) correr();
    else cola.push(correr);
  });
}

async function generarToken({ tipo, nit, cedulaRepresentante }) {
  if (tipo === 'empresa' && (!nit || !cedulaRepresentante)) {
    throw new Error('Falta NIT de la empresa o cédula del representante legal');
  }
  if (tipo === 'natural' && !nit) {
    throw new Error('Falta el documento de la persona natural');
  }
  return encolar(() => ejecutarFlujo({ tipo, nit, cedulaRepresentante }));
}

module.exports = { generarToken };
