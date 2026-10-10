// ════════════════════════════════════════════════════════════════════
//  Trampantojo — configuración
// ════════════════════════════════════════════════════════════════════

/** Fecha (AAAA-MM-DD, hora local) que corresponde al día 1. */
const FECHA_INICIO = '2026-10-01';

/** Respuestas que se pueden comprobar en cada reto antes de darlo por fallado. */
const INTENTOS = 3;

const URL_PISTAS = 'trampantojo-pistas.json';
const CLAVE = 'trampantojo:v1';

// ════════════════════════════════════════════════════════════════════

import { normalizar, normalizarLetra, letras, segmentar, escapar } from './texto.js';
import { analizar, tipoDe, TIPOS, Escenario } from './desmontaje.js';

const $ = (id) => document.getElementById(id);
const DIA_MS = 86400000;

let datos = null;
let estado = null;
let partida = null;
let prueba = null; // número de día forzado con ?dia=N (no guarda nada)
const escenario = new Escenario($('j-escenario'));

// ── Almacenamiento (todo envuelto: el juego sigue aunque falle) ─────

const almacen = {
  leer(clave) { try { return localStorage.getItem(clave); } catch { return null; } },
  escribir(clave, valor) { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } },
  borrar(clave) { try { localStorage.removeItem(clave); } catch { /* nada */ } },
};

function estadoVacio() {
  return { tutorial: false, historial: {}, racha: 0, mejorRacha: 0, enCurso: null };
}

function cargarEstado() {
  try {
    const g = JSON.parse(almacen.leer(CLAVE) || 'null');
    if (g && typeof g === 'object') return { ...estadoVacio(), ...g, historial: g.historial || {} };
  } catch { /* datos corruptos: empezamos de cero */ }
  return estadoVacio();
}

function guardar() {
  if (prueba) return;
  try { almacen.escribir(CLAVE, JSON.stringify(estado)); } catch { /* nada */ }
}

// ── Calendario ──────────────────────────────────────────────────────

const utc = (f) => Date.UTC(f.getFullYear(), f.getMonth(), f.getDate());
function inicioUTC() {
  const [a, m, d] = FECHA_INICIO.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}
const numeroDeHoy = () => Math.max(1, Math.floor((utc(new Date()) - inicioUTC()) / DIA_MS) + 1);
function fechaDe(n) {
  const t = new Date(inicioUTC() + (n - 1) * DIA_MS);
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}
const isoLocal = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
const pistasDe = (n) => datos.dias[(n - 1) % datos.dias.length].pistas;
/** Ayudas usadas en los retos ya resueltos del día n, si está a medias. */
const hechasDe = (n) => (estado.enCurso?.n === n ? estado.enCurso.hechas || [] : []);
/** Qué retos ya terminados del día n se fallaron (sin intentos), si está a medias. */
const falladasDe = (n) => (estado.enCurso?.n === n ? estado.enCurso.falladas || [] : []);
const diaActual = () => prueba || numeroDeHoy();

function rachaHasta(n) {
  let r = 0;
  while (n >= 1 && estado.historial[n]) { r++; n--; }
  return r;
}
const rachaActual = (hoy) => (estado.historial[hoy] ? rachaHasta(hoy) : rachaHasta(hoy - 1));

// ── Utilidades de interfaz ──────────────────────────────────────────

const q = (x) => `«${escapar(x)}»`;
const lista = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function mostrar(id) {
  document.querySelectorAll('.pantalla').forEach((s) => { s.hidden = s.id !== id; });
  if (id !== 'p-final') detenerCuenta();
  window.scrollTo(0, 0);
  $(id).querySelector('[data-foco]')?.focus({ preventScroll: true });
}

// Esperas que el botón «Saltar animación» puede acortar.
let saltando = false;
let turno = 0;
const pendientes = new Set();
function espera(ms) {
  return new Promise((resolver) => {
    if (saltando) return resolver();
    const fin = () => { clearTimeout(t); pendientes.delete(fin); resolver(); };
    const t = setTimeout(fin, ms);
    pendientes.add(fin);
  });
}

function dificultad(n) {
  const el = $('j-dificultad');
  if (!n) { el.replaceChildren(); return; }
  el.setAttribute('aria-label', `Dificultad ${n} de 5`);
  el.innerHTML = `<span aria-hidden="true">${'✦'.repeat(n)}<span class="apagada">${'✦'.repeat(5 - n)}</span></span>`;
}

// ── Partida ─────────────────────────────────────────────────────────

const entrada = $('j-entrada');
const seccion = $('p-juego');

