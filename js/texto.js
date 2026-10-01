// Utilidades de texto: comparación sin tildes (pero con ñ), búsqueda de
// fragmentos dentro de la pista y troceado de la pista en segmentos marcados.

const quitarMarcas = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Letra canónica para comparar: mayúscula, sin tildes ni diéresis; la Ñ se conserva. */
export function normalizarLetra(c) {
  const u = c.normalize('NFC').toUpperCase();
  return u === 'Ñ' ? 'Ñ' : quitarMarcas(u);
}

/** Cadena canónica: solo letras A-Z y Ñ. */
export function normalizar(s) {
  return Array.from(String(s).normalize('NFC'))
    .map(normalizarLetra)
    .join('')
    .replace(/[^A-ZÑ]/g, '');
}

/** Letras visibles de una palabra (mayúsculas, conservando tildes). */
export function letras(s) {
  return Array.from(String(s).normalize('NFC').toUpperCase())
    .filter((c) => /^[A-ZÑ]$/.test(normalizarLetra(c)));
}

/** Pliega cada carácter a minúscula sin tilde, manteniendo la longitud (1 carácter por carácter). */
export function plegar(s) {
  return Array.from(s)
    .map((c) => {
      const l = c.toLowerCase();
      if (l === 'ñ') return 'ñ';
      return (quitarMarcas(l) || l)[0];
    })
    .join('');
}

export const esLetraPlegada = (c) => !!c && /[a-zñ]/.test(c);

/**
 * Busca `fragmento` dentro de `texto` sin distinguir tildes ni mayúsculas.
 * Devuelve [inicio, fin) en índices de carácter, o null.
 */
export function buscar(texto, fragmento, { desde = 0, ocupado = () => false, palabra = false } = {}) {
  const p = plegar(texto);
  const f = plegar(String(fragmento).trim());
  if (!f) return null;
  let i = p.indexOf(f, desde);
  while (i !== -1) {
    const fin = i + f.length;
    const bordes = !palabra || (!esLetraPlegada(p[i - 1]) && !esLetraPlegada(p[fin]));
    if (bordes && !ocupado(i, fin)) return [i, fin];
    i = p.indexOf(f, i + 1);
  }
  return null;
}

/** Trocea el texto según rangos no solapados [{ini, fin, tipo}] → [{texto, tipo}]. */
export function segmentar(texto, rangos) {
  const chars = Array.from(texto);
  const orden = [...rangos].sort((a, b) => a.ini - b.ini);
  const out = [];
  let cursor = 0;
  for (const r of orden) {
    if (r.ini > cursor) out.push({ texto: chars.slice(cursor, r.ini).join(''), tipo: null });
    out.push({ texto: chars.slice(r.ini, r.fin).join(''), tipo: r.tipo });
    cursor = r.fin;
  }
  if (cursor < chars.length) out.push({ texto: chars.slice(cursor).join(''), tipo: null });
  return out;
}

/** Palabras escritas en MAYÚSCULAS dentro de un texto ("RAMO desordenado → ROMA" → [RAMO, ROMA]). */
export function mayusculas(s) {
  return String(s)
    .split(/[^\p{L}]+/u)
    .filter((w) => w && w === w.toUpperCase() && w !== w.toLowerCase());
}

export const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
