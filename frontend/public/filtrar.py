import csv
import sys

maxInt = sys.maxsize
while True:
    try:
        csv.field_size_limit(maxInt)
        break
    except OverflowError:
        maxInt = int(maxInt / 10)

input_file = 'Taxon.tsv'
output_file = 'Taxon_mini2.tsv'

print('⏳ Lendo o arquivo inteiro e pegando a espinha dorsal de TODOS os reinos...')

# Mantemos apenas os grandes grupos estruturais (sem espécies/gêneros/famílias em excesso).
# Isso garante que animais, fungos, plantas e bactérias caibam juntos em um arquivo leve.
allowed_ranks = {'kingdom', 'phylum', 'class', 'order'}
count = 0

with open(input_file, mode='r', encoding='utf-8', errors='ignore') as infile, \
     open(output_file, mode='w', encoding='utf-8', newline='') as outfile:
    
    reader = csv.reader(infile, delimiter='\t')
    writer = csv.writer(outfile, delimiter='\t')
    
    header = next(reader)
    writer.writerow(header)
    
    idx_status = header.index('taxonomicStatus') if 'taxonomicStatus' in header else -1
    idx_rank = header.index('taxonRank') if 'taxonRank' in header else -1
    
    for row in reader:
        if not row: continue
        
        status = row[idx_status] if idx_status != -1 and len(row) > idx_status else 'accepted'
        rank = row[idx_rank] if idx_rank != -1 and len(row) > idx_rank else ''
        
        # Pega todos os reinos aceitos dentro dos grandes ranks estruturais
        if status == 'accepted' and rank.lower() in allowed_ranks:
            writer.writerow(row)
            count += 1

print(f'✅ Sucesso! Arquivo gerado com {count} registros cobrindo todos os reinos em: {output_file}')