function jugar(p, { modo, n = null, indice = 0, repetir = false }) {
  turno++;
  const sol = letras(p.respuesta);
  partida = {
    p, modo, n, indice, repetir, sol,
    analisis: analizar(p),
    ayudas: 0,
    fallos: 0,
    celdas: sol.map(() => ({ l: '', fija: false })),
    cursor: 0,
    resuelta: false,
    fallada: false,
  };

  // Recupera una partida a medias del mismo reto.
  const enCurso = estado.enCurso;
  if (modo === 'diaria' && !repetir && enCurso?.n === n && hechasDe(n).length === indice) {
    partida.ayudas = enCurso.ayudas || 0;
    partida.fallos = Math.min(enCurso.fallos || 0, INTENTOS - 1);
    for (const i of enCurso.fijas || []) if (sol[i]) partida.celdas[i] = { l: sol[i], fija: true };
    const libres = Array.from(enCurso.letras || '');
    partida.celdas.filter((c) => !c.fija).forEach((c, k) => { c.l = (libres[k] || '').trim(); });
  }
  // El cursor empieza en la primera casilla vacía (o en la última libre, si están todas llenas).
  const vacia = partida.celdas.findIndex((c) => !c.fija && !c.l);
  situar(vacia >= 0 ? vacia : partida.celdas.length - 1, -1);

  // Cabecera
  if (modo === 'tutorial') {
    $('j-etiqueta').textContent = `Tutorial · ${indice + 1} de ${datos.tutorial.length}`;
    dificultad(0);
  } else {
    $('j-etiqueta').textContent = `Reto ${indice + 1} de ${pistasDe(n).length} · n.º ${n}${prueba ? ' · prueba' : ''}`;
    dificultad(p.dificultad);
  }

  // Pista con sus segmentos marcados (invisibles hasta que se activan).
  const pistaEl = $('j-pista');
  pistaEl.replaceChildren();
  for (const s of segmentar(p.pista, partida.analisis.rangos)) {
    if (!s.tipo) { pistaEl.append(s.texto); continue; }
    const span = document.createElement('span');
    span.className = `seg seg-${s.tipo}`;
    span.textContent = s.texto;
    pistaEl.append(span);
  }
  const lon = document.createElement('span');
  lon.className = 'longitud';
  lon.textContent = `(${p.longitud || sol.length})`;
  pistaEl.append(' ', lon);

  // En el tutorial, el botón para saltarlo
  $('j-aviso').hidden = modo !== 'tutorial';

  // Nota del tutorial (y, fuera de él, el acceso al tutorial al pie)
  $('j-pie').hidden = modo === 'tutorial';
  const nota = $('j-nota');
  nota.hidden = modo !== 'tutorial' || !p.explicacion;
  if (!nota.hidden) {
    $('j-nota-titulo').textContent = `Truco: ${tipoDe(p.tipo).nombre}`;
    $('j-nota-texto').textContent = p.explicacion;
  }

  seccion.classList.remove('ver-def', 'ver-ind', 'ver-mat', 'desmontando', 'resuelta');
  $('j-tipo').hidden = true;
  $('j-zona').hidden = false;
  $('j-desmontaje').hidden = true;
  $('j-mensaje').textContent = '';
  entrada.disabled = false;
  entrada.value = previo = '';
  $('j-ayuda-lectura').textContent = `Respuesta de ${plural(sol.length, 'letra', 'letras')}.`;
  entrada.setAttribute('aria-label', `Tu respuesta, ${plural(sol.length, 'letra', 'letras')}`);

  if (partida.ayudas >= 1) seccion.classList.add('ver-def');
  if (partida.ayudas >= 2) revelarTipo();

  mostrar('p-juego');
  pintarCasillas();
  rotularAyuda();

  if (repetir) {
    partida.resuelta = true;
    partida.celdas = sol.map((l) => ({ l, fija: false }));
    pintarCasillas();
    $('j-zona').hidden = true;
    desmontar();
  }
}

/** Primera casilla no destapada desde `desde` en la dirección `paso` (±1), o -1. */
function libreDesde(desde, paso) {
  for (let i = desde; i >= 0 && i < partida.celdas.length; i += paso) if (!partida.celdas[i].fija) return i;
  return -1;
}

/** Pone el cursor en la casilla `i` o, si está destapada, en la libre más cercana (primero hacia `paso`). */
function situar(i, paso = 1) {
  let c = libreDesde(i, paso);
  if (c < 0) c = libreDesde(i, -paso);
  partida.cursor = c;
}

