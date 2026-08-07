/**
 * data.js — Estrutura inicial da Árvore da Vida com 4 níveis pré-carregados
 * OTT IDs de: https://tree.opentreeoflife.org/
 */

export const CLADE_COLORS = {
  life:         '#FFFFFF',
  bacteria:     '#FF8C42',
  archaea:      '#00CED1',
  eukaryota:    '#9B59B6',
  animalia:     '#4A90E2',
  chordata:     '#5BA3F5',
  mammalia:     '#7EC8E3',
  aves:         '#FFD166',
  plantae:      '#27AE60',
  fungi:        '#E67E22',
  chromista:    '#DA70D6',
  protozoa:     '#FF69B4',
  arthropoda:   '#E74C3C',
  insecta:      '#FF6B6B',
  default:      '#7F8C8D',
};

function mk(id, name, rank, colorKey, children = null) {
  return { ott_id: id, name, rank, color: CLADE_COLORS[colorKey] || CLADE_COLORS.default, children };
}

export const INITIAL_TREE = mk(93302, 'Life', 'life', 'life', [

  // ── BACTERIA ──────────────────────────────────────────────────────────────
  mk(844192, 'Bacteria', 'domain', 'bacteria', [
    mk(335569, 'Proteobacteria', 'phylum', 'bacteria'),
    mk(335534, 'Firmicutes',     'phylum', 'bacteria'),
    mk(679934, 'Actinobacteria', 'phylum', 'bacteria'),
    mk(1084532,'Cyanobacteria',  'phylum', 'bacteria'),
    mk(303370, 'Bacteroidetes',  'phylum', 'bacteria'),
    mk(708638, 'Chloroflexi',    'phylum', 'bacteria'),
    mk(117748, 'Spirochaetes',   'phylum', 'bacteria'),
  ]),

  // ── ARCHAEA ───────────────────────────────────────────────────────────────
  mk(996421, 'Archaea', 'domain', 'archaea', [
    mk(417974, 'Euryarchaeota',  'phylum', 'archaea'),
    mk(555379, 'Crenarchaeota',  'phylum', 'archaea'),
    mk(805080, 'Thaumarchaeota', 'phylum', 'archaea'),
  ]),

  // ── EUKARYOTA ─────────────────────────────────────────────────────────────
  mk(304358, 'Eukaryota', 'domain', 'eukaryota', [

    // ANIMALIA ──────────────────────────────────────────────────────────────
    mk(691846, 'Animalia', 'kingdom', 'animalia', [
      mk(28944,  'Chordata',       'phylum', 'chordata', [
        mk(244265,'Mammalia',       'class',  'mammalia', [
          mk(417950,'Primates',    'order', 'mammalia'),
          mk(44565, 'Carnivora',   'order', 'mammalia'),
          mk(122252,'Rodentia',    'order', 'mammalia'),
          mk(622916,'Artiodactyla','order', 'mammalia'),
          mk(19293, 'Chiroptera',  'order', 'mammalia'),
          mk(137682,'Cetacea',     'order', 'mammalia'),
        ]),
        mk(212701,'Aves',           'class',  'aves', [
          mk(916137,'Passeriformes', 'order', 'aves'),
          mk(803497,'Accipitriformes','order','aves'),
          mk(37609, 'Galliformes',  'order', 'aves'),
          mk(46613, 'Anseriformes', 'order', 'aves'),
          mk(41347, 'Psittaciformes','order','aves'),
        ]),
        mk(1703582,'Actinopterygii','class', 'chordata'),
        mk(544595,'Amphibia',       'class', 'chordata'),
        mk(474573,'Chondrichthyes', 'class', 'chordata'),
        mk(351495,'Reptilia',       'class', 'chordata'),
      ]),
      mk(122380, 'Arthropoda',     'phylum', 'arthropoda', [
        mk(246171,'Insecta',        'class', 'insecta', [
          mk(38164, 'Coleoptera',   'order', 'insecta'),
          mk(489275,'Lepidoptera',  'order', 'insecta'),
          mk(48803, 'Diptera',      'order', 'insecta'),
          mk(630955,'Hymenoptera',  'order', 'insecta'),
          mk(181391,'Hemiptera',    'order', 'insecta'),
        ]),
        mk(189701,'Arachnida',      'class', 'arthropoda'),
        mk(598033,'Crustacea',      'class', 'arthropoda'),
        mk(573537,'Myriapoda',      'class', 'arthropoda'),
      ]),
      mk(802117, 'Mollusca',       'phylum', 'animalia'),
      mk(395057, 'Nematoda',       'phylum', 'animalia'),
      mk(94893,  'Annelida',       'phylum', 'animalia'),
      mk(451037, 'Echinodermata',  'phylum', 'animalia'),
      mk(67819,  'Porifera',       'phylum', 'animalia'),
      mk(119492, 'Cnidaria',       'phylum', 'animalia'),
    ]),

    // PLANTAE ───────────────────────────────────────────────────────────────
    mk(35510, 'Plantae', 'kingdom', 'plantae', [
      mk(1007992,'Magnoliopsida',  'class', 'plantae', [
        mk(803714,'Asterales',     'order', 'plantae'),
        mk(82483, 'Fabales',       'order', 'plantae'),
        mk(803708,'Rosales',       'order', 'plantae'),
        mk(803706,'Lamiales',      'order', 'plantae'),
        mk(803710,'Poales',        'order', 'plantae'),
      ]),
      mk(1090898,'Pinopsida',      'class', 'plantae'),
      mk(846458, 'Bryophyta',      'phylum','plantae'),
      mk(511967, 'Chlorophyta',    'phylum','plantae'),
    ]),

    // FUNGI ─────────────────────────────────────────────────────────────────
    mk(352914, 'Fungi', 'kingdom', 'fungi', [
      mk(439373, 'Ascomycota',     'phylum', 'fungi'),
      mk(364612, 'Basidiomycota',  'phylum', 'fungi'),
      mk(4218,   'Zygomycota',     'phylum', 'fungi'),
      mk(311463, 'Glomeromycota',  'phylum', 'fungi'),
    ]),

    // PROTOZOA ──────────────────────────────────────────────────────────────
    mk(1042680,'Protozoa', 'kingdom', 'protozoa', [
      mk(207396, 'Amoebozoa',      'phylum', 'protozoa'),
      mk(349311, 'Euglenozoa',     'phylum', 'protozoa'),
    ]),

    // CHROMISTA ─────────────────────────────────────────────────────────────
    mk(356221, 'Chromista', 'kingdom', 'chromista', [
      mk(799198, 'Ochrophyta',     'phylum', 'chromista'),
      mk(339564, 'Apicomplexa',    'phylum', 'chromista'),
    ]),
  ]),
]);
