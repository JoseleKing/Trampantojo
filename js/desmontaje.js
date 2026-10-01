// El desmontaje: analiza cada pista (definición, indicador, materia prima)
// y genera un guion de fotogramas que el Escenario anima con la técnica FLIP.

import {
  normalizar, normalizarLetra, letras, plegar, esLetraPlegada,
  buscar, mayusculas, escapar,
} from './texto.js';

export const TIPOS = {
  anagrama: {
    nombre: 'Anagrama',
    linea: 'Las letras de una palabra de la pista se desordenan para formar la respuesta.',
    indicador: (i) => `${i} avisa: hay que desordenar letras.`,
  },
  oculta: {
    nombre: 'Palabra oculta',
    linea: 'La respuesta está escrita, letra a letra, dentro de la propia pista.',
    indicador: (i) => `${i} avisa: la respuesta está escondida en la frase.`,
  },
  suma: {
    nombre: 'Suma',
    linea: 'Se juntan dos o más piezas, una detrás de otra, para formar la respuesta.',
    indicador: (i) => `${i} indica que hay que juntar piezas.`,
  },
  inversion: {
    nombre: 'Inversión',
    linea: 'Una palabra de la pista se lee de derecha a izquierda.',
    indicador: (i) => `${i} pide leer una palabra al revés.`,
  },
  homofono: {
    nombre: 'Homófono',
    linea: 'La respuesta suena igual que otra palabra, pero se escribe distinto.',
    indicador: (i) => `${i} avisa: cuenta el sonido, no la escritura.`,
  },
  resta: {
    nombre: 'Resta',
    linea: 'A una palabra se le quitan una o más letras.',
    indicador: (i) => `${i} dice qué letras sobran.`,
  },
  contenedor: {
    nombre: 'Contenedor',
    linea: 'Una palabra se mete dentro de otra, como en una caja.',
    indicador: (i) => `${i} indica que una pieza va dentro de otra.`,
  },
  combinada: {
    nombre: 'Combinada',
    linea: 'Encadena varios trucos: por ejemplo, invertir una palabra y luego sumarle otra pieza.',
    indicador: (i) => `${i} encadenan varios trucos seguidos.`,
  },
};

export const tipoDe = (t) => TIPOS[t] || { nombre: 'Juego de palabras', linea: '', indicador: (i) => `${i} es el indicador.` };

// ── Pequeños ayudantes para los rótulos ────────────────────────────────
const v = (x) => `<span class="v">${escapar(x)}</span>`;
const q = (x) => `«${escapar(x)}»`;
const lista = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const fila = (ls, pref, c) => ls.map((l, j) => ({ k: pref + j, l, c }));

// ── Análisis de la pista ───────────────────────────────────────────────

/**
 * Devuelve { rangos, indicadores, implicito, guion } para una pista del JSON.
 * Los rangos marcan definición ('def'), indicador ('ind') y materia prima ('mat').
 */
