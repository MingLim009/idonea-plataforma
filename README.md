# Idônea — Fase 1 (Asana + horas)

Entrega alinhada ao combinado no Workana com o Marcelo:

1. **Agora (15–20 dias):** plataforma no estilo **Asana** + **timer de horas nativo** + importação funcional **Asana + Clockify**, hospedada na **VPS** (Hostinger KVM 2).
2. **Depois (+20 dias):** projeto **separado** no estilo **Pipedrive** (CRM).

> O CRM já existe neste código como módulo antecipado; o contrato pediu dois projetos separados — a Fase 2 pode extrair/refinar o CRM.

## Demo rápida (local)

```bash
npm install
npm run dev
```

http://localhost:5173 — senha `demo123`  
`carolina@idonea.com` · `marcelo@idonea.com` · `ana@idonea.com`

## Deploy na VPS (Hostinger KVM 2)

```bash
# no servidor
git clone <seu-repo> idonea && cd idonea
export SESSION_SECRET="$(openssl rand -hex 32)"
docker compose up -d --build
```

App em `http://SEU_IP:4000`  
Dados e anexos ficam no volume Docker `idonea_data` (não somem no restart).

## Módulos Fase 1 (foco)

- Projetos, Kanban, tarefas, subtarefas, anexos, comentários, menções, avisos
- Horas: timer nativo, lançamento manual, relatório
- Importação Asana + Clockify (API + exemplo)
- Comandos / API GPT: `POST /api/gpt` com header `X-Api-Key`

## O que ainda falta para fechar o contrato

| Item | Status |
|------|--------|
| App Asana + horas funcionando | Pronto (demo) |
| Import Asana/Clockify | Pronto (limites de API; reforçar se cliente tiver muito histórico) |
| GitHub | Precisa login `gh auth login` nesta máquina |
| VPS Hostinger KVM 2 | Docker pronto — falta servidor + domínio do cliente |
| Postgres/Supabase self-hosted | Combinado na proposta — próximo passo na VPS |
| Projeto CRM separado (Fase 2) | Depois da VPS Fase 1 |
