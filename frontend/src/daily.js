/**
 * daily.js — Espécie do Dia + Curiosidade do Dia
 * Seleção determinística pela data (muda todo dia).
 */

const DAY_MS = 86400000;

function dayIndex() {
  return Math.floor(Date.now() / DAY_MS);
}

// ─── ESPÉCIES DO DIA ─────────────────────────────────────────────────────────
// Cada entrada: name (nome científico), lineage (caminho evolutivo),
// distribution (localização), wikiTitle (artigo PT da Wikipedia).
const SPECIES_OF_DAY = [
  {
    name: 'Panthera leo',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Carnivora', 'Felidae', 'Panthera leo'],
    distribution: 'Savanas e planícies da África subsaariana, com uma pequena população na Índia (Floresta de Gir).',
    wikiTitle: 'Leão'
  },
  {
    name: 'Panthera tigris',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Carnivora', 'Felidae', 'Panthera tigris'],
    distribution: 'Florestas da Ásia, da Índia ao Extremo Oriente russo.',
    wikiTitle: 'Tigre'
  },
  {
    name: 'Loxodonta africana',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Proboscidea', 'Elephantidae', 'Loxodonta'],
    distribution: 'Savanas e florestas da África subsaariana.',
    wikiTitle: 'Elefante-africano'
  },
  {
    name: 'Balaenoptera musculus',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Cetacea', 'Balaenopteridae', 'Balaenoptera'],
    distribution: 'Todos os oceanos do planeta, desde os polos até os trópicos.',
    wikiTitle: 'Baleia-azul'
  },
  {
    name: 'Gorilla gorilla',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Primates', 'Hominidae', 'Gorilla'],
    distribution: 'Florestas tropicais da África Central e Ocidental.',
    wikiTitle: 'Gorila-ocidental'
  },
  {
    name: 'Homo sapiens',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Primates', 'Hominidae', 'Homo sapiens'],
    distribution: 'Distribuído por praticamente todos os ambientes do planeta.',
    wikiTitle: 'Homo sapiens'
  },
  {
    name: 'Canis lupus',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Carnivora', 'Canidae', 'Canis'],
    distribution: 'Hemisfério Norte: florestas, tundras e montanhas da América do Norte, Europa e Ásia.',
    wikiTitle: 'Lobo-cinzento'
  },
  {
    name: 'Orcinus orca',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Cetacea', 'Delphinidae', 'Orcinus'],
    distribution: 'Presente em todos os oceanos, do Ártico à Antártida.',
    wikiTitle: 'Orca'
  },
  {
    name: 'Physeter macrocephalus',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Cetacea', 'Physeteridae', 'Physeter'],
    distribution: 'Oceanos profundos de todo o mundo.',
    wikiTitle: 'Cachalote'
  },
  {
    name: 'Carcharodon carcharias',
    lineage: ['Animalia', 'Chordata', 'Chondrichthyes', 'Lamniformes', 'Lamnidae', 'Carcharodon'],
    distribution: 'Águas costeiras temperadas e subtropicais de todos os oceanos.',
    wikiTitle: 'Tubarão-branco'
  },
  {
    name: 'Chelonia mydas',
    lineage: ['Animalia', 'Chordata', 'Reptilia', 'Testudines', 'Cheloniidae', 'Chelonia'],
    distribution: 'Oceanos tropicais e subtropicais; nidifica em praias de areia.',
    wikiTitle: 'Tartaruga-verde'
  },
  {
    name: 'Crocodylus niloticus',
    lineage: ['Animalia', 'Chordata', 'Reptilia', 'Crocodylia', 'Crocodylidae', 'Crocodylus'],
    distribution: 'Rios, lagos e manguezais da África subsaariana e Madagascar.',
    wikiTitle: 'Crocodilo-do-Nilo'
  },
  {
    name: 'Falco peregrinus',
    lineage: ['Animalia', 'Chordata', 'Aves', 'Falconiformes', 'Falconidae', 'Falco'],
    distribution: 'Um dos animais mais distribuídos: todos os continentes, exceto a Antártida.',
    wikiTitle: 'Falcão-peregrino'
  },
  {
    name: 'Struthio camelus',
    lineage: ['Animalia', 'Chordata', 'Aves', 'Struthioniformes', 'Struthionidae', 'Struthio'],
    distribution: 'Savanas e desertos da África.',
    wikiTitle: 'Avestruz'
  },
  {
    name: 'Aptenodytes forsteri',
    lineage: ['Animalia', 'Chordata', 'Aves', 'Sphenisciformes', 'Spheniscidae', 'Aptenodytes'],
    distribution: 'Litoral e gelo marinho da Antártida.',
    wikiTitle: 'Pinguim-imperador'
  },
  {
    name: 'Ramphastos toco',
    lineage: ['Animalia', 'Chordata', 'Aves', 'Piciformes', 'Ramphastidae', 'Ramphastos'],
    distribution: 'Cerrado, florestas e bordas de mata da América do Sul.',
    wikiTitle: 'Tucano-toco'
  },
  {
    name: 'Ornithorhynchus anatinus',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Monotremata', 'Ornithorhynchidae', 'Ornithorhynchus'],
    distribution: 'Rios e riachos do leste da Austrália e da Tasmânia.',
    wikiTitle: 'Ornitorrinco'
  },
  {
    name: 'Apis mellifera',
    lineage: ['Animalia', 'Arthropoda', 'Insecta', 'Hymenoptera', 'Apidae', 'Apis'],
    distribution: 'Presente em todos os continentes, exceto a Antártida.',
    wikiTitle: 'Abelha-europeia'
  },
  {
    name: 'Octopus vulgaris',
    lineage: ['Animalia', 'Mollusca', 'Cephalopoda', 'Octopoda', 'Octopodidae', 'Octopus'],
    distribution: 'Mares tropicais e temperados, entre rochas e recifes costeiros.',
    wikiTitle: 'Polvo-comum'
  },
  {
    name: 'Panthera onca',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Carnivora', 'Felidae', 'Panthera'],
    distribution: 'Américas, do México à Argentina; no Brasil habita a Amazônia e o Pantanal.',
    wikiTitle: 'Onça-pintada'
  },
  {
    name: 'Ailuropoda melanoleuca',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Carnivora', 'Ursidae', 'Ailuropoda'],
    distribution: 'Florestas de bambu das montanhas da China central.',
    wikiTitle: 'Panda-gigante'
  },
  {
    name: 'Ursus maritimus',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Carnivora', 'Ursidae', 'Ursus'],
    distribution: 'Gelo marinho e costas do Ártico.',
    wikiTitle: 'Urso-polar'
  },
  {
    name: 'Tursiops truncatus',
    lineage: ['Animalia', 'Chordata', 'Mammalia', 'Cetacea', 'Delphinidae', 'Tursiops'],
    distribution: 'Mares tropicais e temperados de todos os oceanos.',
    wikiTitle: 'Golfinho-nariz-de-garrafa'
  },
  {
    name: 'Dendrobates tinctorius',
    lineage: ['Animalia', 'Chordata', 'Amphibia', 'Anura', 'Dendrobatidae', 'Dendrobates'],
    distribution: 'Florestas tropicais úmidas do norte da América do Sul (Guianas e Brasil).',
    wikiTitle: 'Dendrobates tinctorius'
  },
  {
    name: 'Sequoia sempervirens',
    lineage: ['Plantae', 'Tracheophyta', 'Pinopsida', 'Cupressales', 'Cupressaceae', 'Sequoia'],
    distribution: 'Faixa costeira úmida da Califórnia (EUA).',
    wikiTitle: 'Sequoia-vermelha'
  },
  {
    name: 'Cocos nucifera',
    lineage: ['Plantae', 'Tracheophyta', 'Liliopsida', 'Arecales', 'Arecaceae', 'Cocos'],
    distribution: 'Litorais tropicais de todo o mundo; origem provável no Indo-Pacífico.',
    wikiTitle: 'Coqueiro'
  },
  {
    name: 'Solanum lycopersicum',
    lineage: ['Plantae', 'Tracheophyta', 'Magnoliopsida', 'Solanales', 'Solanaceae', 'Solanum'],
    distribution: 'Originário dos Andes; hoje cultivado em todo o planeta.',
    wikiTitle: 'Tomate'
  },
  {
    name: 'Triticum aestivum',
    lineage: ['Plantae', 'Tracheophyta', 'Liliopsida', 'Poales', 'Poaceae', 'Triticum'],
    distribution: 'Cultivado em larga escala em todos os continentes habitados.',
    wikiTitle: 'Trigo'
  },
  {
    name: 'Zea mays',
    lineage: ['Plantae', 'Tracheophyta', 'Liliopsida', 'Poales', 'Poaceae', 'Zea'],
    distribution: 'Originário do México; cultivado mundialmente.',
    wikiTitle: 'Milho'
  },
  {
    name: 'Amanita muscaria',
    lineage: ['Fungi', 'Basidiomycota', 'Agaricomycetes', 'Agaricales', 'Amanitaceae', 'Amanita'],
    distribution: 'Florestas temperadas e boreais do hemisfério norte.',
    wikiTitle: 'Amanita muscaria'
  },
  {
    name: 'Saccharomyces cerevisiae',
    lineage: ['Fungi', 'Ascomycota', 'Saccharomycetes', 'Saccharomycetales', 'Saccharomycetaceae', 'Saccharomyces'],
    distribution: 'Encontrado em todo o planeta, sobretudo em frutas e fermentações.',
    wikiTitle: 'Saccharomyces cerevisiae'
  },
  {
    name: 'Escherichia coli',
    lineage: ['Bacteria', 'Pseudomonadota', 'Gammaproteobacteria', 'Enterobacterales', 'Enterobacteriaceae', 'Escherichia'],
    distribution: 'Intestino de animais de sangue quente e ambientes aquáticos em geral.',
    wikiTitle: 'Escherichia coli'
  },
  {
    name: 'Halobacterium salinarum',
    lineage: ['Archaea', 'Euryarchaeota', 'Halobacteria', 'Halobacteriales', 'Halobacteriaceae', 'Halobacterium'],
    distribution: 'Lagos hipersalinos e salinas, como o Mar Morto e o Grande Lago Salgado.',
    wikiTitle: 'Halobacterium'
  },
  {
    name: 'Deinococcus radiodurans',
    lineage: ['Bacteria', 'Deinococcota', 'Deinococci', 'Deinococcales', 'Deinococcaceae', 'Deinococcus'],
    distribution: 'Solo, poeira, água doce e ambientes com alta radiação.',
    wikiTitle: 'Deinococcus radiodurans'
  },
  {
    name: 'Thermus aquaticus',
    lineage: ['Bacteria', 'Deinococcota', 'Deinococci', 'Thermales', 'Thermaceae', 'Thermus'],
    distribution: 'Fontes termais e águas quentes, como as do Parque Yellowstone.',
    wikiTitle: 'Thermus aquaticus'
  }
];

