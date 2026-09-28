# Idônea — plataforma de projetos, horas e vendas

Produto em português (PT-BR) no estilo Asana + horas nativas + importação Asana/Clockify, com módulo de vendas incluso.

## Contas de demonstração

| E-mail | Senha | Papel |
|--------|-------|-------|
| `carolina@idonea.com` | `demo123` | Administração |
| `marcelo@idonea.com` | `demo123` | Administração |
| `ana@idonea.com` | `demo123` | Equipe |

Também é possível **criar conta** pela tela de cadastro (e-mail + senha).

## Rodar local

```bash
npm install
npm run dev
```

Abre em http://localhost:5173 (API em http://localhost:4000).

## O que está pronto

- Autenticação e-mail/senha (entrar + criar conta)
- Projetos, Kanban (arrastar tarefas), lista, histórico
- Tarefas: prioridade, prazo, responsável, subtarefas, anexos, comentários, timer
- Horas: timer, lançamento manual, relatório
- Importação Asana (token) e Clockify (API key) com paginação completa + exemplos
- Comandos em texto + API GPT (`POST /api/gpt`, header `X-Api-Key`)
- Vendas (funil, negócios, contatos, empresas, atividades)
- Equipe (convidar pessoas — admin)
- Deploy Docker/VPS com volume persistente
- Demo em Vercel: https://idonea-plataforma.vercel.app  
  (aviso: no Vercel o SQLite fica em `/tmp` e pode resetar; use VPS para produção)

## Deploy na VPS (Hostinger / Docker)

```bash
git clone https://github.com/MingLim009/idonea-plataforma.git idonea
cd idonea
cp .env.example .env
# edite SESSION_SECRET com: openssl rand -hex 32
docker compose up -d --build
```

- App: `http://SEU_IP:4000`
- Saúde: `http://SEU_IP:4000/api/health`
- Dados em volume Docker `idonea_data` (não somem no restart)
- Proxy HTTP (domínio apontando para a VPS):

```bash
docker compose --profile proxy up -d --build
```

Backup:

```bash
chmod +x scripts/backup.sh
./scripts/backup.sh
```

## Variáveis de ambiente

Veja `.env.example`.

| Variável | Uso |
|----------|-----|
| `SESSION_SECRET` | Obrigatório em produção (assinatura dos tokens) |
| `OPENAI_API_KEY` | Opcional — respostas GPT nos Comandos |
| `DATA_DIR` / `UPLOAD_DIR` | Paths de SQLite e anexos (Docker: `/data`) |

## API GPT

1. Em **Equipe** / configuração, use a chave demo ou defina a do sistema  
2. `POST /api/gpt` com header `X-Api-Key: <chave>` e corpo JSON `{ "text": "Criar tarefa Revisar proposta no projeto Site institucional" }`

## O que ainda depende do cliente (não dá para fechar sozinho)

1. Acesso à **VPS Hostinger** + DNS do domínio  
2. Tokens reais **Asana/Clockify** do Marcelo para validar o histórico dele  
3. Decisão se o **CRM** fica neste app ou vira o projeto Fase 2 separado (contrato)

## Stack

React + Vite · Express · SQLite · Docker
