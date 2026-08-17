/**
 * DataService — Integração com OpenTree of Life + Wikipedia
 */

const OPENTREE = 'https://api.opentreeoflife.org/v3';
const WIKI     = 'https://en.wikipedia.org/api/rest_v1/page/summary';

const _cache = new Map();

// Flags que devem ser ignoradas (apenas táxons duvidosos, não os extintos:
// espécies extintas como Homo neanderthalensis são parte legítima da árvore
// da vida e estavam sendo ocultadas).
const BAD_FLAGS = new Set([
  'dubious', 'hidden', 'incertae_sedis_inherited',
  'unplaced', 'environmental', 'not_otu',
]);

/**
 * Busca os filhos diretos de um táxon na OpenTree API (com tratamento seguro para falhas de proxy).
 * @param {number|string} id
 * @param {string} name
 * @returns {Promise<object[]>}
 */
export async function fetchChildren(id, name) {
  const key = `ch_${id}_${name}`;
  if (_cache.has(key)) return _cache.get(key);

  let ottId = id;

  try {
    if (name) {
      try {
        const matchRes = await fetch(`${OPENTREE}/tnrs/match_names`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: [name] }),
        });

        if (matchRes.ok) {
          const matchData = await matchRes.json();
          const matched = matchData.results?.[0]?.matches?.[0];
          if (matched && matched.taxon && matched.taxon.ott_id) {
            ottId = matched.taxon.ott_id;
          }
        }
      } catch (proxyErr) {
        console.warn(`[DataService] OpenTree match_name falhou para "${name}".`);
      }
    }

    const res = await fetch(`${OPENTREE}/taxonomy/taxon_info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ott_id: ottId, include_children: true }),
    });

    if (!res.ok) {
      console.warn(`[DataService] Não foi possível carregar dados da API para: ${name} (ID: ${id})`);
      _cache.set(key, []);
      return [];
    }

    const data = await res.json();

    const children = (data.children || [])
      .filter(c => !c.flags || !c.flags.some(f => BAD_FLAGS.has(f)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .slice(0, 60);

    _cache.set(key, children);
    return children;
  } catch (err) {
    console.warn('[DataService] OpenTree error:', err);
    _cache.set(key, []);
    return [];
  }
}

/**
 * Busca descrição e imagem da Wikipedia para um táxon.
 * @param {string} name - Nome científico
 * @returns {Promise<object|null>}
 */
export async function fetchWikipediaInfo(name) {
  const key = `wk_${name}`;
  if (_cache.has(key)) return _cache.get(key);

  try {
    const slug = encodeURIComponent(name.trim().replace(/ /g, '_'));
    const res  = await fetch(`${WIKI}/${slug}`);

    if (!res.ok) {
      _cache.set(key, null);
      return null;
    }

    const data = await res.json();
    if (data.type === 'disambiguation') {
      _cache.set(key, null);
      return null;
    }

    _cache.set(key, data);
    return data;
  } catch (err) {
    _cache.set(key, null);
    return null;
  }
}