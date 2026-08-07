
CREATE TABLE col_taxa AS 
SELECT * FROM read_csv_auto('Taxon.tsv', delim='\t', header=true);

COPY (
    SELECT 
        taxonID AS id,
        parentNameUsageID AS parent_id,
        scientificName AS name,
        taxonRank AS rank
    FROM col_taxa
    WHERE taxonomicStatus = 'accepted'
      AND taxonRank IN ('kingdom', 'phylum', 'class', 'order', 'family')
) TO 'public/tree_data.json' (FORMAT JSON);