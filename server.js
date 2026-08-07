const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();

// Libera o CORS explicitamente para evitar bloqueios do navegador
app.use(cors({
  origin: '*', // Permite qualquer origem local se conectar durante o desenvolvimento
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Conecta ou cria o arquivo "taxons.db" na raiz do servidor
const db = new sqlite3.Database('./taxons.db', (err) => {
  if (err) console.error('Erro ao abrir o banco de dados:', err.message);
  else console.log('📦 Conectado ao arquivo SQLite: taxons.db');
});

// Cria a tabela de curadoria se ela não existir
db.run(`CREATE TABLE IF NOT EXISTS curation_queue (
  id TEXT PRIMARY KEY,
  name TEXT,
  rank TEXT,
  parent_id TEXT,
  reason TEXT
)`);

// 1. Rota para listar todos os itens do .db
app.get('/api/curation', (req, res) => {
  db.all(`SELECT * FROM curation_queue`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 2. Rota para salvar um táxon inválido no .db
app.post('/api/curation', (req, res) => {
  const { id, name, rank, parent_id, reason } = req.body;
  const query = `INSERT OR REPLACE INTO curation_queue (id, name, rank, parent_id, reason) VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [id, name, rank, parent_id, reason], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id });
  });
});

// 3. Rota para remover um táxon do .db (quando recuperado)
app.delete('/api/curation/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM curation_queue WHERE id = ?`, id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deletedID: id });
  });
});

app.listen(3000, () => {
  console.log('🚀 Servidor rodando na porta 3000 (Salvando em taxons.db)');
});