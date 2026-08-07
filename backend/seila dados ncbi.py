import sys
import zipfile
import urllib.request
from pathlib import Path
import duckdb

BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
FRONTEND_JSON = BASE_DIR.parent / "frontend" / "public" / "tree_data.json"
DB_FILE = BASE_DIR / "tree_of_life.duckdb"

DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
ZIP_PATH = DOWNLOADS_DIR / "col_data.zip"

COL_ZIP_URL = "https://download.catalogueoflife.org/col/backbone/latest.zip"

print("🚀 INICIANDO PROCESSO 100% AUTOMÁTICO DE TAXONOMIA")

# Procura se já existe algum arquivo Taxon.tsv descompactado
taxon_files = list(DOWNLOADS_DIR.glob("**/*Taxon.tsv"))

if not taxon_files:
    print(f"📥 Baixando a base oficial do Catalogue of Life diretamente do servidor...")
    urllib.request.urlretrieve(COL_ZIP_URL, ZIP_PATH)
    print("✅ Download concluído!")

    print("📦 Extraindo os arquivos necessários...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        for file in zip_ref.namelist():
            if file.endswith("Taxon.tsv") or file == "Taxon.tsv":
                zip_ref.extract(file, DOWNLOADS_DIR)
                print(f"-> Extraído: {file}")
                
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
        
    taxon_files = list(DOWNLOADS_DIR.glob("**/*Taxon.tsv"))

taxon_file = taxon_files[0]
print(f"⚡ Processando e indexando com DuckDB ({taxon_file.name})...")

con = duckdb.connect(str(DB_FILE))

# Mapeia usando as colunas reais da tabela (canonicalName / scientificName)
con.execute(f"""
    CREATE OR REPLACE TABLE taxons AS 
    SELECT 
        taxonID AS id,
        COALESCE(canonicalName, scientificName) AS scientific_name,
        scientificName AS common_name,
        taxonRank AS rank,
        parentNameUsageID AS parent_id,
        'CatalogueOfLife' AS source
    FROM read_csv_auto('{taxon_file.as_posix()}', delim='\t', header=True, ignore_errors=True);
""")

# Exporta para o arquivo JSON do seu Front-end
FRONTEND_JSON.parent.mkdir(parents=True, exist_ok=True)
print(f"📄 Exportando árvore de vida para JSON em: {FRONTEND_JSON.resolve()}")

con.execute(f"""
    COPY (
        SELECT id, scientific_name, common_name, rank, parent_id 
        FROM taxons 
        LIMIT 100000
    ) TO '{FRONTEND_JSON.as_posix()}' (FORMAT JSON);
""")

total = con.execute("SELECT COUNT(*) FROM taxons").fetchone()[0]
print(f"\n🎉 SUCESSO TOTAL!")
print(f"📊 {total:,} táxons carregados e salvos em {FRONTEND_JSON.name}!")

con.close()