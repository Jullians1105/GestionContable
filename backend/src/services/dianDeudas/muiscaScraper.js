// Lectura (SOLO LECTURA) de las deudas vencidas de una empresa en MUISCA — automatiza lo que hoy se
// hace a mano: entrar con el usuario de la empresa, mirar el pastel "Sus obligaciones", abrir
// "Consulta obligación", leer cada deuda con intereses desde el cuadro de Liquidación y comparar con
// los recibos de pago ya pagados (Asuntos > Recibos de pago).
//
// Reglas que NO se negocian:
//   - Nunca se pulsa "sí" en el cuadro de liquidación: eso genera un recibo F490 y envía un correo.
//     El cuadro solo se lee y se cierra con su X.
//   - Un login fallido nunca se reintenta: la DIAN bloquea la cuenta del cliente tras varios intentos.
//   - Siempre se cierra la sesión en la DIAN (también si algo falla a mitad).
//
// Recibe un `context` de Playwright YA AISLADO (browser.newContext()): cada empresa tiene su propia
// sesión y cookies, así que dos revisiones simultáneas no se pisan. Hallazgos de la exploración en
// vivo (ver docs/ESTADO_... y la memoria del proyecto):
//   - MUISCA no pide captcha ni Cloudflare en este flujo.
//   - Los botones de imagen miden 0x0 para Playwright en algunos momentos → si el clic normal falla se
//     cae a un clic por DOM sobre el elemento (o su <a> padre).
//   - Esperar "Consolidado de obligaciones" antes de la lupa: sin eso hay una carrera con la carga.
const { parsearValor } = require('./logica');

const URL_LOGIN = 'https://muisca.dian.gov.co/WebIdentidadLogin/?ideRequest=eyJjbGllbnRJZCI6IldvMGFLQWxCN3ZSUF8xNmZyUEkxeDlacGhCRWEiLCJyZWRpcmVjdF91cmkiOiJodHRwOi8vbXVpc2NhLmRpYW4uZ292LmNvL0lkZW50aWRhZFJlc3RfTG9naW5GaWx0cm8vYXBpL3N0cy92MS9hdXRoL2NhbGxiYWNrP3JlZGlyZWN0X3VyaT1odHRwJTNBJTJGJTJGbXVpc2NhLmRpYW4uZ292LmNvJTJGV2ViQXJxdWl0ZWN0dXJhJTJGRGVmTG9naW4uZmFjZXMiLCJyZXNwb25zZVR5cGUiOiIiLCJzY29wZSI6IiIsInN0YXRlIjoiIiwibm9uY2UiOiIiLCJwYXJhbXMiOnsidGlwb1VzdWFyaW8iOiJtdWlzY2EifX0%3D';
const LOGIN_TIMEOUT_MS = 25000;
const MAX_PAGINAS_RECIBOS = 15;

// MUISCA navega con redirecciones y recargas parciales: una LECTURA hecha justo en medio de una navegación falla
// con "Execution context was destroyed" (visto en la revisión de 133 empresas: 6 fallos intermitentes). Para
// lecturas, se espera a que la página asiente y se repite (hasta 4 intentos). NO se usa para clics: repetir un
// clic que ya navegó lo haría dos veces.
const esCarreraDeNavegacion = (err) => /Execution context was destroyed|Cannot find context|navigation/i.test(err?.message ?? '');
async function leer(page, operacion) {
  for (let intento = 0; ; intento++) {
    try {
      return await operacion();
    } catch (err) {
      if (!esCarreraDeNavegacion(err) || intento >= 3) throw err;
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(700);
    }
  }
}

// Con DIAN_DEUDAS_DEBUG=1 deja en el log cada paso de la lectura (sin datos sensibles): sirve para ver dónde se atasca.
const traza = (...a) => { if (process.env.DIAN_DEUDAS_DEBUG) console.log('[muisca]', new Date().toISOString().slice(11, 23), ...a); };