export function analizar(p) {
  const rangos = [];
  const ocupado = (a, b) => rangos.some((r) => a < r.fin && b > r.ini);

  // Definición: está al principio o al final; probamos ambas posiciones.
  const def = buscar(p.pista, p.definicion);
  if (def) rangos.push({ ini: def[0], fin: def[1], tipo: 'def' });

  // Indicador(es): "de vuelta / con" → dos piezas.
  const indicadores = [];
  const implicitoDeclarado = /^\s*\(/.test(p.indicador || '');
  if (!implicitoDeclarado) {
    for (const trozo of String(p.indicador || '').split('/').map((s) => s.trim()).filter(Boolean)) {
      const r = buscar(p.pista, trozo, { ocupado, palabra: true }) || buscar(p.pista, trozo, { ocupado });
      if (r) {
        rangos.push({ ini: r[0], fin: r[1], tipo: 'ind' });
        indicadores.push(Array.from(p.pista).slice(r[0], r[1]).join(''));
      }
    }
  }
  const finIndicador = Math.max(0, ...rangos.filter((r) => r.tipo === 'ind').map((r) => r.fin));

  let guion = null;
  try {
    guion = construirGuion(p, { finIndicador, ocupado });
  } catch (e) {
    console.warn('Guion de desmontaje no disponible', p, e);
  }
  if (!guion || !validar(guion, p.respuesta)) guion = guionSencillo(p);
  else sellar(guion);

  // Materia prima: palabras de la pista que se manipulan.
  for (const r of guion.rangosMateria || []) {
    if (!ocupado(r[0], r[1])) rangos.push({ ini: r[0], fin: r[1], tipo: 'mat' });
  }
  for (const m of guion.materia || []) {
    if (Array.from(m).length < 2) continue;
    // "el círculo" no aparece tal cual en "con un círculo": probamos también la última palabra.
    const intentos = [m, m.trim().split(/\s+/).at(-1)];
    for (const t of intentos) {
      const r = Array.from(t).length > 1 && buscar(p.pista, t, { ocupado, palabra: true });
      if (r) { rangos.push({ ini: r[0], fin: r[1], tipo: 'mat' }); break; }
    }
  }

  return { rangos, indicadores, implicito: indicadores.length === 0, guion };
}

/**
 * Las fichas viajan iluminadas y, cuando ya han aterrizado, se voltean
 * una a una hasta quedar doradas: la revelación llega al final.
 */
function sellar(guion) {
  const ultimo = guion.pasos.at(-1);
  guion.pasos.push({ frame: ultimo.frame, dur: 520, escalon: 75, pausa: 500, texto: ultimo.texto });
  ultimo.frame = ultimo.frame.map((it) => ({ ...it, c: 'brilla' }));
  ultimo.pausa = 250;
}

function validar(guion, respuesta) {
  const ultimo = guion.pasos.at(-1)?.frame || [];
  return ultimo.filter((i) => i.l).map((i) => normalizarLetra(i.l)).join('') === normalizar(respuesta);
}

function construirGuion(p, ctx) {
  switch (p.tipo) {
    case 'anagrama': return guionReordenar(p, 'arco');
    case 'inversion': return guionReordenar(p, 'giro');
    case 'resta': return guionTransformar(p, 'resta');
    case 'homofono': return guionTransformar(p, 'homofono');
    case 'oculta': return guionOculta(p, ctx);
    case 'contenedor': return guionContenedor(p);
    default:
      if (p.desmontaje.includes('+')) return guionSuma(p);
      return null;
  }
}

// ── Guiones por tipo ───────────────────────────────────────────────────

/** Anagrama (las letras vuelan en arco) e inversión (giran y se reflejan). */
function guionReordenar(p, modo) {
  const [origen] = mayusculas(p.desmontaje);
  if (!origen) return null;
  const src = letras(origen);
  const dst = letras(p.respuesta);
  if (src.length !== dst.length) return null;

  const usado = src.map(() => false);
  const claves = [];
  for (let i = 0; i < dst.length; i++) {
    const nc = normalizarLetra(dst[i]);
    let j = -1;
    const espejo = src.length - 1 - i;
    if (modo === 'giro' && !usado[espejo] && normalizarLetra(src[espejo]) === nc) j = espejo;
    if (j < 0) j = src.findIndex((s, x) => !usado[x] && normalizarLetra(s) === nc);
    if (j < 0) return null;
    usado[j] = true;
    claves.push('s' + j);
  }
  const inicio = fila(src, 's', 'materia');
  const final = dst.map((l, i) => ({ k: claves[i], l, c: 'final' }));

  if (modo === 'giro') {
    return {
      materia: [origen],
      pasos: [
        { frame: inicio, texto: `La materia prima: ${v(origen)}.` },
        { frame: inicio.map((it) => ({ ...it, c: 'materia espejo' })), dur: 300, pausa: 350, texto: `Ahora, léela de derecha a izquierda…` },
        { frame: final, mov: 'giro', dur: 1150, escalon: 90, texto: `…${v(origen)} al revés es ${v(p.respuesta)}.` },
      ],
    };
  }
  return {
    materia: [origen],
    pasos: [
      { frame: inicio, texto: `La materia prima: ${v(origen)}.` },
      {
        frame: src.map((l, j) => ({ k: 's' + j, l, c: `materia suelta${j % 2 ? ' suelta-b' : ''}` })),
        dur: 480, escalon: 55, pausa: 250, texto: `Sus letras se sueltan…`,
      },
      { frame: final, mov: 'arco', dur: 1050, escalon: 85, texto: `…y se recolocan: ${v(p.respuesta)}.` },
    ],
  };
}

/** Alineación de edición (Levenshtein) entre dos listas de letras normalizadas. */
function alinear(a, b) {
  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.push({ op: a[i - 1] === b[j - 1] ? '=' : '~', i: i - 1, j: j - 1 });
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ op: '-', i: i - 1 });
      i--;
    } else {
      ops.push({ op: '+', j: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

/** Resta (letras que caen) y homófono (letras que cambian sin cambiar el sonido). */
function guionTransformar(p, tipo) {
  const [origen] = mayusculas(p.desmontaje);
  if (!origen) return null;
  const glosa = (p.desmontaje.match(/\(([^)]*[a-záéíóúüñ][^)]*)\)/) || [])[1];
  const src = letras(origen);
  const dst = letras(p.respuesta);
  const ops = alinear(src.map(normalizarLetra), dst.map(normalizarLetra));

  const base = tipo === 'homofono' ? 'materia sonido' : 'materia';
  const inicio = fila(src, 's', base);
  const marcas = {};
  for (const o of ops) {
    if (o.op === '-') marcas[o.i] = tipo === 'homofono' ? 'materia muda' : 'materia tachada';
    if (o.op === '~') marcas[o.i] = 'materia cambia';
  }
  const marcado = src.map((l, j) => ({ k: 's' + j, l, c: marcas[j] || 'materia' }));
  const final = [];
  for (const o of ops) {
    if (o.op === '=' || o.op === '~') final.push({ k: 's' + o.i, l: dst[o.j], c: 'final' });
    if (o.op === '+') final.push({ k: 'n' + o.j, l: dst[o.j], c: 'final' });
  }

  if (tipo === 'resta') {
    const quitadas = ops.filter((o) => o.op === '-').map((o) => v(src[o.i]));
    return {
      materia: [origen],
      pasos: [
        { frame: inicio, texto: `Partimos de ${v(origen)}.` },
        { frame: marcado, dur: 350, pausa: 650, texto: `Le sobra${quitadas.length > 1 ? 'n' : ''} ${lista(quitadas)}…` },
        { frame: final, salida: 'cae', dur: 900, texto: `…y queda ${v(p.respuesta)}.` },
      ],
    };
  }

  const frases = [];
  for (const o of ops) {
    if (o.op === '~') frases.push(`${v(src[o.i])} y ${v(dst[o.j])} suenan igual`);
    if (o.op === '-') frases.push(normalizarLetra(src[o.i]) === 'H' ? `la ${v('H')} es muda` : `la ${v(src[o.i])} no suena`);
  }
  const explicacion = frases.length ? frases.join('; ') : 'suenan exactamente igual';
  return {
    materia: glosa ? [glosa, origen] : [origen],
    pasos: [
      { frame: inicio, pausa: 1300, texto: `Escucha: ${v(origen)}${glosa ? ` (${q(glosa)})` : ''}…` },
      { frame: marcado, dur: 350, pausa: 900, texto: `…${explicacion}…` },
      { frame: final, dur: 900, salida: 'esfuma', texto: `…así que suena como ${v(p.respuesta)}, escrita de otra forma.` },
    ],
  };
}

/** Palabra oculta: las letras escondidas se iluminan y el resto se desvanece. */
function guionOculta(p, { finIndicador }) {
  const chars = Array.from(p.pista);
  const pleg = plegar(p.pista);
  const pos = [];
  let flujo = '';
  chars.forEach((_, i) => {
    if (esLetraPlegada(pleg[i])) { pos.push(i); flujo += pleg[i]; }
  });
  const objetivo = normalizar(p.respuesta).toLowerCase();
  const desdeLetra = pos.filter((i) => i < finIndicador).length;
  let k = flujo.indexOf(objetivo, desdeLetra);
  if (k < 0) k = flujo.indexOf(objetivo);
  if (k < 0) return null;
  const ocultos = pos.slice(k, k + objetivo.length);
  const esOculto = new Set(ocultos);

  let ini = ocultos[0];
  while (ini > 0 && esLetraPlegada(pleg[ini - 1])) ini--;
  let fin = ocultos.at(-1) + 1;
  while (fin < chars.length && esLetraPlegada(pleg[fin])) fin++;

  const tramo = [];
  for (let i = ini; i < fin; i++) {
    if (esLetraPlegada(pleg[i])) tramo.push({ k: 'c' + i, l: chars[i].toUpperCase(), i });
    else tramo.push({ k: 'g' + i, hueco: true, i });
  }
  const dst = letras(p.respuesta);
  const fragmento = chars.slice(ini, fin).join('');

  return {
    rangosMateria: [[ocultos[0], ocultos.at(-1) + 1]],
    pasos: [
      { frame: tramo.map((t) => ({ ...t, c: 'materia' })), escalon: 35, texto: `Mira con atención ${q(fragmento)}…` },
      {
        frame: tramo.map((t) => ({ ...t, c: t.hueco ? '' : esOculto.has(t.i) ? 'brilla' : 'tenue' })),
        dur: 500, escalon: 60, pausa: 900, texto: `…ahí dentro, letra a letra, hay algo escondido…`,
      },
      {
        frame: ocultos.map((i, j) => ({ k: 'c' + i, l: dst[j], c: 'final' })),
        dur: 900, salida: 'esfuma', texto: `…${v(p.respuesta)}.`,
      },
    ],
  };
}

/** Suma (y combinada con suma): las piezas se acercan y se funden. */
function guionSuma(p) {
  const piezas = p.desmontaje.split('+').map((parte) => {
    const toks = mayusculas(parte);
    const glosa = (parte.match(/\(([^)]*[a-záéíóúüñ][^)]*)\)/) || [])[1];
    const invierte = /rev[eé]s|atr[aá]s|vuelta/i.test(parte) && toks.length >= 2;
    return { origen: toks[0], valor: invierte ? toks[1] : toks[0], invierte, glosa };
  });
  if (piezas.some((x) => !x.origen)) return null;

  const conSignos = (bloques) => bloques.flatMap((b, i) => (i ? [{ k: '+' + i, signo: '+' }, ...b] : b));
  const inicio = conSignos(piezas.map((x, i) => fila(letras(x.origen), `p${i}_`, 'materia')));
  const nombrar = (x) => v(x.origen) + (x.glosa ? ` (${escapar(x.glosa)})` : '');
  const pasos = [{ frame: inicio, escalon: 45, pausa: 1100, texto: `Las piezas: ${piezas.map(nombrar).join(' + ')}.` }];

  // Piezas invertidas (combinada): primero se dan la vuelta.
  const valores = piezas.map((x, i) => {
    const src = letras(x.origen);
    if (!x.invierte) return src.map((l, j) => ({ k: `p${i}_${j}`, l }));
    const dst = letras(x.valor);
    return dst.map((l, j) => ({ k: `p${i}_${src.length - 1 - j}`, l }));
  });
  const invertidas = piezas.filter((x) => x.invierte);
  if (invertidas.length) {
    pasos.push({
      frame: conSignos(valores.map((b, i) => b.map((it) => ({ ...it, c: piezas[i].invierte ? 'materia espejo' : 'materia' })))),
      mov: 'giro', dur: 1100, escalon: 80,
      texto: invertidas.map((x) => `${v(x.origen)} de vuelta es ${v(x.valor)}`).join('; ') + '…',
    });
  }

  const dst = letras(p.respuesta);
  const unidas = valores.flat();
  if (unidas.length !== dst.length) return null;
  pasos.push({
    frame: unidas.map((it, i) => ({ k: it.k, l: dst[i], c: 'final' })),
    dur: 850, salida: 'esfuma', texto: `…juntas forman ${v(p.respuesta)}.`,
  });
  return { materia: piezas.flatMap((x) => [x.origen, x.glosa].filter(Boolean)), pasos };
}

