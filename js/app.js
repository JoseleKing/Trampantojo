// ════════════════════════════════════════════════════════════════════
//  Trampantojo — configuración
// ════════════════════════════════════════════════════════════════════

/** Fecha (AAAA-MM-DD, hora local) que corresponde al día 1. */
const FECHA_INICIO = '2026-10-01';

const URL_PISTAS = 'trampantojo-pistas.json';
const CLAVE = 'trampantojo:v1';
const CLAVE_TEMA = 'trampantojo:tema';

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
const pistaDe = (n) => datos.dias[(n - 1) % datos.dias.length];
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
    p, modo, n, indice, sol,
    analisis: analizar(p),
    ayudas: 0,
    celdas: sol.map(() => ({ l: '', fija: false })),
    resuelta: false,
    llena: false,
  };

  // Recupera una partida a medias del mismo día.
  const enCurso = estado.enCurso;
  if (modo === 'diaria' && enCurso?.n === n) {
    partida.ayudas = enCurso.ayudas || 0;
    for (const i of enCurso.fijas || []) if (sol[i]) partida.celdas[i] = { l: sol[i], fija: true };
    const libres = Array.from(enCurso.letras || '');
    partida.celdas.filter((c) => !c.fija).forEach((c, k) => { c.l = libres[k] || ''; });
  }

  // Cabecera
  if (modo === 'tutorial') {
    $('j-etiqueta').textContent = `Tutorial · ${indice + 1} de ${datos.tutorial.length}`;
    dificultad(0);
  } else {
    $('j-etiqueta').textContent = `Pista n.º ${n}${prueba ? ' · prueba' : ''}`;
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

  // Nota del tutorial
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
  entrada.value = partida.celdas.filter((c) => !c.fija).map((c) => c.l).join('');
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

function libres() {
  return partida.celdas.map((c, i) => (c.fija ? -1 : i)).filter((i) => i >= 0);
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
  const activa = partida.celdas.findIndex((c) => !c.fija && !c.l);
  partida.celdas.forEach((c, i) => {
    const el = cont.children[i];
    el.textContent = c.l;
    el.className = 'casilla';
    el.style.setProperty('--i', i);
    if (c.l) el.classList.add('llena');
    if (c.fija) el.classList.add('fija');
    if (enfocada && i === activa && !partida.resuelta) el.classList.add('activa');
    if (partida.resuelta) el.classList.add('acierto');
  });
}

let componiendo = false;
function volcar(reescribir) {
  if (!partida || partida.resuelta) return;
  const idx = libres();
  const ls = Array.from(normalizar(entrada.value)).slice(0, idx.length);
  idx.forEach((i, k) => { partida.celdas[i].l = ls[k] || ''; });
  if (reescribir && entrada.value !== ls.join('')) entrada.value = ls.join('');
  $('j-mensaje').textContent = '';
  pintarCasillas();
  guardarEnCurso();

  const llena = partida.celdas.every((c) => c.l);
  if (llena && !partida.llena && !componiendo) comprobar();
  partida.llena = llena;
}

function guardarEnCurso() {
  if (partida.modo !== 'diaria' || partida.resuelta) return;
  estado.enCurso = {
    n: partida.n,
    ayudas: partida.ayudas,
    fijas: partida.celdas.map((c, i) => (c.fija ? i : -1)).filter((i) => i >= 0),
    letras: partida.celdas.filter((c) => !c.fija).map((c) => c.l).join(''),
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
  $('j-mensaje').textContent = FALLOS[Math.floor(Math.random() * FALLOS.length)];
}

// ── Ayudas ──────────────────────────────────────────────────────────

function rotularAyuda() {
  const a = partida.ayudas;
  $('j-ayuda-txt').textContent = a === 0 ? 'Subrayar definición' : a === 1 ? 'Revelar el tipo' : 'Destapar una letra';
  $('j-ayuda').disabled = a >= 2 && !partida.celdas.some((c, i) => !c.fija && normalizarLetra(c.l || ' ') !== normalizarLetra(partida.sol[i]));
  $('j-contador').textContent = partida.modo === 'tutorial'
    ? 'En el tutorial las ayudas no cuentan.'
    : a === 0 ? 'Sin ayudas, de momento.' : `${'●'.repeat(Math.min(a, 8))} ${plural(a, 'ayuda usada', 'ayudas usadas')}`;
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
  // Las letras libres siguen en su sitio; el campo oculto se recompone con ellas.
  entrada.value = celdas.filter((c) => !c.fija).map((c) => c.l).join('');
  pintarCasillas();
  $('j-casillas').children[i].classList.add('destapada');
  $('j-mensaje').textContent = '';

  const completa = celdas.every((c) => c.l);
  partida.llena = completa;
  if (completa && celdas.every((c, k) => normalizarLetra(c.l) === normalizarLetra(sol[k]))) {
    setTimeout(comprobar, 450);
  }
  return true;
}

// ── Acierto y desmontaje ───────────────────────────────────────────

async function resolver() {
  partida.resuelta = true;
  const yo = turno;
  entrada.blur();
  entrada.disabled = true;
  entrada.value = '';
  partida.celdas = partida.sol.map((l) => ({ l, fija: false }));
  $('j-mensaje').textContent = '';
  pintarCasillas();

  if (partida.modo === 'diaria') registrar(partida.n, partida.ayudas);

  await espera(900 + partida.sol.length * 70);
  if (yo !== turno) return;
  const zona = $('j-zona');
  await zona.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 260, easing: 'ease-in' }).finished;
  if (yo !== turno) return;
  zona.hidden = true;
  desmontar();
}

