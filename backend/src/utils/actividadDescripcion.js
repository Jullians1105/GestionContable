// Convierte un registro crudo de audit_log en una frase legible para la pantalla "Actividad".
// El registro guarda identificadores (empresaId, procesoId…) y el servidor los traduce a nombres
// con el mapa `nombres` antes de llamar acá. Nunca se muestra el contenido de claves DIAN: de esas
// tablas solo se usa el tipo de acción y datos no sensibles (cantidad, éxito).

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MP_NAMES = {
  mp1: 'Facturación', mp2: 'Nómina', mp3: 'Nómina electrónica',
  mp4: 'Documentos contador - Pagos', mp6: 'Información tributaria', mp7: 'Producción y ventas',
};
const ESTADO_ITEM = { done: 'Realizado', na: 'No aplica', in_progress: 'En proceso', pending: 'Pendiente' };
const ESTADO_PAGO = { enviado: 'Enviado', pendiente: 'Pendiente', pagado: 'Pagado' };
const ESTADO_TAREA = { pending: 'pendiente', in_progress: 'en progreso', completed: 'completada' };
const ACCION = { CREATE: 'Creó', UPDATE: 'Actualizó', DELETE: 'Eliminó', READ: 'Consultó' };

const mesAnio = (c) => (c.mes && c.anio ? ` (${MESES[c.mes - 1]} ${c.anio})` : '');
const desdeMes = (anio, mes) => `${MESES[mes - 1]} ${anio}`;
const nota = (c) => (c.nota ? ` — nota: «${c.nota}»` : '');
const dinero = (v) => `$${Number(v).toLocaleString('es-CO')}`;

const EMPRESAS_MODULO = {
  fondo_empresas: ['fondoEmp', 'Fondo Emprender'],
  ext_empresas: ['extEmp', 'Empresas Externas'],
  ne_empresas: ['neEmp', 'Nómina Electrónica'],
};