// ─── CURIOSIDADES DO DIA (CIÊNCIA) ───────────────────────────────────────────
const SCIENCE_CURIOSITIES = [
  'O corpo humano adulto contém cerca de 30 trilhões de células, mas abriga aproximadamente 39 trilhões de bactérias.',
  'Uma baleia-azul pode pesar mais de 180 toneladas — seu coração é do tamanho de um carro pequeno.',
  'A luz do Sol leva cerca de 8 minutos e 20 segundos para chegar à Terra.',
  'O DNA de uma única célula humana, esticado, teria cerca de 2 metros de comprimento.',
  'Os polvos têm três corações e sangue azul.',
  'O olho de um avestruz é maior que o próprio cérebro.',
  'A Terra gira a cerca de 1.670 km/h no equador, e orbita o Sol a cerca de 107.000 km/h.',
  'As formigas podem carregar até 50 vezes o próprio peso corporal.',
  'O sal de cozinha (NaCl) é formado por um elemento extremamente reativo (sódio) e um gás tóxico (cloro).',
  'Uma abelha bate as asas cerca de 200 vezes por segundo.',
  'A água cobre cerca de 71% da superfície da Terra, mas 97% dela é salgada.',
  'Os camaleões mudam de cor principalmente para se comunicar e regular a temperatura, não para se camuflar.',
  'O coração humano bate, em média, cerca de 100.000 vezes por dia.',
  'A Antártida é o maior deserto do mundo — o mais seco e frio de todos.',
  'Os tubarões existem há mais de 400 milhões de anos, antes das árvores.',
  'A cada segundo, o Sol transforma cerca de 4 milhões de toneladas de matéria em energia.',
  'O elefante é o único mamífero que não consegue pular.',
  'O sangue humano circula por cerca de 96.000 km de vasos sanguíneos.',
  'Um segundo terrestre dura hoje um pouco mais do que há milhões de anos — a rotação da Terra desacelera.',
  'As plantas da Terra produzem cerca de metade do oxigênio; as algas marinhas produzem a maior parte.',
  'O nariz humano é capaz de detectar mais de 1 trilhão de odores diferentes.',
  'As estrelas de nêutrons podem girar centenas de vezes por segundo.',
  'Uma colher de chá de matéria de uma estrela de nêutrons pesaria bilhões de toneladas.',
  'O cérebro humano tem cerca de 86 bilhões de neurônios.',
  'Os dinossauros não eram répteis de sangue frio como se pensava — vários eram de sangue quente.',
  'A luz é a coisa mais rápida do universo: cerca de 300.000 km por segundo.',
  'O som viaja cerca de 4 vezes mais rápido na água do que no ar.',
  'Uma girafa tem o mesmo número de vértebras no pescoço que um humano: sete.',
  'As borboletas percebem o gosto com as patas.',
  'O Monte Everest cresce alguns milímetros por ano por causa do movimento das placas tectônicas.',
  'Cerca de 99% de toda a biomassa animal é composta por invertebrados.',
  'O fígado é o único órgão humano capaz de se regenerar completamente.',
  'Os ursos-polares têm pele negra sob pelos transparentes e ocos.',
  'Existem mais estrelas no universo observável do que grãos de areia em todas as praias da Terra.',
  'As aranhas produzem seda mais forte que o aço de mesma espessura.',
  'O corpo de um recém-nascido tem cerca de 300 ossos; o adulto, 206.',
  'A cada minuto, a Terra recebe energia solar suficiente para abastecer o mundo por um ano.',
  'Os pinguins só vivem no hemisfério sul.',
  'O cérebro usa cerca de 20% de toda a energia que o corpo consome.',
  'Um raio pode atingir temperaturas de cerca de 30.000 °C — cinco vezes mais quente que a superfície do Sol.',
  'As células do seu corpo se renovam: as da pele, por exemplo, a cada poucas semanas.',
  'O choco (sepia) tem três corações e pode mudar de cor e textura em milissegundos.',
  'A Grande Muralha da China não é visível a olho nu do espaço, ao contrário do mito.',
  'O sangue dos moluscos é azul por conter hemocianina, à base de cobre.',
  'Um ano-luz é a distância que a luz percorre em um ano: quase 9,5 trilhões de quilômetros.',
  'As lagartixas podem escalar vidro graças a milhões de cerdas microscópicas nas patas.',
  'O núcleo da Terra é uma esfera de ferro e níquel quente o bastante para fundir metais.',
  'A lagosta pode viver mais de 50 anos e nunca para de crescer.',
  'Os beija-flores são as únicas aves que conseguem voar para trás.',
  'Uma célula humana é tão pequena que cabem cerca de 10 milhões em uma área da ponta de uma agulha.',
  'A Lua se afasta da Terra cerca de 3,8 cm por ano.',
  'As penas de uma coruja têm bordas que tornam o voo quase silencioso.',
  'O plutônio foi nomeado em homenagem a Plutão, que por sua vez recebeu o nome do deus romano do submundo.',
  'As víboras percebem o calor dos animais por meio de órgãos sensoriais especiais na face.',
  'A teoria da evolução de Darwin foi publicada em 1859 no livro "A Origem das Espécies".',
  'O átomo de hidrogênio é o elemento mais abundante do universo.',
  'As baratas podem sobreviver várias semanas sem cabeça, pois respiram por pequenos orifícios no corpo.',
  'O gelo boia porque é menos denso que a água líquida.',
  'O peixe-palhaço nasce macho e pode se tornar fêmea para dominar a colônia.',
  'A audição dos morcegos usa ecolocalização: emitem sons de alta frequência e leem o eco.',
  'As sequoias gigantes podem viver mais de 3.000 anos.',
  'O oxigênio que você respira hoje pode ter vindo de uma planta que existiu há milhões de anos.',
  'A velocidade máxima de um falcão-peregrino em mergulho ultrapassa 300 km/h — o animal mais rápido do mundo.',
  'Os cristais de gelo têm sempre simetria hexagonal.',
  'O estômago humano produz ácido forte o bastante para dissolver metais, mas é protegido por um revestimento de muco.',
  'As estrelas-do-mar podem regenerar um braço perdido.',
  'O universo tem cerca de 13,8 bilhões de anos.',
  'A cada dia, a Terra é atingida por cerca de 100 toneladas de micrometeoritos.',
  'Os cães têm uma área no cérebro dedicada a interpretar o cheiro humano.',
  'A água ferve a 100 °C ao nível do mar, mas a temperatura cai em altitudes maiores.',
  'Os vulcões podem liberar cinzas que bloqueiam a luz do Sol e resfriam o planeta temporariamente.',
  'Uma baleia-jubarte pode cantar por horas e seu canto é ouvido a quilômetros de distância.',
  'Os olhos humanos enxergam apenas uma fração minúscula do espectro eletromagnético.',
  'A pele humana perde cerca de 30.000 a 40.000 células por minuto.',
  'Os gatos têm 32 músculos em cada orelha.',
  'A atmosfera terrestre se estende por centenas de quilômetros e se funde gradualmente com o espaço.',
  'Os crocodilos podem ficar longos períodos sem comer e têm um dos sistemas imunológicos mais potentes.',
  'A fotossíntese converte luz solar, água e CO₂ em glicose e oxigênio.',
  'A Terra é o único planeta conhecido com vida.',
  'O chumbo é um metal tão denso que uma bala dele afunda em mercúrio.',
  'As células do sangue vermelho vivem cerca de 120 dias.',
  'A pressão no fundo do oceano, na Fossa das Marianas, é mais de mil vezes a da superfície.',
  'O coração de um beija-flor bate mais de 1.000 vezes por minuto.',
  'A nebulosa de Orion é um berçário de estrelas, a cerca de 1.300 anos-luz da Terra.',
  'As cebolas fazem você chorar por liberarem gás que reage com a umidade dos olhos formando ácido sulfúrico diluído.',
  'O gorila compartilha cerca de 98% do DNA com o ser humano.',
  'Uma guepardo pode acelerar de 0 a 100 km/h em cerca de 3 segundos.',
  'A água que você bebe já passou por oceanos, nuvens, rios e organismos ao longo de bilhões de anos.',
  'Os dinossauros terópodes deram origem às aves modernas.',
  'O mercúrio é o único metal líquido em temperatura ambiente.',
  'A saliva humana contém enzimas que começam a digerir o amido ainda na boca.',
  'As zebras têm listras únicas, como impressões digitais humanas.',
  'O carbono é o elemento central da vida: todos os seres vivos são baseados nele.',
  'As formigas não têm pulmões; respiram por pequenos tubos no corpo.',
  'O telescópio espacial James Webb observa a luz do universo primitivo, há mais de 13 bilhões de anos.',
  'Os polos magnéticos da Terra já se inverteram dezenas de vezes ao longo da história.',
  'A lontra-marinha segura pedras na barriga para abrir conchas e segura as patas dos filhotes para não se perderem.',
  'As bactérias no seu intestino pesam, juntas, cerca de 1,5 kg.',
  'O relâmpago é descarga elétrica; ele aquece o ar tão rápido que cria uma onda de choque — o trovão.',
  'Uma tonelada de rochas pode conter mais ouro em concentrações minúsculas que valem a pena extrair.',
  'O Sol representa 99,86% de toda a massa do sistema solar.',
  'As tartarugas marinhas retornam à praia onde nasceram para desovar.',
  'O odor corporal humano é influenciado pela genética e pela dieta.',
  'A cada segundo, milhares de estrelas nascem no universo.',
  'Os hipopótamos produzem um "suor" vermelho que funciona como protetor solar e antibiótico.',
  'A Lua é o quinto maior satélite do sistema solar.',
  'As células vegetais têm paredes de celulose, que os animais não conseguem digerir.',
  'O cérebro humano armazena o equivalente a cerca de 2,5 petabytes de informação.',
  'Uma abelha rainha pode viver vários anos, enquanto as operárias vivem semanas.',
  'A velocidade da luz é uma constante universal; nada pode superá-la.',
  'Os rinocerontes têm pele espessa, mas muito sensível — camadas podem ser atravessadas por picadas de insetos.',
  'A cada respiração, você inspira bilhões de átomos que já fizeram parte de outros seres vivos.',
  'As geleiras armazenam cerca de 69% da água doce do planeta.',
  'O coração de uma baleia-azul pode pesar até 900 kg.',
  'Os fungos são mais próximos geneticamente dos animais do que das plantas.',
  'Uma molécula de água é um dipolo: é por isso que a água dissolve tantas substâncias.',
  'O planeta Vênus gira ao contrário da maioria dos planetas.',
  'As araras-azuis formam pares que permanecem juntos a vida toda.',
  'O ouvido humano é sensível o bastante para perceber a vibração de um átomo.',
  'A energia das ondas, marés e vento vem, em última instância, do Sol.',
  'Os morcegos são os únicos mamíferos capazes de voo verdadeiro.',
  'Uma célula da medula óssea pode produzir milhões de glóbulos vermelhos por dia.',
  'O oceano absorve cerca de 30% do CO₂ emitido pela humanidade.',
  'As estrelas mais massivas vivem apenas alguns milhões de anos; as menores, trilhões.',
  'O camelo armazena gordura nas corcovas, que pode ser convertida em energia e água.',
  'O DNA foi descoberto em 1869, mas sua estrutura em dupla hélice só foi revelada em 1953.',
  'As abelhas comunicam a localização de flores por meio de uma "dança" especial.',
  'Um raio tem energia suficiente para abastecer uma casa por dias.',
  'A pele é o maior órgão do corpo humano.',
  'Os pólipos de coral formam recifes que abrigam cerca de 25% de toda a vida marinha.',
  'O ser humano compartilha cerca de 60% do DNA com bananas.',
  'A distância entre a Terra e a Lua é de cerca de 384.000 km.',
  'As formigas usam feromônios para marcar trilhas e avisar sobre perigo.',
  'A cada ano, o oceano absorve calor suficiente para aquecer bilhões de casas.',
  'O chumbo foi usado em encanamentos romanos, e a palavra "plumbing" vem de "plumbum".',
  'As borboletas-monarca migram até 4.000 km entre o Canadá e o México.',
  'O nitrogênio representa cerca de 78% da atmosfera da Terra.',
  'Os pulmões têm cerca de 480 milhões de alvéolos, que aumentam muito a superfície de troca de oxigênio.',
  'A teoria do Big Bang foi proposta com base na expansão observada das galáxias.',
  'Uma baleia-jubarte pesa tanto que seu filhote bebe até 400 litros de leite por dia.',
  'A Terra tem uma magnetosfera que desvia partículas solares e protege a vida.',
  'Os crocodilos podem ficar submersos por horas graças a um diafragma especial.',
  'O açúcar comum (sacarose) é uma molécula composta por glicose e frutose.',
  'As árvores comunicam-se por redes subterrâneas de fungos chamadas "wood wide web".',
  'O olho humano tem cerca de 120 milhões de bastonetes (para ver no escuro).',
  'Um furacão libera energia equivalente a dezenas de milhares de bombas nucleares.',
  'As células do sangue são fabricadas principalmente na medula óssea.',
  'O átomo é quase todo espaço vazio: se o núcleo fosse do tamanho de uma bola de futebol, o elétron estaria a quilômetros de distância.',
  'As aves migratórias navegam pelo campo magnético da Terra.',
  'O gelo derretido dos polos pode elevar o nível do mar e inundar cidades costeiras.',
  'Os tubarões têm um sexto sentido: detectam campos elétricos com eletrorreceptores no focinho.',
  'A cada ano, os vulcões emitem toneladas de dióxido de enxofre na atmosfera.',
  'O ser humano adulto tem cerca de 5 litros de sangue.',
  'As plantas também respiram — durante a noite, usam oxigênio para quebrar a glicose.',
  'A velocidade do som no vácuo é zero: o som precisa de um meio material.',
  'Os cangurus são os únicos grandes mamíferos que se deslocam saltando.',
  'O telescópio Hubble já observou galáxias a mais de 13 bilhões de anos-luz.',
  'As medusas existem há mais de 500 milhões de anos.',
  'Uma célula humana tem cerca de 20.000 genes, um número parecido com o de um verme.',
  'O mercúrio é usado em termômetros por sua expansão uniforme com o calor.',
  'Os cientistas estimam que existam milhões de espécies ainda não descobertas.',
  'O coração começa a bater cerca de 3 semanas após a concepção.',
  'As rochas sedimentares registram a história da vida em fósseis.',
  'O som de um trovão viaja mais devagar que a luz do relâmpago: por isso vemos antes de ouvir.',
  'Uma única abelha produz apenas cerca de 1/12 de colher de chá de mel na vida.',
  'O planeta Júpiter tem uma tempestade (a Grande Mancha Vermelha) maior que a Terra.',
  'As células de gordura podem expandir até 1.000 vezes o tamanho original.',
  'A cada segundo, o Sol funde cerca de 600 milhões de toneladas de hidrogênio em hélio.',
  'Os gatos enxergam bem no escuro graças a uma camada refletora atrás da retina.',
  'A água do mar contém quase todos os elementos da tabela periódica em traços.',
  'As estrelas nascem em nuvens de gás e poeira chamadas nebulosas.',
  'O ser humano médio pisca cerca de 15 a 20 vezes por minuto.',
  'Os fungos decompõem matéria orgânica, reciclando nutrientes essenciais aos ecossistemas.',
  'A cada respiração você troca cerca de 10.000 litros de ar por dia.',
  'As águas-vivas bioluminescentes brilham graças a proteínas que emitem luz.',
  'O cérebro de um elefante é o maior de todos os animais terrestres.',
  'A pressão arterial é medida em milímetros de mercúrio por convenção histórica.',
  'Os ursos-negros podem correr até 50 km/h, mais rápido que um humano.',
  'A galáxia Via Láctea tem cerca de 100 a 400 bilhões de estrelas.',
  'As plantas carnívoras evoluíram para obter nitrogênio em solos pobres.',
  'O osso mais longo do corpo humano é o fêmur; o menor, o estribo, no ouvido.',
  'As aranhas têm cerca de 600 a 1.000 espécies venenosas, mas poucas são perigosas ao homem.',
  'A cada ano, a distância entre a América do Sul e a África cresce alguns centímetros.',
  'O oxigênio da atmosfera veio principalmente da fotossíntese de cianobactérias.',
  'As baleias já foram animais terrestres com quatro patas.',
  'O efeito estufa é essencial para a vida: sem ele, a Terra seria um bloco de gelo.',
  'Os sapos têm pele permeável e bebem água por ela.',
  'Uma célula humana pode conter até 2 metros de DNA enrolado.',
  'A luz de uma estrela distante pode ter viajado por bilhões de anos até chegar aos nossos olhos.',
  'O chá, o café e o chocolate contêm cafeína, um estimulante que bloqueia receptores de sono no cérebro.',
  'As câmeras de segurança e a internet viajam por fibras ópticas usando luz.',
  'A cada dia, você perde cerca de um milhão de células da pele.',
  'Os pinguins podem mergulhar a mais de 500 metros de profundidade.'
];