/** Contenedor: la palabra de fuera se abre y la de dentro entra. */
function guionContenedor(p) {
  const m = p.desmontaje.match(/([A-ZÁÉÍÓÚÜÑ]+)\(([A-ZÁÉÍÓÚÜÑ]+)\)([A-ZÁÉÍÓÚÜÑ]*)/);
  if (!m) return null;
  const [, pre, dentro, post] = m;
  const fuera = pre + post;
  const lsPre = letras(pre), lsDentro = letras(dentro), lsPost = letras(post);
  const dst = letras(p.respuesta);
  const fueraItems = [...lsPre, ...lsPost].map((l, j) => ({ k: 'f' + j, l }));
  const dentroItems = lsDentro.map((l, j) => ({ k: 'd' + j, l }));
  const izq = fueraItems.slice(0, lsPre.length);
  const der = fueraItems.slice(lsPre.length);

  return {
    materia: [dentro, fuera],
    pasos: [
      {
        frame: [...dentroItems.map((x) => ({ ...x, c: 'materia' })), { k: 'h0', hueco: true }, ...fueraItems.map((x) => ({ ...x, c: 'materia' }))],
        escalon: 45, pausa: 1000, texto: `Las piezas: ${v(dentro)} y ${v(fuera)}.`,
      },
      {
        frame: [
          ...izq.map((x) => ({ ...x, c: 'materia' })),
          { k: 'h1', hueco: true },
          ...dentroItems.map((x) => ({ ...x, c: 'materia alta' })),
          { k: 'h2', hueco: true },
          ...der.map((x) => ({ ...x, c: 'materia' })),
        ],
        mov: 'arco', dur: 950, escalon: 40, pausa: 700, texto: `${v(fuera)} se abre como una caja…`,
      },
      {
        frame: [...izq, ...dentroItems, ...der].map((x, i) => ({ k: x.k, l: dst[i], c: 'final' })),
        dur: 800, escalon: 30, texto: `…${v(dentro)} entra dentro: ${v(p.respuesta)}.`,
      },
    ],
  };
}