function registrar(n, ayudas) {
  estado.historial[n] = { ayudas, fecha: isoLocal(fechaDe(n)) };
  estado.enCurso = null;
  estado.racha = rachaActual(n);
  estado.mejorRacha = Math.max(estado.mejorRacha || 0, estado.racha);
  guardar();
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
    : 'Ver mi resultado';
  continuar.hidden = false;
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
  mostrarFinal(partida.n);
}

// ── Resultado del día ──────────────────────────────────────────────

function lineaAyudas(a) {
  return a === 0 ? '🟢 sin ayudas' : `${'🟡'.repeat(Math.min(a, 10))} ${plural(a, 'ayuda', 'ayudas')}`;
}

function mostrarFinal(n) {
  turno++;
  const r = estado.historial[n];
  if (!r) { abrirHoy(); return; }
  const p = pistaDe(n);
  const hoy = diaActual();

  $('f-numero').textContent = `Trampantojo #${n}`;
  $('f-fecha').textContent = capitalizar(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(fechaDe(n)));

  const resp = $('f-respuesta');
  const sol = letras(p.respuesta);
  const tam = Math.min(46, Math.floor(((resp.parentElement.clientWidth || 340) - 6 * (sol.length - 1)) / sol.length));
  resp.style.setProperty('--tam', `${tam}px`);
  resp.style.setProperty('--gap', '6px');
  resp.replaceChildren(...sol.map((l, i) => {
    const s = document.createElement('span');
    s.className = 'casilla llena acierto';
    s.style.setProperty('--i', i);
    s.textContent = l;
    return s;
  }));
  resp.setAttribute('aria-label', `Respuesta: ${p.respuesta}`);
  resp.setAttribute('role', 'img');

  $('f-pista').textContent = `${p.pista} (${p.longitud})`;
  $('f-ayudas').textContent = r.ayudas === 0 ? '🟢 Resuelta sin ayudas' : `${'🟡'.repeat(Math.min(r.ayudas, 10))} Resuelta con ${plural(r.ayudas, 'ayuda', 'ayudas')}`;

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
    li.className = h ? (h.ayudas ? 'con-ayudas' : 'limpia') : 'vacia';
    if (d === n) li.classList.add('hoy');
    li.innerHTML = `<span class="punto" aria-hidden="true"></span><span class="letra-dia">${fmt.format(fechaDe(d)).toUpperCase()}</span>`;
    li.setAttribute('aria-label', `#${d}: ${h ? (h.ayudas ? `resuelta con ${plural(h.ayudas, 'ayuda', 'ayudas')}` : 'resuelta sin ayudas') : 'sin resolver'}`);
    semana.append(li);
  }

  $('f-aviso').textContent = '';
  $('f-repetir').onclick = () => jugar(p, { modo: 'diaria', n, repetir: true });
  $('f-compartir').onclick = () => compartir(n, r.ayudas, racha);

  mostrar('p-final');
  iniciarCuenta(n);
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