const textoPagina = (page) => leer(page, () => page.evaluate(() => (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim()));

// Un clic por DOM que provoca una navegación puede devolver "Execution context was destroyed" aunque el clic SÍ
// se hizo (la navegación destruyó el contexto antes de la respuesta): ese error se da por buen clic.
async function evaluarClic(locator) {
  try {
    await locator.evaluate((el) => (el.closest('a') || el).click());
  } catch (err) {
    if (!esCarreraDeNavegacion(err)) throw err;
  }
}

// Clic normal; si Playwright no lo ve clicable (imagen 0x0, etc.) se hace el clic por DOM.
async function clic(locator, timeout = 6000) {
  try {
    await locator.click({ timeout });
  } catch {
    await evaluarClic(locator);
  }
}

// Clic por DOM directo, para botones de imagen que sabemos que Playwright ve sin tamaño.
const clicDom = (locator) => evaluarClic(locator);

// "Datos incorrectos o no encontrados. Verifique e intente de nuevo." es el mensaje REAL que da MUISCA con una
// clave (o documento) errados — visto en vivo; el resto cubre variantes (bloqueo, cuenta inactiva...).
const PATRON_CLAVE_INVALIDA = /datos incorrectos|no encontrados|(contrase[ñn]a|clave|credencial|usuario)[^.]{0,80}(incorrect|inv[aá]lid|err[oó]ne|no coincid|no es correct)|bloquead|n[uú]mero de intentos|cuenta (inactiva|deshabilitada)/i;

// Entra a MUISCA. tipo 'empresa': "A nombre de un tercero" (NIT + cédula del representante + clave);
// 'natural': "A nombre propio" (documento + clave). Devuelve { ok } o { ok:false, motivo, mensaje }
// con motivo 'clave' (la DIAN rechazó las credenciales) o 'error' (no se pudo saber por qué).
async function iniciarSesion(page, { tipo, nit, cedulaRepresentante, clave }) {
  await page.goto(URL_LOGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (tipo === 'empresa') {
    await page.getByText('A nombre de un tercero').first().click();
    await page.locator('input[name="numDocumentoOrg"]').fill(nit);
  }
  await page.locator('mat-select').first().click();
  await page.locator('mat-option', { hasText: /C[eé]dula de ciudadan/i }).first().click();
  await page.locator('input[name="numDocumento"]').fill(tipo === 'empresa' ? cedulaRepresentante : nit);
  await page.locator('input[name="password"]').fill(clave);
  await page.locator('mat-checkbox .mat-checkbox-inner-container').click();
  await page.locator('button:has-text("Ingresar")').click();

  const t0 = Date.now();
  while (Date.now() - t0 < LOGIN_TIMEOUT_MS) {
    if (/WebDashboard/.test(page.url())) return { ok: true };
    const visible = await page.evaluate(() => [...document.querySelectorAll('mat-error, [role="alert"], .mat-snack-bar-container, .alert, .error, simple-snack-bar')]
      .map((e) => e.innerText.trim()).filter(Boolean).join(' | ')).catch(() => '');
    if (visible && PATRON_CLAVE_INVALIDA.test(visible)) return { ok: false, motivo: 'clave', mensaje: visible.slice(0, 300) };
    await page.waitForTimeout(500);
  }
  const visible = await page.evaluate(() => [...document.querySelectorAll('mat-error, [role="alert"], .mat-snack-bar-container, .alert, .error, simple-snack-bar')]
    .map((e) => e.innerText.trim()).filter(Boolean).join(' | ')).catch(() => '');
  return { ok: false, motivo: 'error', mensaje: (visible || 'La DIAN no respondió al ingreso a tiempo.').slice(0, 300) };
}

async function cerrarSesion(page) {
  try {
    // En todas las pantallas el botón es una imagen/input con "cerrar" en el src.
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('img,input')]
        .find((e) => /btn_pie_cerrar|btn_cerrar/i.test(e.getAttribute('src') || '') && !/roll/i.test(e.getAttribute('src') || ''));
      if (el) (el.closest('a') || el).click();
    });
    await page.waitForTimeout(1500);
  } catch { /* si ya cayó la sesión o la página se cerró, no hay nada que cerrar */ }
}

// 'con_deuda' | 'al_dia' | 'desconocido' según la leyenda del pastel "Sus obligaciones": solo trae
// "Deuda vencida" cuando hay deuda. 'desconocido' (no cargó) NO se toma como "al día": se pasa a la
// consulta, que es la fuente exacta.
async function leerPastel(page) {
  for (let i = 0; i < 12; i++) {
    const texto = await textoPagina(page);
    const ini = texto.indexOf('Sus obligaciones');
    if (ini >= 0) {
      const fin = texto.indexOf('Destacados', ini);
      const segmento = texto.slice(ini, fin > ini ? fin : ini + 200);
      if (/Deuda (no )?vencida/i.test(segmento)) return 'con_deuda';   // vencida o no vencida: hay algo que mirar
      if (/Al d[ií]a|Con excedente|Saldo a favor/i.test(segmento)) return 'al_dia';
    }
    await page.waitForTimeout(500);
  }
  return 'desconocido';
}

