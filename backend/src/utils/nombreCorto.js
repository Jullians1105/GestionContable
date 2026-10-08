// Nombre para mostrar en la columna "Quién" de Actividad: solo el nombre de pila ("Laura").
// Si dos personas comparten nombre de pila ("Mauricio Amado" y "Mauricio Gutierrez") se agrega la inicial
// del apellido ("Mauricio A." y "Mauricio G."), y si aun así coinciden, el primer apellido completo.
// `usuarios`: [{ id, name }] — todos los usuarios, para que el nombre no cambie según quién trabajó ese día.
function nombresCortos(usuarios) {
  const partesDe = (nombre) => String(nombre ?? '').trim().split(/\s+/).filter(Boolean);
  const conteoNombre = new Map();
  usuarios.forEach((u) => {
    const k = (partesDe(u.name)[0] || '').toLowerCase();
    conteoNombre.set(k, (conteoNombre.get(k) || 0) + 1);
  });

  const conInicial = new Map();
  usuarios.forEach((u) => {
    const [pila = '', apellido] = partesDe(u.name);
    const repetido = (conteoNombre.get(pila.toLowerCase()) || 0) > 1 && apellido;
    conInicial.set(u.id, repetido ? `${pila} ${apellido[0].toUpperCase()}.` : pila);
  });

  const conteoCorto = new Map();
  conInicial.forEach((v) => conteoCorto.set(v.toLowerCase(), (conteoCorto.get(v.toLowerCase()) || 0) + 1));

  const resultado = new Map();
  usuarios.forEach((u) => {
    const corto = conInicial.get(u.id);
    const [pila = '', apellido] = partesDe(u.name);
    resultado.set(u.id, conteoCorto.get(corto.toLowerCase()) > 1 && apellido ? `${pila} ${apellido}` : corto);
  });
  return resultado;
}

module.exports = { nombresCortos };