async function compartir(n, ayudas, racha) {
  const url = location.origin + location.pathname;
  const texto = [
    `Trampantojo #${n}`,
    lineaAyudas(ayudas),
    racha > 1 ? `🔥 ${racha} días seguidos` : null,
    url,
  ].filter(Boolean).join('\n');

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

function abrirHoy() {
  const n = diaActual();
  if (estado.historial[n]) mostrarFinal(n);
  else jugar(pistaDe(n), { modo: 'diaria', n });
}

function empezarTutorial() {
  jugar(datos.tutorial[0], { modo: 'tutorial', indice: 0 });
}

// ── Tema ───────────────────────────────────────────────────────────

const oscuroSistema = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const temaEfectivo = () => document.documentElement.dataset.theme || (oscuroSistema() ? 'dark' : 'light');
function sincronizarTema() {
  const oscuro = temaEfectivo() === 'dark';
  $('b-tema').setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  $('meta-tema').setAttribute('content', oscuro ? '#1D1813' : '#F3EAD8');
}
function alternarTema() {
  const nuevo = temaEfectivo() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nuevo;
  almacen.escribir(CLAVE_TEMA, nuevo === 'dark' ? 'oscuro' : 'claro');
  sincronizarTema();
}

// ── Diálogo de ayuda ───────────────────────────────────────────────

function prepararGlosario() {
  const ejemplos = {};
  for (const p of [...datos.tutorial, ...datos.dias]) if (!ejemplos[p.tipo]) ejemplos[p.tipo] = p;
  $('d-glosario').innerHTML = Object.entries(TIPOS).map(([clave, t]) => {
    const ej = ejemplos[clave];
    return `<div><dt>${escapar(t.nombre)}</dt><dd>${escapar(t.linea)}${ej && clave !== 'combinada' && datos.tutorial.includes(ej)
      ? ` <span class="ejemplo">${escapar(ej.pista)} (${ej.longitud}) → ${escapar(ej.respuesta)}</span>` : ''}</dd></div>`;
  }).join('');
}

// ── Arranque ───────────────────────────────────────────────────────

function enlazar() {
  entrada.addEventListener('compositionstart', () => { componiendo = true; });
  entrada.addEventListener('compositionend', () => { componiendo = false; volcar(true); });
  entrada.addEventListener('input', () => volcar(!componiendo));
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); comprobar(); }
  });
  const alFinal = () => { const l = entrada.value.length; try { entrada.setSelectionRange(l, l); } catch { /* nada */ } };
  entrada.addEventListener('focus', () => { alFinal(); pintarCasillas(); });
  entrada.addEventListener('click', alFinal);
  entrada.addEventListener('blur', () => pintarCasillas());

  $('j-comprobar').addEventListener('click', comprobar);
  $('j-ayuda').addEventListener('click', pedirAyuda);
  $('j-saltar').addEventListener('click', saltarAnimacion);
  $('j-continuar').addEventListener('click', continuar);
  $('j-casillas').addEventListener('animationend', (e) => {
    if (e.animationName === 'sacudida') $('j-casillas').classList.remove('sacude');
  });

  $('b-empezar').addEventListener('click', empezarTutorial);
  $('b-saltar-tutorial').addEventListener('click', () => { estado.tutorial = true; guardar(); abrirHoy(); });
  $('b-ir-hoy').addEventListener('click', abrirHoy);
  $('b-reintentar').addEventListener('click', () => location.reload());
  $('b-tema').addEventListener('click', alternarTema);

  const dialogo = $('d-ayuda');
  $('b-ayuda').addEventListener('click', () => dialogo.showModal());
  $('d-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
  $('d-tutorial').addEventListener('click', () => { dialogo.close(); empezarTutorial(); });

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', sincronizarTema);
  let pendiente = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(pendiente);
    pendiente = requestAnimationFrame(() => {
      pintarCasillas();
      if (partida && !$('j-desmontaje').hidden) escenario.medir(partida.analisis.guion.pasos);
    });
  });
}

async function iniciar() {
  enlazar();
  sincronizarTema();

  const params = new URLSearchParams(location.search);
  if (params.has('reiniciar')) almacen.borrar(CLAVE);
  const forzado = parseInt(params.get('dia'), 10);
  if (forzado > 0) prueba = forzado;

  estado = prueba ? { ...estadoVacio(), tutorial: true } : cargarEstado();

  try {
    const r = await fetch(URL_PISTAS, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    datos = await r.json();
    if (!datos?.dias?.length || !datos?.tutorial?.length) throw new Error('JSON sin pistas');
    for (const p of [...datos.tutorial, ...datos.dias]) p.pista = String(p.pista).normalize('NFC');
  } catch (e) {
    console.error('No se pudieron cargar las pistas', e);
    mostrar('p-error');
    return;
  }

  prepararGlosario();
  if (!estado.tutorial) mostrar('p-intro');
  else abrirHoy();
}

iniciar();