// Texto de los números de obligación que muestra ahora el listado de detalle (para saber si ya cambió).
const numerosListados = (page) => leer(page, () => page.locator('input[id$="btnCosultaCorreo"]')
  .evaluateAll((els) => els.map((e) => (e.closest('tr')?.innerText ?? '').trim().split(/\s+/)[0]).sort().join(',')));

// Marca (atributo data-gc-saldo) la fila INTERNA de la tabla consolidada que empieza por "DEUDA VENCIDA" o por
// "DEUDA NO VENCIDA" y devuelve su cantidad (null si no existe). Se hace en el navegador porque filtrar por
// texto desde Playwright no sirve acá: el texto de la celda trae también el del tooltip oculto.
function marcarFilaSaldo(page, vencida) {
  return leer(page, () => page.evaluate((esVencida) => {
    const inicio = esVencida ? /^DEUDA VENCIDA(?!\S)/i : /^DEUDA NO VENCIDA(?!\S)/i;
    document.querySelectorAll('[data-gc-saldo]').forEach((e) => e.removeAttribute('data-gc-saldo'));
    const tr = [...document.querySelectorAll('tr')].find((t) => !t.querySelector('tr') && inicio.test(t.innerText.trim()));
    if (!tr) return null;
    tr.setAttribute('data-gc-saldo', esVencida ? 'vencida' : 'no-vencida');
    const celdas = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
    return parseInt((celdas[1] ?? '').replace(/\D/g, ''), 10) || 0;
  }, vencida));
}

// "Consulta obligación" tiene una fila DEUDA VENCIDA y otra DEUDA NO VENCIDA (esta última: obligaciones aún
// dentro del plazo, sin intereses). Para cada una con cantidad > 0 se abre su detalle y se leen las
// obligaciones (ver leerObligaciones). Devuelve todas, cada una con `vencida: true|false`.
async function leerDeudas(page) {
  await clic(page.getByText('Consulta obligación').first());
  await page.waitForSelector('text=Consolidado de obligaciones', { timeout: 20000 });

  const deudas = [];
  for (const vencida of [true, false]) {
    const cantidad = await marcarFilaSaldo(page, vencida);
    if (!cantidad) continue;

    const antes = deudas.length > 0 ? await numerosListados(page) : null;
    await clic(page.locator('[data-gc-saldo] input[type=image], [data-gc-saldo] img, [data-gc-saldo] a').last());
    await page.waitForSelector('input[id$="btnCosultaCorreo"]', { state: 'attached', timeout: 15000 });
    // El listado se refresca por Ajax: antes de leer, esperar a que cambie respecto al del tipo anterior.
    for (let i = 0; i < 16 && antes !== null && (await numerosListados(page)) === antes; i++) await page.waitForTimeout(500);

    for (const o of await leerObligaciones(page)) {
      if (!deudas.some((d) => d.obligacion === o.obligacion)) deudas.push({ ...o, vencida });
    }
  }
  return deudas;
}

// Cierra un aviso/diálogo de la DIAN con su X (nunca con "sí"/"no"). Si no hay una X visible, falla en vez de
// arriesgarse a confirmar algo.
async function cerrarAviso(page) {
  const cerro = await leer(page, () => page.evaluate(() => {
    const x = [...document.querySelectorAll('input[id*="btnCerrar"]')].find((el) => el.offsetParent !== null);
    if (!x) return false;
    (x.closest('a') || x).click();
    return true;
  }));
  if (!cerro) throw new Error('No encontré cómo cerrar el aviso de la DIAN sin confirmarlo');
}

// Aviso que MUISCA muestra ANTES del cuadro de Liquidación para algunas obligaciones (Impuesto Unificado y
// consumo del régimen SIMPLE): "Información importante: esta opción le permite realizar únicamente el pago por la
// obligación seleccionada ... ¿Desea continuar?" con sí/no. El usuario autorizó confirmar ESTE aviso (solo
// continúa hacia el cuadro de Liquidación, que luego se lee y se cierra con la X). Reglas, para no tocar nada más:
//   - se pulsa únicamente el botón "sí" de ESTE aviso (btnSi2), y solo si su texto es el esperado;
//   - lo siguiente debe ser el cuadro de Liquidación ("Total Deuda"); si aparece cualquier otra cosa, se cierra
//     con la X y se falla, sin pulsar nada más;
//   - el "sí" del cuadro de Liquidación (el que genera el recibo F490 y manda el correo) JAMÁS se pulsa.
async function confirmarAvisoSimple(page) {
  const esElAviso = await leer(page, () => page.evaluate(() => /realizar [uú]nicamente el pago por la obligaci[oó]n seleccionada/i.test(document.body?.innerText ?? '')));
  if (!esElAviso) {
    await cerrarAviso(page).catch(() => {});
    throw new Error('Apareció un aviso de la DIAN que no es el conocido: no se confirmó y se cerró');
  }
  await clicDom(page.locator('input[id$="btnSi2"]').first());
}