/** Plan B si los datos no encajan con ningún guion: la respuesta aparece letra a letra. */
function guionSencillo(p) {
  return {
    materia: [],
    pasos: [{ frame: fila(letras(p.respuesta), 'r', 'final'), escalon: 110, texto: escapar(p.desmontaje) }],
  };
}

// ── Escenario: anima transiciones entre fotogramas ─────────────────────

const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const CURVA = 'cubic-bezier(.65,.02,.22,1)';

export class Escenario {
  constructor(el) {
    this.el = el;
    this.nodos = new Map();
    this.rapido = false;
  }

  reiniciar() {
    this.el.replaceChildren();
    this.nodos.clear();
    this.eraFinal = new Set();
    this.rapido = false;
    this.el.classList.remove('destello');
    // El logo espera en el escenario hasta que salen las primeras fichas.
    const caja = document.createElement('span');
    caja.className = 'caja-escenario';
    caja.setAttribute('aria-hidden', 'true');
    caja.innerHTML = '<svg><use href="#i-logo"/></svg>';
    this.el.append(caja);
    this.caja = caja;
  }

  abrirCaja(d) {
    const caja = this.caja;
    if (!caja) return;
    this.caja = null;
    if (!d) { caja.remove(); return; }
    caja.animate(
      [{ opacity: 1, transform: 'translate(-50%, -50%)' }, { opacity: 0, transform: 'translate(-50%, -80%) scale(1.25)' }],
      { duration: 450, easing: 'ease-in', fill: 'forwards' },
    ).finished.then(() => caja.remove(), () => caja.remove());
  }

