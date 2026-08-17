const fs = require('fs');
const readline = require('readline');

async function processTSV() {
  console.log('🔄 Lendo o arquivo Taxon.tsv... Isso pode levar alguns segundos.');
  
  const fileStream = fs.createReadStream('Taxon.tsv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let headers = [];
  const nodesMap = new Map();
  let lineCount = 0;

  for await (const line of rl) {
    if (lineCount === 0) {
      headers = line.split('\t');
      lineCount++;
      continue;
    }

    const cols = line.split('\t');
    const item = {};
    headers.forEach((h, i) => {
      item[h] = cols[i] ?? '';
    });

    if (!item.taxonID) continue;
    
    // Ignora sinônimos
    if (item.acceptedNameUsageID && item.acceptedNameUsageID.trim() !== '') {
      continue;
    }

    const id = item.taxonID.trim();
    const parentId = item.parentNameUsageID ? item.parentNameUsageID.trim() : null;
    const name = item.scientificName || item.canonicalName || 'Sem nome';
    const rank = item.taxonRank || 'unknown';

    nodesMap.set(id, {
      id,
      parent_id: parentId,
      name,
      rank,
      children: []
    });

    lineCount++;
    if (lineCount % 100000 === 0) {
      console.log(`Processadas ${lineCount.toLocaleString()} linhas...`);
    }
  }

  console.log(`Total de nós válidos mapeados: ${nodesMap.size.toLocaleString()}`);
  console.log('🔗 Organizando a hierarquia da árvore...');

  const potentialRoots = [];

  nodesMap.forEach((node) => {
    if (!node.parent_id || !nodesMap.has(node.parent_id)) {
      potentialRoots.push(node);
    } else {
      const parentNode = nodesMap.get(node.parent_id);
      if (parentNode) {
        parentNode.children.push(node);
      }
    }
  });

  let rootData;
  const foundBiota = potentialRoots.find(n => n.name === 'Biota' || n.name === 'Life' || n.name === 'Root');

  if (foundBiota) {
    rootData = foundBiota;
  } else {
    rootData = {
      id: 'global-root',
      name: 'Biota (Vida)',
      rank: 'life',
      children: potentialRoots
    };
  }

  console.log('💾 Salvando o arquivo public/tree_data.json...');
  fs.writeFileSync('public/tree_data.json', JSON.stringify(rootData, null, 2));
  console.log('✅ Pronto! O arquivo JSON otimizado foi gerado com sucesso na pasta public.');
}

processTSV();