// Cada obligación del listado abierto, con su valor SIN intereses (de la tabla) y el total CON intereses a la fecha
// de hoy (del cuadro de Liquidación, que solo se lee y se cierra con la X — nunca el "sí" que genera el recibo).
async function leerObligaciones(page) {
  const botones = page.locator('input[id$="btnCosultaCorreo"]');
  const n = await botones.count();
  const deudas = [];
  for (let i = 0; i < n; i++) {
    const fila = await leer(page, () => botones.nth(i).evaluate((e) => e.closest('tr').innerText.replace(/\s+/g, ' ').trim()));
    const [obligacion, , , valorBaseTxt] = fila.split(' ');
    // Al pulsar "$" sale el cuadro de Liquidación (con "Total Deuda") o, para algunas obligaciones, primero el aviso
    // "Información importante ... ¿Desea continuar?" (ver confirmarAvisoSimple).
    // Sin devolver un "handle" desde waitForFunction: tras una recarga de la página queda inválido y se cuelga.
    const esperarCuadro = async () => {
      await page.waitForFunction(() => /Total Deuda|Informaci[oó]n importante/i.test(document.body?.innerText ?? ''), null, { timeout: 15000 });
      return leer(page, () => page.evaluate(() => (/Total Deuda/i.test(document.body?.innerText ?? '') ? 'cuadro' : 'aviso')));
    };
    traza(`obligación ${obligacion}: clic en $`);
    await clicDom(botones.nth(i));
    // A veces el cuadro no abre al primer clic (visto en vivo): se repite UNA vez. Abrirlo dos veces no hace
    // daño: solo se lee y se cierra con la X.
    let que;
    try { que = await esperarCuadro(); } catch { await clicDom(botones.nth(i)); que = await esperarCuadro(); }

    traza(`obligación ${obligacion}: apareció ${que}`);
    if (que === 'aviso') {
      await confirmarAvisoSimple(page);
      traza(`obligación ${obligacion}: confirmado el aviso, espero el cuadro`);
      // Tras el "sí" la página se recarga: lo que debe aparecer es el cuadro de Liquidación y nada más.
      const aparecio = await page.waitForFunction(() => /Total Deuda/i.test(document.body?.innerText ?? ''), null, { timeout: 15000 }).then(() => true, () => false);
      if (!aparecio) {
        await cerrarAviso(page).catch(() => {});
        throw new Error(`Tras confirmar el aviso de la obligación ${obligacion} no apareció el cuadro de Liquidación: se cerró sin tocar nada más`);
      }
      traza(`obligación ${obligacion}: apareció el cuadro tras el aviso`);
    }

    const modal = await leer(page, () => page.evaluate(() => {
      const t = (document.body?.innerText ?? '').replace(/\s+/g, ' ');
      return t.slice(Math.max(t.indexOf('No. Obligación'), 0), t.indexOf('No. Obligación') + 400);
    }));
    traza(`obligación ${obligacion}: cuadro leído, cierro con la X`);
    await clicDom(page.locator('input[id$="btnCerrarLiquidacion"]').first()); // la X, jamás "sí"
    await page.waitForTimeout(800);
    traza(`obligación ${obligacion}: listo`);

    const tipo = /Tipo Obligaci[oó]n\s+(.+?)\s+A[ñn]o Gravable/i.exec(modal)?.[1];
    const anio = /A[ñn]o Gravable\s+(\d{4})/i.exec(modal)?.[1];
    const periodo = /Per[ií]odo\s+(\d{1,2})/i.exec(modal)?.[1];
    const total = parsearValor(/Total Deuda \(\$\)\s+([\d.,]+)/i.exec(modal)?.[1]);
    const valorBase = parsearValor(valorBaseTxt);
    if (!tipo || !anio || !periodo || total == null || valorBase == null) {
      throw new Error(`No se pudo leer el cuadro de liquidación de la obligación ${obligacion}`);
    }
    deudas.push({
      tipoObligacion: tipo, anio: Number(anio), periodo: Number(periodo), obligacion,
      valorBase, valorTotal: total,
    });
  }
  return deudas;
}

const FILA_RECIBO = /^(\d{8,})\s+(.+?)\s+(\d{4})\s+(\d{1,2})\s+(\d{8})\s+([\d.,]+)$/;