function pintarCasillas() {
  if (!partida) return;
  const cont = $('j-casillas');
  const n = partida.celdas.length;
  if (cont.children.length !== n) {
    cont.replaceChildren(...partida.celdas.map(() => document.createElement('span')));
  }
  const ancho = cont.parentElement.clientWidth || 340;
  const gap = n > 7 ? 5 : 7;
  cont.style.setProperty('--gap', `${gap}px`);
  cont.style.setProperty('--tam', `${Math.min(54, Math.floor((ancho - gap * (n - 1)) / n))}px`);

  const enfocada = document.activeElement === entrada;
  const activa = partida.cursor;
  partida.celdas.forEach((c, i) => {
    const el = cont.children[i];
    el.textContent = c.l;
    el.className = 'casilla';
    el.style.setProperty('--i', i);
    if (c.l) el.classList.add('llena');
    if (c.fija) el.classList.add('fija');
    if (enfocada && i === activa && !partida.resuelta) el.classList.add('activa');
    if (partida.resuelta) el.classList.add(partida.fallada ? 'fallo' : 'acierto');
  });
}

// El campo oculto solo recoge lo que se teclea: cada letra nueva se escribe en la casilla del
// cursor y el campo se vacía. Mientras dura una composición (tildes, teclados de Android) no se
// toca su valor: se compara con el anterior para saber qué letras han entrado o salido.
let componiendo = false;
let previo = '';

function escribirLetra(l) {
  const c = partida.cursor;
  if (c < 0) return;
  partida.celdas[c].l = l;
  const sig = libreDesde(c + 1, 1);
  if (sig >= 0) partida.cursor = sig;
}

function borrarLetra() {
  const c = partida.cursor;
  if (c < 0) return;
  if (partida.celdas[c].l) { partida.celdas[c].l = ''; return; }
  const ant = libreDesde(c - 1, -1);
  if (ant >= 0) { partida.cursor = ant; partida.celdas[ant].l = ''; }
}

function tras(cambio) {
  if (!partida || partida.resuelta) return;
  cambio();
  $('j-mensaje').textContent = '';
  pintarCasillas();
  guardarEnCurso();
}

function leerEntrada() {
  const v = entrada.value;
  let k = 0;
  while (k < v.length && k < previo.length && v[k] === previo[k]) k++;
  const quitadas = normalizar(previo.slice(k)).length;
  const nuevas = Array.from(normalizar(v.slice(k)));
  previo = v;
  if (!componiendo) entrada.value = previo = '';
  if (!quitadas && !nuevas.length) return;
  tras(() => {
    for (let j = 0; j < quitadas; j++) borrarLetra();
    nuevas.forEach(escribirLetra);
  });
}

/** Lleva el cursor a la casilla que hay bajo el punto pulsado. */
function elegirCasilla(x) {
  if (!partida || partida.resuelta) return;
  const casillas = [...$('j-casillas').children];
  let mejor = -1;
  let dist = Infinity;
  casillas.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    if (d < dist) { dist = d; mejor = i; }
  });
  if (mejor >= 0) { situar(mejor); pintarCasillas(); }
}

function guardarEnCurso() {
  if (partida.modo !== 'diaria' || partida.resuelta || partida.repetir) return;
  estado.enCurso = {
    n: partida.n,
    hechas: hechasDe(partida.n),
    falladas: falladasDe(partida.n),
    ayudas: partida.ayudas,
    fallos: partida.fallos,
    fijas: partida.celdas.map((c, i) => (c.fija ? i : -1)).filter((i) => i >= 0),
    letras: partida.celdas.filter((c) => !c.fija).map((c) => c.l || ' ').join(''),
  };
  guardar();
}

const FALLOS = [
  'No es esa. Prueba a leer la pista desde el otro fondo.',
  'Esa no. El truco sigue ahí, esperando.',
  'Casi… o no. Vuelve a mirar la frase.',
  'No encaja. ¿Dónde está la definición?',
];

function comprobar() {
  if (!partida || partida.resuelta) return;
  const faltan = partida.celdas.filter((c) => !c.l).length;
  if (faltan) {
    $('j-mensaje').textContent = `Faltan ${plural(faltan, 'letra', 'letras')}.`;
    return;
  }
  const intento = partida.celdas.map((c) => normalizarLetra(c.l)).join('');
  if (intento === normalizar(partida.p.respuesta)) {
    resolver();
    return;
  }
  const zona = $('j-casillas');
  zona.classList.remove('sacude');
  void zona.offsetWidth;
  zona.classList.add('sacude');
  const fallo = FALLOS[Math.floor(Math.random() * FALLOS.length)];
  // En el tutorial se puede probar sin límite.
  if (partida.modo !== 'diaria') { $('j-mensaje').textContent = fallo; return; }
  partida.fallos++;
  const quedan = INTENTOS - partida.fallos;
  if (quedan <= 0) { resolver(true); return; }
  guardarEnCurso();
  rotularAyuda();
  $('j-mensaje').textContent = `${fallo} ${quedan === 1 ? 'Te queda un último intento.' : `Te quedan ${quedan} intentos.`}`;
}