// nombres: { fondoEmp, extEmp, neEmp, fondoProc, extProc, impuestos, tasks } — cada uno { [id]: nombre }
function describirEvento(row, nombres = {}) {
  const c = row.changes || {};
  const a = row.action;
  const n = (mapa, id) => (nombres[mapa] && nombres[mapa][id]) || null;
  const emp = (mapa, id) => n(mapa, id) || 'una empresa';

  switch (row.table_name) {
    case 'dian_clave':
      if (a === 'READ') return { area: 'Claves DIAN', texto: `Consultó claves DIAN${c.cantidad ? ` (${c.cantidad} empresas)` : ''}` };
      if (a === 'DELETE') return { area: 'Claves DIAN', texto: 'Quitó la clave DIAN de una empresa' };
      return { area: 'Claves DIAN', texto: 'Guardó o cambió la clave DIAN de una empresa' };
    case 'dian_token':
      return { area: 'Claves DIAN', texto: c.success === false ? 'Intentó generar un token DIAN (no se pudo)' : 'Generó un token DIAN' };
    case 'dian_deudas_revision':
      return { area: 'Deudas DIAN', texto: a === 'CREATE' ? 'Revisó las deudas DIAN de una empresa' : 'Envió un correo de deudas DIAN' };
    case 'dian_deudas_lote':
      return { area: 'Deudas DIAN', texto: `Revisó deudas DIAN en lote${c.total ? ` (${c.total} empresas)` : ''}` };
    case 'dian_deudas_detalle':
      return { area: 'Deudas DIAN', texto: 'Actualizó el estado de una deuda DIAN' };

    case 'empresas':
      if (a === 'CREATE') return { area: 'Directorio', texto: `Creó la empresa ${c.name ?? ''}`.trim() };
      if (a === 'DELETE') return { area: 'Directorio', texto: 'Eliminó una empresa del directorio' };
      if (c.fusionadaCon) return { area: 'Directorio', texto: 'Fusionó dos empresas del directorio' };
      return {
        area: 'Directorio',
        texto: `Editó la empresa ${c.name ?? ''}${c.nitAnterior !== undefined && c.nit !== c.nitAnterior ? ' (cambió el documento)' : ''}`.trim(),
      };

    case 'fondo_empresas':
    case 'ext_empresas':
    case 'ne_empresas': {
      const [mapa, area] = EMPRESAS_MODULO[row.table_name];
      const nombre = n(mapa, row.record_id);
      if (a === 'CREATE') return { area, texto: `Habilitó ${nombre ?? 'una empresa'} en ${area}` };
      if (a === 'DELETE') return { area, texto: `Quitó una empresa de ${area}` };
      if (c.vigenteDesdeAnio) return { area, texto: `Fijó el inicio de ${nombre ?? 'una empresa'} en ${area}: ${desdeMes(c.vigenteDesdeAnio, c.vigenteDesdeMes)}` };
      if (c.vigenteHastaAnio) return { area, texto: `Fijó el fin de ${nombre ?? 'una empresa'} en ${area}: ${desdeMes(c.vigenteHastaAnio, c.vigenteHastaMes)}` };
      return { area, texto: `Editó ${nombre ?? 'una empresa'} en ${area}` };
    }

    case 'fondo_checklist_items':
      return { area: 'Fondo Emprender', texto: `${emp('fondoEmp', c.empresaId)}: ${n('fondoProc', c.procesoId) ?? 'un proceso'} → ${ESTADO_ITEM[c.estado] ?? c.estado}${mesAnio(c)}${nota(c)}` };
    case 'ext_checklist_items':
      return { area: 'Empresas Externas', texto: `${emp('extEmp', c.empresaId)}: ${n('extProc', c.procesoId) ?? 'un proceso'} → ${ESTADO_ITEM[c.estado] ?? c.estado}${mesAnio(c)}${nota(c)}` };
    case 'ext_checklist_meses':
      return {
        area: 'Empresas Externas',
        texto: `${emp('extEmp', c.empresaId)}: registró ${c.resultadoTipo === 'perdida' ? 'una pérdida' : 'una utilidad'}${c.resultadoValor != null ? ` de ${dinero(c.resultadoValor)}` : ''}${mesAnio(c)}`,
      };
    case 'fondo_checklist_meses': {
      const que = c.tipo === 'nomina' ? 'nómina' : (c.tipo ?? '');
      if (c.enviado !== undefined) {
        return { area: 'Fondo Emprender', texto: `${emp('fondoEmp', c.empresaId)}: ${c.enviado ? 'marcó como enviada' : 'quitó la marca de enviada'} la información de ${que}${mesAnio(c)}` };
      }
      return { area: 'Fondo Emprender', texto: `${emp('fondoEmp', c.empresaId)}: ${c.confirmed ? 'confirmó' : 'quitó la confirmación de'} ${que}${mesAnio(c)}` };
    }
    case 'fondo_detalle_macroprocesos':
      return { area: 'Fondo Emprender', texto: `${emp('fondoEmp', c.empresaId)}: macroproceso ${MP_NAMES[c.macroId] ?? c.macroId} → ${ESTADO_ITEM[c.estado] ?? c.estado}` };
    case 'fondo_impuestos_items':
      return { area: 'Fondo Emprender', texto: `${emp('fondoEmp', c.empresaId)}: ${n('impuestos', c.impuestoId) ?? 'un impuesto'} → ${ESTADO_ITEM[c.estado] ?? c.estado}${mesAnio(c)}` };

    case 'fondo_pagos':
      if (c.monto !== undefined) return { area: 'Pagos', texto: `${emp('fondoEmp', c.empresaId)}: creó el pago${mesAnio(c)} por ${dinero(c.monto)}` };
      if (c.autorizado !== undefined) return { area: 'Pagos', texto: `${emp('fondoEmp', c.empresaId)}: ${c.autorizado ? 'autorizó' : 'quitó la autorización de'} el pago${mesAnio(c)}` };
      return { area: 'Pagos', texto: `${emp('fondoEmp', c.empresaId)}: pago → ${ESTADO_PAGO[c.estado] ?? c.estado}${nota(c)}` };
    case 'fondo_pagos_mes_actual':
      return { area: 'Pagos', texto: `${c.accion === 'retroceder' ? 'Retrocedió' : 'Habilitó'} el mes de pagos: ${desdeMes(c.nuevoAnio, c.nuevoMes)}` };

    case 'ne_meses': {
      let est = 'sin marcar';
      if (c.estado === 'presentada') est = 'Presentada';
      else if (c.estado === 'no_aplica') est = 'En espera';
      else if (c.autorizada) est = 'Autorizada';
      return {
        area: 'Nómina Electrónica',
        texto: `${emp('neEmp', c.empresaId)}: nómina electrónica → ${est}${mesAnio(c)}${nota(c)}${c.novedadNota ? ` — novedad: «${c.novedadNota}»` : ''}`,
      };
    }
    case 'ne_plazo_mes':
    case 'ne_plazo':
      return { area: 'Nómina Electrónica', texto: `Fijó la fecha límite de nómina electrónica${c.fechaLimite ? `: ${c.fechaLimite}` : ''}` };

    case 'fondo_procesos':
    case 'ext_procesos':
    case 'fondo_proceso_grupos':
    case 'ext_proceso_grupos': {
      const esFondo = row.table_name.startsWith('fondo');
      const area = esFondo ? 'Fondo Emprender' : 'Empresas Externas';
      const que = row.table_name.endsWith('grupos') ? 'el grupo' : 'el proceso';
      const nombre = c.name ?? n(esFondo ? 'fondoProc' : 'extProc', row.record_id);
      if (a === 'CREATE') return { area, texto: `Creó ${que} «${nombre ?? ''}»` };
      if (a === 'DELETE') return { area, texto: `Eliminó ${que}${nombre ? ` «${nombre}»` : ''}` };
      return { area, texto: `Editó ${que}${nombre ? ` «${nombre}»` : ''}` };
    }

    case 'tasks': {
      const titulo = c.title ?? n('tasks', row.record_id);
      const t = titulo ? ` «${titulo}»` : '';
      if (a === 'CREATE') return { area: 'Tareas', texto: `Creó la tarea${t}` };
      if (a === 'DELETE') return { area: 'Tareas', texto: `Eliminó una tarea${t}` };
      if (c.status && c.status.to) return { area: 'Tareas', texto: `Pasó la tarea${t} a ${ESTADO_TAREA[c.status.to] ?? c.status.to}` };
      return { area: 'Tareas', texto: `Editó la tarea${t}` };
    }

    default:
      return { area: 'Otros', texto: `${ACCION[a] ?? a} en ${row.table_name}` };
  }
}

module.exports = { describirEvento };