async function leerFilasRecibos(page) {
  const filas = await leer(page, () => page.evaluate(() => [...document.querySelectorAll('tr')]
    .map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter((t) => /^\d{8,}\s/.test(t))));
  const recibos = filas.map((t) => FILA_RECIBO.exec(t)).filter(Boolean).map((m) => ({
    numero: m[1], concepto: m[2], anio: Number(m[3]), periodo: Number(m[4]), fechaLimite: m[5], total: parsearValor(m[6]),
  }));
  // Un recibo con valor ilegible no se puede comparar: mejor fallar que dar por "no pagada" una deuda ya pagada.
  if (recibos.some((r) => r.total == null)) throw new Error('Formato numérico inesperado en los recibos pagados');
  return recibos;
}

// Asuntos > Recibos de pago > Consulta de Recibos de pago, filtrando Pagado + Electrónico por cada
// año con deuda (así casi nunca hay más de una página de resultados) y recorriendo las páginas.
async function leerRecibosPagados(page, anios) {
  traza('recibos: abro Asuntos');
  await clicDom(page.locator('a[id$="frmCabeceraUsuario:btnNormal"]').first());
  await page.waitForURL(/WebGestionexpediente/, { timeout: 20000 });
  await page.getByText('Recibos de pago', { exact: true }).first().click({ timeout: 10000 });
  await page.getByText(/Consulta de Recibos de\s+pago/i).first().click({ timeout: 10000 });
  await page.waitForSelector('input[type=radio][value="PGDO"]', { timeout: 15000 });
  traza('recibos: formulario listo');

  const recibos = new Map(); // por número de documento, por si una página se repite
  for (const anio of anios) {
    await page.locator('input[type=radio][value="PGDO"]').evaluate((e) => e.click());   // Pagado
    await page.locator('input[type=radio][value="3"]').evaluate((e) => e.click());      // Electrónico
    await page.locator('input[id$="txtAnio"]').fill(String(anio));
    await clicDom(page.locator('input[id$="btnBuscarRecibos"]'));
    await page.waitForTimeout(3000);

    let primeraAnterior = null;
    for (let pagina = 0; pagina < MAX_PAGINAS_RECIBOS; pagina++) {
      const filas = await leerFilasRecibos(page);
      traza(`recibos: año ${anio}, página ${pagina + 1}: ${filas.length} filas`);
      for (const f of filas) recibos.set(f.numero, f);
      const primera = filas[0]?.numero ?? null;
      if (pagina > 0 && primera === primeraAnterior) break; // el "Siguiente" no avanzó: ya era la última
      primeraAnterior = primera;
      const siguiente = page.locator('input[id$="btnSiguiente"]');
      if (await siguiente.count() === 0) break;
      const paginas = await page.locator('select[id$="lblPaginaActual"] option').count();
      if (paginas > 0 && pagina + 1 >= paginas) break;
      await clicDom(siguiente.first());
      await page.waitForTimeout(1500);
    }
  }
  return [...recibos.values()];
}

// Revisión completa de una empresa. Devuelve:
//   { login: { ok:false, motivo, mensaje } }                       — no se pudo entrar
//   { login:{ok:true}, hayDeuda:false }                            — al día (pastel o consulta)
//   { login:{ok:true}, hayDeuda:true, deudas:[...], recibos:[...] }
async function consultarEmpresa(context, credenciales) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    const login = await iniciarSesion(page, credenciales);
    if (!login.ok) return { login };

    const pastel = await leerPastel(page);
    if (pastel === 'al_dia') return { login, hayDeuda: false };

    const deudas = await leerDeudas(page);
    if (deudas.length === 0) return { login, hayDeuda: false };

    const anios = [...new Set(deudas.map((d) => d.anio))].sort();
    const recibos = await leerRecibosPagados(page, anios);
    return { login, hayDeuda: true, deudas, recibos };
  } finally {
    await cerrarSesion(page);
    await page.close().catch(() => {});
  }
}

// Solo comprueba que la clave entra (para validarla antes de guardarla).
async function verificarClave(context, credenciales) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    return await iniciarSesion(page, credenciales);
  } finally {
    await cerrarSesion(page);
    await page.close().catch(() => {});
  }
}

module.exports = { consultarEmpresa, verificarClave, FILA_RECIBO, PATRON_CLAVE_INVALIDA, _internos: { iniciarSesion, cerrarSesion, leerRecibosPagados, leerPastel, leerDeudas, leer, evaluarClic, esCarreraDeNavegacion } };