// ── Ayudas ──────────────────────────────────────────────────────────

function rotularAyuda() {
  const a = partida.ayudas;
  $('j-ayuda-txt').textContent = a === 0 ? 'Subrayar definición' : a === 1 ? 'Revelar el tipo' : 'Destapar una letra';
  $('j-ayuda').disabled = a >= 2 && !partida.celdas.some((c, i) => !c.fija && normalizarLetra(c.l || ' ') !== normalizarLetra(partida.sol[i]));
  if (partida.modo === 'tutorial') {
    $('j-contador').textContent = 'En el tutorial las ayudas y los fallos no cuentan.';
    return;
  }
  const quedan = INTENTOS - partida.fallos;
  const ayudas = a === 0 ? 'Sin ayudas, de momento' : `${'●'.repeat(Math.min(a, 8))} ${plural(a, 'ayuda usada', 'ayudas usadas')}`;
  $('j-contador').textContent = `${ayudas} · ${quedan === 1 ? 'último intento' : plural(quedan, 'intento', 'intentos')}.`;
}

function revelarTipo() {
  const t = tipoDe(partida.p.tipo);
  $('j-tipo-nombre').textContent = `${t.nombre}.`;
  $('j-tipo-linea').textContent = t.linea;
  $('j-tipo').hidden = false;
}

function pedirAyuda() {
  if (!partida || partida.resuelta) return;
  const a = partida.ayudas;
  if (a === 0) {
    seccion.classList.add('ver-def');
  } else if (a === 1) {
    revelarTipo();
    $('j-tipo').animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'ease-out' });
  } else if (!destaparLetra()) {
    return;
  }
  partida.ayudas++;
  guardarEnCurso();
  rotularAyuda();
}

function destaparLetra() {
  const { celdas, sol } = partida;
  const candidatas = celdas
    .map((c, i) => i)
    .filter((i) => !celdas[i].fija && normalizarLetra(celdas[i].l || ' ') !== normalizarLetra(sol[i]));
  if (!candidatas.length) { comprobar(); return false; }
  const i = candidatas[Math.floor(Math.random() * candidatas.length)];
  celdas[i] = { l: sol[i], fija: true };
  if (partida.cursor === i) situar(i);
  pintarCasillas();
  $('j-casillas').children[i].classList.add('destapada');
  $('j-mensaje').textContent = '';
  return true;
}

// ── Acierto y desmontaje ───────────────────────────────────────────

/** Termina el reto: acertado o, sin intentos, fallado (se enseña la respuesta igualmente). */
async function resolver(fallada = false) {
  partida.resuelta = true;
  partida.fallada = fallada;
  const yo = turno;
  entrada.blur();
  entrada.disabled = true;
  entrada.value = '';
  partida.celdas = partida.sol.map((l) => ({ l, fija: false }));
  $('j-mensaje').textContent = fallada ? 'Se acabaron los intentos. Esta era la respuesta.' : '';
  pintarCasillas();
  rotularAyuda();

  if (partida.modo === 'diaria' && !partida.repetir) anotar(partida.n, partida.indice, partida.ayudas, fallada);

  await espera((fallada ? 2200 : 900) + partida.sol.length * 70);
  if (yo !== turno) return;
  const zona = $('j-zona');
  await zona.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 260, easing: 'ease-in' }).finished;
  if (yo !== turno) return;
  zona.hidden = true;
  desmontar();
}

/** Guarda un reto resuelto; con el último del día, el día entero queda registrado. */
function anotar(n, indice, ayudas, fallada) {
  const hechas = [...hechasDe(n)];
  const falladas = hechas.map((_, i) => !!falladasDe(n)[i]);
  hechas[indice] = ayudas;
  falladas[indice] = fallada;
  if (hechas.length >= pistasDe(n).length) { registrar(n, hechas, falladas); return; }
  estado.enCurso = { n, hechas, falladas, ayudas: 0, fallos: 0, fijas: [], letras: '' };
  guardar();
}

const suma = (xs) => xs.reduce((t, x) => t + x, 0);

