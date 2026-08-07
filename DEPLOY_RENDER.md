# Deploy no Render (gratuito)

Este projeto usa **PostgreSQL** em produção (dados permanentes) e **SQLite** em desenvolvimento.

## Pré-requisitos

- Conta no [Render](https://render.com) (plano Free)
- Conta no [Neon](https://neon.tech) ou [Supabase](https://supabase.com) para o banco PostgreSQL gratuito
- Repositório no GitHub com este código

---

## 1. Criar o banco PostgreSQL gratuito

**Neon (mais simples):**
1. Crie um projeto em neon.tech (Free tier)
2. Copie a **connection string**:
   ```
   postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
3. Guarde para o passo 3.

> A connection string do Neon já vem como `postgresql://...`. O código espera
> `postgresql+asyncpg://...` — o Render v3 usa `postgresql://` (asyncpg entende).
> Se preferir, troque o prefixo para `postgresql+asyncpg://`.

---

## 2. Subir o código

```bash
git init
git add .
git commit -m "deploy"
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

> O `Dockerfile` e `render.yaml` já estão prontos — o Render os detecta sozinho.

---

## 3. Criar o serviço no Render

**Opção A — Dashboard (mais fácil):**
1. Clique **"New" → "Web Service"**
2. Conecte o repositório GitHub
3. O Render detecta o `Dockerfile` automaticamente (runtime: Docker)
4. Em **Environment**, adicione:
   - `DATABASE_URL` → a connection string do Neon
   - `JWT_SECRET` → uma senha longa aleatória (ex.: gerada por `openssl rand -hex 32`)
   - `PUBLIC_URL` → `https://SEU_APP.onrender.com`
   - `PRODUCTION` → `true`
5. **Instance Type**: Free
6. Clique **Create Web Service** e aguarde o build

**Opção B — Blueprint (render.yaml):**
1. Clique **"New" → "Blueprint"**
2. Conecte o repositório — o Render lê o `render.yaml` e cria o serviço
3. Preencha as env vars que ele pedir (DATABASE_URL, PUBLIC_URL)
4. JWT_SECRET é gerado automaticamente

---

## 4. Acessar

- App: `https://SEU_APP.onrender.com`
- Healthcheck: `https://SEU_APP.onrender.com/api/health` → `{"status":"ok"}`

---

## Variáveis de ambiente (resumo)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | `postgresql+asyncpg://...` (Neon/Supabase) |
| `JWT_SECRET` | Sim | Segredo do token (Render gera no Blueprint) |
| `PUBLIC_URL` | Sim | URL pública do app (define RP_ID/CORS/WebAuthn) |
| `PRODUCTION` | Sim | `true` desliga o comando dev `/level-dev` |
| `RP_ID` | Opcional | Domínio WebAuthn (derivado de PUBLIC_URL se vazio) |
| `FRONTEND_DIST` | Opcional | Caminho do frontend compilado (padrão já correto) |

---

## Desenvolvimento local

```bash
# Backend (SQLite local, automático sem DATABASE_URL)
cd backend
venv\Scripts\python -m uvicorn app.main:app --port 8000

# Frontend
cd frontend
npm run dev
```

---

## Migrar dados do SQLite para o PostgreSQL

Se tinha contas/progresso no SQLite local e quer migrar:
1. Rode o app no Postgres uma vez (cria as tabelas)
2. Insira os registros manualmente (senha bcrypt já é portável) ou descarte e recomece
3. Para o projeto novo, simplesmente **crie uma conta nova** no site publicado