// ─── LÓGICA DE SELEÇÃO DIÁRIA ────────────────────────────────────────────────
export function getCuriosityOfDay() {
  const i = dayIndex() % SCIENCE_CURIOSITIES.length;
  return SCIENCE_CURIOSITIES[i];
}

function normalizeStr(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Monta o pool de candidatos = lista curada + táxons do banco local (da árvore).
function buildPool(getLocalPool) {
  const map = new Map();
  for (const sp of SPECIES_OF_DAY) {
    const key = normalizeStr(sp.name);
    if (!map.has(key)) {
      map.set(key, {
        name: sp.name,
        wikiTitle: sp.wikiTitle || sp.name,
        lineage: sp.lineage || [],
        distribution: sp.distribution || '',
        source: 'curada'
      });
    }
  }
  if (typeof getLocalPool === 'function') {
    let local;
    try { local = getLocalPool(); } catch (e) { local = []; }
    if (Array.isArray(local)) {
      for (const t of local) {
        if (!t || !t.name) continue;
        const key = normalizeStr(t.name);
        if (!key) continue;
        if (map.has(key)) continue;
        map.set(key, {
          name: t.name,
          wikiTitle: t.name,
          lineage: Array.isArray(t.lineage) ? t.lineage : [t.name],
          distribution: '',
          source: 'local'
        });
      }
    }
  }
  return [...map.values()];
}

// Encontra o próximo candidato válido: com imagem, descrição e linhagem.
async function pickValid(getLocalPool, avoidName) {
  const pool = buildPool(getLocalPool);
  if (pool.length === 0) return null;
  const avoid = avoidName ? normalizeStr(avoidName) : null;
  const MAX_TRIES = Math.min(40, pool.length);
  let idx = dayIndex() % pool.length;
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const cand = pool[idx];
    idx = (idx + 1) % pool.length;
    if (avoid && normalizeStr(cand.name) === avoid) continue;
    const data = await fetchWikiSummary(cand.wikiTitle || cand.name);
    if (data && data.extract && data.extract.trim()) {
      const img = data?.thumbnail?.source || data?.originalimage?.source || '';
      if (img && cand.lineage && cand.lineage.length > 0) {
        return { sp: cand, data };
      }
    }
  }
  // Fallback: aceita o primeiro com descrição, mesmo sem imagem
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const cand = pool[idx];
    idx = (idx + 1) % pool.length;
    if (avoid && normalizeStr(cand.name) === avoid) continue;
    const data = await fetchWikiSummary(cand.wikiTitle || cand.name);
    if (data && data.extract && data.extract.trim()) {
      return { sp: cand, data };
    }
  }
  return null;
}