/** La racha cuenta los días con los retos terminados, se acierten o no. */
function registrar(n, hechas, falladas) {
  estado.historial[n] = { ayudas: suma(hechas), pistas: hechas, falladas, fecha: isoLocal(fechaDe(n)) };
  estado.enCurso = null;
  estado.racha = rachaActual(n);
  estado.mejorRacha = Math.max(estado.mejorRacha || 0, estado.racha);
  guardar();
  avisarAlmanaque(n);
}

/**
 * Con los retos de hoy terminados, la mano ☜ marca Trampantojo como «Hecho» en Almanaque,
 * y su hoja muestra un punto por reto acertado (vacío si se falló) y la racha, como los
 * demás juegos: «Hoy ● ● ○ · racha 5».
 */
function avisarAlmanaque(n) {
  if (prueba || n !== numeroDeHoy()) return;
  const r = estado.historial[n];
  const total = pistasDe(n).length;
  window.almanaqueHecho?.(r && {
    aciertos: total - (r.falladas || []).filter(Boolean).length,
    total,
    racha: rachaActual(n),
  });
}

function rotular(html) {
  const r = $('j-rotulo');
  r.innerHTML = html;
  if (!saltando) r.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'ease-out' });
}

async function desmontar() {
  const yo = ++turno;
  const { p, analisis } = partida;
  const { guion } = analisis;
  saltando = false;

  seccion.classList.add('desmontando', 'resuelta');
  seccion.classList.remove('ver-def', 'ver-ind', 'ver-mat');
  $('j-desmontaje').hidden = false;
  $('j-solucion').hidden = true;
  $('j-continuar').hidden = true;
  $('j-saltar-tutorial').hidden = true;
  $('j-saltar').hidden = false;
  $('j-rotulo').textContent = '';
  escenario.reiniciar();
  escenario.medir(guion.pasos);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const sigue = () => yo === turno;

  await espera(350);
  if (!sigue()) return;

  // 1. La definición se ilumina.
  seccion.classList.add('ver-def');
  rotular(`La definición: ${q(p.definicion)}.`);
  await espera(1700);
  if (!sigue()) return;

  // 2. El indicador.
  const t = tipoDe(p.tipo);
  if (!analisis.implicito) {
    seccion.classList.add('ver-ind');
    rotular(capitalizar(t.indicador(lista(analisis.indicadores.map(q)))));
  } else {
    rotular('Aquí no hay indicador a la vista: la propia frase sugiere la operación.');
  }
  await espera(1900);
  if (!sigue()) return;

  // 3. La materia prima y la construcción.
  if (analisis.rangos.some((r) => r.tipo === 'mat')) seccion.classList.add('ver-mat');
  for (const paso of guion.pasos) {
    rotular(paso.texto);
    await escenario.ir(paso.frame, paso);
    if (!sigue()) return;
    await espera(paso.pausa ?? 900);
    if (!sigue()) return;
  }

  // 4. La fórmula del desmontaje.
  escenario.destellar();
  $('j-sol-formula').textContent = p.desmontaje;
  const extra = p.explicacion || p.nota || '';
  $('j-sol-extra').textContent = extra;
  $('j-sol-extra').hidden = !extra;
  $('j-solucion').hidden = false;
  if (!saltando) $('j-solucion').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'ease-out' });
  $('j-saltar').hidden = true;
  const continuar = $('j-continuar');
  continuar.textContent = partida.modo === 'tutorial'
    ? (partida.indice < datos.tutorial.length - 1 ? 'Siguiente truco' : 'Terminar el tutorial')
    : partida.repetir ? 'Volver al resultado'
      : partida.indice < pistasDe(partida.n).length - 1 ? 'Siguiente reto' : 'Ver mi resultado';
  continuar.hidden = false;
  $('j-saltar-tutorial').hidden = partida.modo !== 'tutorial' || partida.indice >= datos.tutorial.length - 1;
  continuar.focus({ preventScroll: true });
  saltando = false;
}

function saltarAnimacion() {
  saltando = true;
  escenario.rapido = true;
  for (const fin of [...pendientes]) fin();
  for (const a of $('j-escenario').getAnimations({ subtree: true })) {
    try { a.finish(); } catch { /* animaciones infinitas */ }
  }
}

function continuar() {
  if (!partida) return;
  if (partida.modo === 'tutorial') {
    const sig = partida.indice + 1;
    if (sig < datos.tutorial.length) {
      jugar(datos.tutorial[sig], { modo: 'tutorial', indice: sig });
    } else {
      estado.tutorial = true;
      guardar();
      mostrar('p-fin-tutorial');
    }
    return;
  }
  if (partida.repetir) mostrarFinal(partida.n);
  else abrirDia(partida.n);
}