  /** Fija el tamaño de ficha para que el fotograma más ancho quepa en pantalla. */
  medir(pasos) {
    const peso = (frame) => frame.reduce((s, it) => s + (it.hueco ? 0.45 : it.signo ? 0.6 : 1), 0);
    const maximo = Math.max(1, ...pasos.map((x) => peso(x.frame)));
    const ancho = this.el.clientWidth || 320;
    const huecoPx = 5;
    const tam = Math.floor(Math.min(50, (ancho - huecoPx * maximo) / maximo));
    this.el.style.setProperty('--tam', `${Math.max(18, tam)}px`);
  }

  crear(it) {
    const n = document.createElement('span');
    n.setAttribute('aria-hidden', 'true');
    this.vestir(n, it);
    n.textContent = it.signo || it.l || '';
    n.dataset.l = it.l || '';
    return n;
  }

  vestir(n, it, i = 0) {
    n.className = `ficha ${it.signo ? 'signo' : ''} ${it.hueco ? 'hueco' : ''} ${it.c || ''}`.trim();
    n.style.setProperty('--i', i);
  }

  async ir(frame, { mov = 'directo', dur = 750, escalon = 0, salida = 'esfuma' } = {}) {
    const sinAnim = this.rapido || reducido();
    const d = sinAnim ? 0 : dur;
    this.abrirCaja(d);
    const caja = this.el.getBoundingClientRect();
    const antes = new Map();
    for (const [k, n] of this.nodos) antes.set(k, n.getBoundingClientRect());

    // Las fichas que desaparecen se quedan flotando donde estaban mientras salen.
    const nuevas = new Set(frame.map((it) => it.k));
    const salen = [];
    for (const [k, n] of this.nodos) {
      if (nuevas.has(k)) continue;
      const r = antes.get(k);
      Object.assign(n.style, {
        position: 'absolute', margin: '0',
        left: `${r.left - caja.left}px`, top: `${r.top - caja.top}px`,
        width: `${r.width}px`, height: `${r.height}px`,
      });
      salen.push(n);
      this.nodos.delete(k);
    }

    const cambios = [];
    const orden = frame.map((it, i) => {
      let n = this.nodos.get(it.k);
      const nuevo = !n;
      if (nuevo) {
        n = this.crear(it);
        this.nodos.set(it.k, n);
      } else if (it.l && n.dataset.l !== it.l) {
        cambios.push([n, it.l]);
      }
      this.vestir(n, it, i);
      return { n, it, nuevo, i };
    });
    for (const { n } of orden) this.el.appendChild(n);

    if (sinAnim) {
      for (const [n, l] of cambios) { n.textContent = l; n.dataset.l = l; }
      salen.forEach((n) => n.remove());
      this.recordarFinales(frame);
      return;
    }

    const anims = [];
    for (const { n, it, nuevo, i } of orden) {
      const delay = i * escalon;
      if (nuevo) {
        anims.push(n.animate(
          [{ opacity: 0, transform: 'translateY(-0.7em) scale(.85)' }, { opacity: 1, transform: 'none' }],
          { duration: d * 0.7, delay, easing: CURVA, fill: 'backwards' },
        ));
        continue;
      }
      const a = antes.get(it.k);
      const b = n.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      const seMueve = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
      const cambio = cambios.find(([m]) => m === n);

      if (seMueve) {
        let kf;
        if (mov === 'arco') {
          const alto = Math.min(38, 12 + Math.abs(dx) * 0.25) * (i % 2 ? 1 : -1);
          kf = [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: `translate(${dx / 2}px, ${dy / 2 + alto}px) rotate(${i % 2 ? 5 : -5}deg)`, offset: 0.5 },
            { transform: 'none' },
          ];
        } else if (mov === 'giro') {
          kf = [
            { transform: `translate(${dx}px, ${dy}px) rotateY(0deg)` },
            { transform: `translate(${dx / 2}px, ${dy / 2 - 22}px) rotateY(180deg) scale(1.08)`, offset: 0.5 },
            { transform: 'translate(0, 0) rotateY(360deg)' },
          ];
        } else {
          kf = [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }];
        }
        anims.push(n.animate(kf, { duration: d, delay, easing: CURVA, fill: 'backwards' }));
        if (cambio) setTimeout(() => { n.textContent = cambio[1]; n.dataset.l = cambio[1]; }, delay + d / 2);
      } else if (!cambio && it.c?.includes('final') && !this.eraFinal?.has(it.k)) {
        anims.push(n.animate(
          [{ transform: 'rotateX(0)' }, { transform: 'rotateX(90deg)', offset: 0.45 }, { transform: 'rotateX(0) scale(1.06)', offset: 0.8 }, { transform: 'none' }],
          { duration: Math.max(d, 450), delay, easing: 'ease-in-out' },
        ));
      } else if (cambio) {
        // Volteo vertical: la letra cambia en el canto.
        const giro = n.animate(
          [{ transform: 'rotateX(0)' }, { transform: 'rotateX(90deg)', offset: 0.5 }, { transform: 'rotateX(0)' }],
          { duration: Math.max(d, 500), delay, easing: 'ease-in-out' },
        );
        setTimeout(() => { n.textContent = cambio[1]; n.dataset.l = cambio[1]; }, delay + Math.max(d, 500) / 2);
        anims.push(giro);
      }
    }

    for (const n of salen) {
      const kf = salida === 'cae'
        ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(2.2em) rotate(28deg)' }]
        : [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(.6)', filter: 'blur(3px)' }];
      const a = n.animate(kf, { duration: d * 0.7, easing: salida === 'cae' ? 'cubic-bezier(.5,0,.9,.5)' : CURVA, fill: 'forwards' });
      a.finished.then(() => n.remove(), () => n.remove());
      anims.push(a);
    }

    await Promise.all(anims.map((a) => a.finished.catch(() => {})));
    for (const [n, l] of cambios) { n.textContent = l; n.dataset.l = l; }
    this.recordarFinales(frame);
  }

  recordarFinales(frame) {
    this.eraFinal = new Set(frame.filter((it) => it.c?.includes('final')).map((it) => it.k));
  }

  /** Destellos de mago al terminar. */
  destellar() {
    if (this.rapido || reducido()) return;
    this.el.classList.add('destello');
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('span');
      s.className = 'chispa';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = '✦';
      const ang = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const r = 60 + Math.random() * 60;
      s.style.setProperty('--x', `${Math.cos(ang) * r * 1.6}px`);
      s.style.setProperty('--y', `${Math.sin(ang) * r * 0.7}px`);
      s.style.animationDelay = `${i * 40}ms`;
      this.el.appendChild(s);
      setTimeout(() => s.remove(), 1600);
    }
  }
}