// ─── UI DO MODAL ─────────────────────────────────────────────────────────────
export async function initDailyModule({ onExplore, getLocalPool }) {
  const modal = document.getElementById('daily-modal');
  const openBtn = document.getElementById('btn-daily');
  const closeBtn = document.getElementById('close-daily');
  const nextBtn = document.getElementById('daily-next-btn');
  const speciesName = document.getElementById('daily-species-name');
  const speciesImg = document.getElementById('daily-species-img');
  const speciesDesc = document.getElementById('daily-species-desc');
  const speciesLineage = document.getElementById('daily-species-lineage');
  const speciesDist = document.getElementById('daily-species-dist');
  const speciesSource = document.getElementById('daily-species-source');
  const curiosityText = document.getElementById('daily-curiosity-text');
  const exploreBtn = document.getElementById('daily-explore-btn');

  if (!modal || !openBtn) return;

  let currentSpecies = null;
  let loading = false;

  openBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    loadDaily();
  });

  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (loading) return;
    loadDaily(true);
  });

  async function loadDaily(forceSwap = false) {
    if (loading) return;
    loading = true;
    if (nextBtn) nextBtn.disabled = true;

    if (speciesName) speciesName.textContent = '…';
    if (speciesImg) {
      speciesImg.innerHTML = '<div style="width:100%;height:200px;display:flex;align-items:center;justify-content:center;background:#0d1526;border-radius:10px;color:#94a3b8;">⏳ Procurando espécie com informação completa…</div>';
    }
    if (speciesDesc) speciesDesc.textContent = 'Buscando espécie com descrição, imagem e linhagem…';
    if (speciesLineage) speciesLineage.textContent = '…';
    if (speciesDist) speciesDist.textContent = '…';
    if (speciesSource) speciesSource.textContent = '';
    if (curiosityText) curiosityText.textContent = getCuriosityOfDay();

    const avoidName = (forceSwap && currentSpecies) ? currentSpecies.name : '';
    const pick = await pickValid(getLocalPool, avoidName);
    loading = false;
    if (nextBtn) nextBtn.disabled = false;

    if (!pick) {
      if (speciesName) speciesName.textContent = 'Nenhuma espécie disponível no momento.';
      if (speciesImg) speciesImg.innerHTML = '<div style="width:100%;height:200px;display:flex;align-items:center;justify-content:center;background:#0d1526;border-radius:10px;color:#94a3b8;">😕</div>';
      if (speciesDesc) speciesDesc.textContent = 'Não foi possível encontrar um táxon com imagem, descrição e linhagem. Tente novamente mais tarde.';
      return;
    }

    const sp = pick.sp;
    const data = pick.data;
    currentSpecies = sp;

    if (speciesName) speciesName.textContent = sp.name;
    if (speciesLineage) {
      speciesLineage.innerHTML = sp.lineage.map((l, i) => {
        const arrow = i > 0 ? '<span style="color:#2ecc71;margin:0 6px;">→</span>' : '';
        return `${arrow}<span style="color:#e2e8f0;">${escHtml(l)}</span>`;
      }).join('');
    }
    if (speciesDist) speciesDist.textContent = sp.distribution || 'Distribuição não informada.';
    if (speciesSource) {
      speciesSource.textContent = sp.source === 'curada'
        ? '📚 Espécie selecionada do catálogo de destaques'
        : '🗂️ Táxon do banco de dados local';
    }

    if (exploreBtn) {
      exploreBtn.onclick = () => {
        modal.classList.add('hidden');
        if (typeof onExplore === 'function') onExplore(sp);
      };
    }

    const img = data?.thumbnail?.source || data?.originalimage?.source || '';
    if (speciesImg) {
      if (img) {
        speciesImg.innerHTML = `<img src="${escAttrUrl(img)}" alt="${escHtml(sp.name)}" style="width:100%;height:200px;object-fit:cover;border-radius:10px;" loading="lazy" onerror="this.style.display='none'"/>`;
      } else {
        speciesImg.innerHTML = '<div style="width:100%;height:200px;display:flex;align-items:center;justify-content:center;background:#0d1526;border-radius:10px;color:#94a3b8;">🖼️ Sem imagem disponível</div>';
      }
    }
    if (speciesDesc) {
      speciesDesc.textContent = (data && data.extract) ? data.extract : 'Descrição científica não encontrada.';
    }
  }

  // Pré-carrega ao abrir o site
  loadDaily();
}

async function fetchWikiSummary(title) {
  try {
    const res = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// ─── PEQUENOS HELPERS DE SANITIZAÇÃO ─────────────────────────────────────────
function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function escAttrUrl(value) {
  const v = String(value ?? '');
  if (/^(https?:|\/\/)/i.test(v)) return escHtml(v);
  return '';
}