// ── Resultado del día ──────────────────────────────────────────────

const marca = (a, fallada) => (fallada ? '🔴' : a ? '🟡' : '🟢');
const marcas = (pistas, falladas) => pistas.map((a, i) => marca(a, falladas[i])).join('');
const ayudasTexto = (a) => (a ? plural(a, 'ayuda', 'ayudas') : 'sin ayudas');
/** «Los 3 retos, sin ayudas», «Resueltos con 2 ayudas», «2 de 3 resueltos, con 1 ayuda»… */
function balance(ayudas, falladas) {
  const total = ayudas.length;
  const aciertos = total - falladas.filter(Boolean).length;
  const a = suma(ayudas);
  if (aciertos === total) return a ? `Resueltos con ${plural(a, 'ayuda', 'ayudas')}` : `Los ${total} retos, sin ayudas`;
  return `${aciertos} de ${total} resueltos${a ? `, con ${plural(a, 'ayuda', 'ayudas')}` : ''}`;
}

function mostrarFinal(n) {
  turno++;
  const r = estado.historial[n];
  if (!r) { abrirHoy(); return; }
  avisarAlmanaque(n);
  const ps = pistasDe(n);
  // Los días jugados cuando había un solo reto guardan solo el total.
  const ayudas = r.pistas || ps.map((_, i) => (i ? 0 : r.ayudas));
  const falladas = ps.map((_, i) => !!r.falladas?.[i]);
  const hoy = diaActual();

  $('f-numero').textContent = `Trampantojo #${n}`;
  $('f-fecha').textContent = capitalizar(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(fechaDe(n)));

  $('f-retos').replaceChildren(...ps.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'final-reto';
    const resp = document.createElement('div');
    resp.className = 'casillas casillas-final';
    resp.setAttribute('role', 'img');
    resp.setAttribute('aria-label', `Respuesta: ${p.respuesta}`);
    resp.replaceChildren(...letras(p.respuesta).map((l, k) => {
      const s = document.createElement('span');
      s.className = `casilla llena ${falladas[i] ? 'fallo' : 'acierto'}`;
      s.style.setProperty('--i', k);
      s.textContent = l;
      return s;
    }));
    const pista = document.createElement('p');
    pista.className = 'final-pista';
    pista.textContent = `${p.pista} (${p.longitud})`;
    const pie = document.createElement('p');
    pie.className = 'final-reto-pie';
    const a = ayudas[i] || 0;
    pie.append(`${marca(a, falladas[i])} ${falladas[i] ? 'Fallado' : capitalizar(ayudasTexto(a))} · `);
    const ver = document.createElement('button');
    ver.type = 'button';
    ver.className = 'enlace';
    ver.textContent = 'Ver el desmontaje';
    ver.addEventListener('click', () => jugar(p, { modo: 'diaria', n, indice: i, repetir: true }));
    pie.append(ver);
    li.append(resp, pista, pie);
    return li;
  }));

  const limpio = suma(ayudas) === 0 && !falladas.some(Boolean);
  $('f-ayudas').textContent = `${limpio ? '🟢' : marcas(ayudas, falladas)} ${balance(ayudas, falladas)}`;

  const racha = rachaActual(hoy);
  $('f-racha').textContent = racha;
  $('f-racha-etiqueta').textContent = racha === 1 ? 'día de racha' : 'días de racha';
  $('f-mejor').textContent = Math.max(estado.mejorRacha || 0, racha);

  const semana = $('f-semana');
  const fmt = new Intl.DateTimeFormat('es-ES', { weekday: 'narrow' });
  semana.replaceChildren();
  for (let d = n - 6; d <= n; d++) {
    const li = document.createElement('li');
    if (d < 1) { li.className = 'fuera'; semana.append(li); continue; }
    const h = estado.historial[d];
    const fallos = (h?.falladas || []).filter(Boolean).length;
    li.className = h ? (fallos ? 'con-fallos' : h.ayudas ? 'con-ayudas' : 'limpia') : 'vacia';
    if (d === n) li.classList.add('hoy');
    li.innerHTML = `<span class="punto" aria-hidden="true"></span><span class="letra-dia">${fmt.format(fechaDe(d)).toUpperCase()}</span>`;
    li.setAttribute('aria-label', `#${d}: ${h ? (fallos ? `${plural(fallos, 'reto fallado', 'retos fallados')}` : h.ayudas ? `resuelto con ${plural(h.ayudas, 'ayuda', 'ayudas')}` : 'resuelto sin ayudas') : 'sin resolver'}`);
    semana.append(li);
  }

  $('f-aviso').textContent = '';
  $('f-compartir').onclick = () => compartir(n, falladas);

  mostrar('p-final');
  medirFinal();
  iniciarCuenta(n);
}

/** Casillas de la pantalla final: todas del mismo tamaño, que quepa la respuesta más larga. */
function medirFinal() {
  const filas = $('f-retos').querySelectorAll('.casillas-final');
  if (!filas.length) return;
  const mayor = Math.max(...[...filas].map((f) => f.children.length));
  const tam = Math.min(40, Math.floor((($('f-retos').clientWidth || 340) - 5 * (mayor - 1)) / mayor));
  for (const f of filas) {
    f.style.setProperty('--tam', `${tam}px`);
    f.style.setProperty('--gap', '5px');
  }
}

let reloj = null;
function detenerCuenta() { clearInterval(reloj); reloj = null; }
function iniciarCuenta(n) {
  detenerCuenta();
  const el = $('f-cuenta');
  const tic = () => {
    if (!prueba && numeroDeHoy() > n) { detenerCuenta(); abrirHoy(); return; }
    const ahora = new Date();
    const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
    const s = Math.max(0, Math.floor((manana - ahora) / 1000));
    const dos = (x) => String(x).padStart(2, '0');
    el.textContent = `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
    el.setAttribute('datetime', `PT${Math.floor(s / 3600)}H${Math.floor((s % 3600) / 60)}M${s % 60}S`);
  };
  tic();
  reloj = setInterval(tic, 1000);
}

// Una marca por reto: ▰ resuelto, ▱ fallado. «Trampantojo nº 7 ▰▱▰ 2/3 aciertos» y el enlace.
async function compartir(n, falladas) {
  const aciertos = falladas.filter((f) => !f).length;
  const texto = `Trampantojo nº ${n} ${falladas.map((f) => (f ? '▱' : '▰')).join('')} ${aciertos}/${falladas.length} aciertos\njoseleking.github.io/Trampantojo`;

  const aviso = $('f-aviso');
  if (navigator.share) {
    try { await navigator.share({ text: texto }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  if (await copiar(texto)) {
    aviso.textContent = 'Copiado. Ya puedes pegarlo donde quieras.';
  } else {
    aviso.textContent = `No se pudo copiar. Tu resultado: ${texto.replace(/\n/g, ' · ')}`;
  }
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

// ── Navegación ─────────────────────────────────────────────────────

/** Abre el primer reto pendiente del día n, o su resultado si ya están todos. */
function abrirDia(n) {
  if (estado.historial[n]) { mostrarFinal(n); return; }
  const i = Math.min(hechasDe(n).length, pistasDe(n).length - 1);
  jugar(pistasDe(n)[i], { modo: 'diaria', n, indice: i });
}

const abrirHoy = () => abrirDia(diaActual());

function empezarTutorial() {
  // La portada solo se ve una vez: empezar el tutorial cuenta, aunque se deje a medias.
  estado.tutorial = true;
  guardar();
  jugar(datos.tutorial[0], { modo: 'tutorial', indice: 0 });
}

// ── Diálogo de ayuda ───────────────────────────────────────────────

function prepararGlosario() {
  const ejemplos = {};
  for (const p of [...datos.tutorial, ...datos.dias.flatMap((d) => d.pistas)]) if (!ejemplos[p.tipo]) ejemplos[p.tipo] = p;
  $('d-glosario').innerHTML = Object.entries(TIPOS).map(([clave, t]) => {
    const ej = ejemplos[clave];
    return `<div><dt>${escapar(t.nombre)}</dt><dd>${escapar(t.linea)}${ej && clave !== 'combinada' && datos.tutorial.includes(ej)
      ? ` <span class="ejemplo">${escapar(ej.pista)} (${ej.longitud}) → ${escapar(ej.respuesta)}</span>` : ''}</dd></div>`;
  }).join('');
}

// ── Arranque ───────────────────────────────────────────────────────

/**
 * Antes había un solo reto al día. Si el de hoy se resolvió así, cuenta como
 * el primero de los tres y quedan los otros dos por jugar.
 */
function migrarDiaUnico() {
  if (prueba) return;
  const n = numeroDeHoy();
  const viejo = estado.historial[n];
  if (!viejo || viejo.pistas) return;
  delete estado.historial[n];
  estado.enCurso = { n, hechas: [viejo.ayudas || 0], falladas: [false], ayudas: 0, fallos: 0, fijas: [], letras: '' };
  estado.racha = rachaActual(n);
  guardar();
}

function enlazar() {
  entrada.addEventListener('compositionstart', () => { componiendo = true; });
  // Safari avisa del fin de la composición antes del último «input»; se lee en cuanto pase.
  entrada.addEventListener('compositionend', () => { componiendo = false; setTimeout(leerEntrada); });
  entrada.addEventListener('input', leerEntrada);
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); comprobar(); return; }
    if (e.isComposing || componiendo || !partida) return;
    const c = partida.cursor;
    if (e.key === 'Backspace') { e.preventDefault(); tras(borrarLetra); }
    else if (e.key === 'Delete') { e.preventDefault(); tras(() => { if (c >= 0) partida.celdas[c].l = ''; }); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const paso = e.key === 'ArrowLeft' ? -1 : 1;
      const i = libreDesde(c + paso, paso);
      if (i >= 0) { partida.cursor = i; pintarCasillas(); }
    }
  });
  entrada.addEventListener('click', (e) => elegirCasilla(e.clientX));
  entrada.addEventListener('focus', () => pintarCasillas());
  entrada.addEventListener('blur', () => pintarCasillas());

  $('j-comprobar').addEventListener('click', comprobar);
  $('j-ayuda').addEventListener('click', pedirAyuda);
  $('j-saltar').addEventListener('click', saltarAnimacion);
  $('j-continuar').addEventListener('click', continuar);
  $('j-saltar-tutorial').addEventListener('click', abrirHoy);
  $('j-aviso-saltar').addEventListener('click', abrirHoy);
  $('j-casillas').addEventListener('animationend', (e) => {
    if (e.animationName === 'sacudida') $('j-casillas').classList.remove('sacude');
  });

  $('b-empezar').addEventListener('click', empezarTutorial);
  document.querySelectorAll('[data-tutorial]').forEach((b) => b.addEventListener('click', empezarTutorial));
  $('b-saltar-tutorial').addEventListener('click', () => { estado.tutorial = true; guardar(); abrirHoy(); });
  $('b-ir-hoy').addEventListener('click', abrirHoy);
  $('b-reintentar').addEventListener('click', () => location.reload());

  const dialogo = $('d-ayuda');
  $('b-ayuda').addEventListener('click', () => dialogo.showModal());
  $('d-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
  $('d-tutorial').addEventListener('click', () => { dialogo.close(); empezarTutorial(); });

  let pendiente = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(pendiente);
    pendiente = requestAnimationFrame(() => {
      pintarCasillas();
      if (!$('p-final').hidden) medirFinal();
      if (partida && !$('j-desmontaje').hidden) escenario.medir(partida.analisis.guion.pasos);
    });
  });
}

// La portada se queda un mínimo en pantalla (contado desde que empezó a cargar la página)
// aunque las pistas carguen antes. Si tarda en pintarse (la primera visita), se queda al menos
// PORTADA_PINTADA desde entonces, para que el logo acabe de aparecer.
const DURACION_PORTADA = 1500;
const PORTADA_PINTADA = 1400;
function ocultarPortada() {
  const pintada = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? performance.now();
  const resto = Math.max(0, DURACION_PORTADA - performance.now(), PORTADA_PINTADA - (performance.now() - pintada));
  setTimeout(() => $('arranque').classList.add('fuera'), resto);
}

async function iniciar() {
  enlazar();

  const params = new URLSearchParams(location.search);
  if (params.has('reiniciar')) almacen.borrar(CLAVE);
  const forzado = parseInt(params.get('dia'), 10);
  if (forzado > 0) prueba = forzado;

  estado = prueba ? { ...estadoVacio(), tutorial: true } : cargarEstado();

  try {
    const r = await fetch(URL_PISTAS, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    datos = await r.json();
    if (!datos?.dias?.length || !datos.dias.every((d) => d.pistas?.length) || !datos?.tutorial?.length) throw new Error('JSON sin pistas');
    for (const p of [...datos.tutorial, ...datos.dias.flatMap((d) => d.pistas)]) p.pista = String(p.pista).normalize('NFC');
  } catch (e) {
    console.error('No se pudieron cargar las pistas', e);
    mostrar('p-error');
    ocultarPortada();
    return;
  }

  prepararGlosario();
  migrarDiaUnico();
  // Quien ya ha jugado algún día no necesita la portada, aunque no pasara por ella.
  if (!estado.tutorial && (Object.keys(estado.historial).length || estado.enCurso)) {
    estado.tutorial = true;
    guardar();
  }
  if (!estado.tutorial) mostrar('p-intro');
  else abrirHoy();
  ocultarPortada();
}

iniciar();
