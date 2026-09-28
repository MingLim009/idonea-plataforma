import { createContext, useContext, useEffect, useMemo } from "react";

const strings = {
    "app.loading": "Abrindo a Idônea…",
    "nav.inicio": "Início",
    "nav.projeto": "Projetos",
    "nav.tempo": "Horas",
    "nav.crm": "Vendas",
    "nav.importar": "Importar",
    "nav.ia": "Comandos",
    "nav.equipe": "Equipe",
    "nav.aria": "Navegação principal",
    "nav.open": "Abrir menu",
    "nav.close": "Fechar menu",
    "brand.tagline": "Projetos, horas e vendas",
    "brand.home": "Ir para o início",
    "search.placeholder": "Buscar tarefas, projetos…",
    "search.aria": "Buscar",
    "notes.label": "Avisos",
    "notes.markRead": "Marcar como lidos",
    "notes.empty": "Nenhum aviso por agora.",
    "user.admin": "Administração",
    "user.member": "Equipe",
    "user.logout": "Sair",
    "timer.label": "Timer",
    "timer.stop": "Parar e salvar",
    "login.title": "Entrar",
    "login.signupTitle": "Criar conta",
    "login.lead": "Tudo que você precisa para gerenciar projetos, horas e vendas em uma única plataforma.",
    "login.name": "Nome",
    "login.email": "E-mail",
    "login.password": "Senha",
    "login.emailPh": "Digite seu e-mail",
    "login.passwordPh": "Digite sua senha",
    "login.submit": "Entrar",
    "login.create": "Criar conta",
    "login.hint": "Demonstração · senha demo123",
    "login.haveAccount": "Já tenho conta",
    "login.createAccount": "Criar uma conta",
    "login.hero.kicker": "Gestão de projetos · BR",
    "login.hero.title": "Software para gestão de projetos e vendas",
    "login.hero.body": "Tarefas, Kanban, horas e CRM conectados — simples para a equipe, poderoso para a gestão.",
    "login.hero.p1": "Quadros Kanban e tarefas com responsáveis",
    "login.hero.p2": "Apontamento de horas nativo",
    "login.hero.p3": "Funil de vendas e comandos por texto",
    "dash.loading": "Carregando o painel…",
    "dash.title": "Início",
    "dash.lead": "Simples para a equipe, poderoso para a gestão — o que pede atenção hoje.",
    "dash.overdue": "Atrasadas",
    "dash.hoursWeek": "Horas na semana",
    "dash.openDeals": "Negócios abertos",
    "dash.projects": "Projetos",
    "dash.myTasks": "Minhas tarefas",
    "dash.noTasks": "Nada atribuído a você agora.",
    "dash.openCount": "{n} abertas",
    "dash.overdueCount": " · {n} atrasadas",
    "dash.risk": "Risco de atraso",
    "dash.noRisk": "Nenhuma tarefa em risco.",
    "dash.high": "Alto",
    "dash.medium": "Médio",
    "dash.activity": "Atividade",
    "dash.noActivity": "Sem atividade recente.",
    "common.loading": "Carregando…",
    "common.add": "Adicionar",
    "common.close": "Fechar",
    "common.save": "Salvar",
    "common.delete": "Excluir",
    "common.project": "Projeto",
    "common.priority": "Prioridade",
    "common.assignee": "Responsável",
    "common.status": "Situação",
    "common.due": "Prazo",
    "common.description": "Descrição",
    "common.name": "Nome",
    "common.open": "Abertas",
    "common.done": "Concluídas",
    "priority.baixa": "Baixa",
    "priority.media": "Média",
    "priority.alta": "Alta",
    "priority.urgente": "Urgente",
    "projects.title": "Projetos",
    "projects.board": "Quadro",
    "projects.list": "Lista",
    "projects.history": "Histórico",
    "projects.new": "Novo projeto",
    "projects.newTask": "Nova tarefa",
    "projects.newColumn": "Nova coluna",
    "projects.task": "Tarefa",
    "projects.hours": "Horas",
    "projects.create": "Criar projeto",
    "projects.delete": "Excluir projeto",
    "projects.deleteConfirm": "Excluir o projeto \"{name}\"? Esta ação não pode ser desfeita.",
    "projects.notFound": "Projeto não encontrado.",
    "errors.taskNotFound": "Tarefa não encontrada.",
    "errors.projectNotFound": "Projeto não encontrado.",
    "errors.activityNotFound": "Atividade não encontrada.",
    "errors.dealNotFound": "Negócio não encontrado.",
    "errors.attachmentNotFound": "Anexo não encontrado.",
    "errors.generic": "Não foi possível concluir.",
    "errors.unauthorized": "Não autorizado. Faça login novamente.",
    "errors.badCredentials": "E-mail ou senha incorretos.",
    "errors.emailInUse": "Esse e-mail já está em uso.",
    "errors.invalidEmail": "Informe um e-mail válido.",
    "errors.invalidName": "Informe o nome.",
    "errors.passwordShort": "A senha precisa ter pelo menos 6 caracteres.",
    "errors.noProjectAccess": "Você não participa deste projeto.",
    "time.title": "Horas",
    "time.manual": "Lançamento manual",
    "time.report": "Relatório",
    "time.task": "Tarefa",
    "time.hours": "Horas",
    "time.note": "Nota",
    "time.date": "Data",
    "time.save": "Salvar horas",
    "time.user": "Pessoa",
    "time.allUsers": "Todas as pessoas",
    "time.allProjects": "Todos os projetos",
    "time.from": "De",
    "time.to": "Até",
    "time.total": "Total",
    "time.source": "Origem",
    "time.choose": "Escolha",
    "time.log": "Lançar horas",
    "time.filter": "Filtro do relatório",
    "time.submit": "Lançar",
    "time.running": "Timer aberto em {title}. Use a barra de baixo para parar.",
    "crm.title": "Vendas",
    "crm.funnel": "Funil",
    "crm.contacts": "Contatos",
    "crm.companies": "Empresas",
    "crm.activities": "Atividades",
    "crm.reports": "Relatórios",
    "crm.noCompany": "Sem empresa",
    "crm.noContact": "Sem contato",
    "crm.owner": "responsável",
    "crm.win": "Ganho — abrir projeto",
    "crm.openLinked": "Abrir projeto ligado",
    "crm.lost": "Perdido",
    "crm.newStage": "Nova etapa do funil",
    "crm.newFollow": "Novo follow-up",
    "crm.stage": "Etapa",
    "crm.value": "Valor",
    "crm.company": "Empresa",
    "crm.contact": "Contato",
    "crm.seller": "Vendedor",
    "crm.me": "Eu",
    "crm.newDeal": "Novo negócio",
    "import.title": "Importar",
    "import.asana": "Asana",
    "import.clockify": "Clockify",
    "import.token": "Token",
    "import.apiKey": "Chave de API",
    "import.run": "Importar",
    "ai.title": "Comandos",
    "ai.lead": "Digite um comando em linguagem natural para a plataforma.",
    "ai.execute": "Executar comando",
    "ai.sending": "Enviando…",
    "ai.summary": "Gerar resumo",
    "ai.generating": "Gerando…",
    "ai.result": "Resultado",
    "ai.examples": "Exemplos",
    "ai.ex.create": "Criar tarefa",
    "ai.ex.summary": "Resumo do projeto",
    "ai.ex.risks": "Tarefas em risco",
    "ai.ex.done": "Concluir tarefa",
    "ai.ex.hours": "Registrar horas",
    "team.title": "Equipe",
    "team.role": "Papel",
    "team.password": "Senha",
    "team.invite": "Convidar pessoa",
    "team.email": "E-mail",
    "drawer.unassigned": "Sem responsável",
    "drawer.startTimer": "Iniciar timer",
    "drawer.reopen": "Reabrir",
    "drawer.complete": "Concluir",
    "drawer.subtasks": "Subtarefas",
    "drawer.newSubtask": "Nova subtarefa",
    "drawer.attachments": "Anexos",
    "drawer.chooseFile": "Escolher arquivo",
    "drawer.hours": "Horas",
    "drawer.comments": "Comentários",
    "drawer.commentPh": "Escrever comentário",
    "drawer.estimate": "Estimativa: {h}h ({source}). Horas lançadas: {logged}.{overdue}",
    "drawer.overdue": " Prazo vencido.",
    "hours.min": "{n} min",
    "hours.h": "{n}h",
    "hours.hm": "{h}h {m}min",
};

const I18nContext = createContext(null);

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? `{${key}}`));
}

const API_ERROR_KEYS = {
  "Tarefa não encontrada.": "errors.taskNotFound",
  "Projeto não encontrado.": "errors.projectNotFound",
  "Atividade não encontrada.": "errors.activityNotFound",
  "Negócio não encontrado.": "errors.dealNotFound",
  "Anexo não encontrado.": "errors.attachmentNotFound",
  "Não foi possível concluir.": "errors.generic",
  "Não autorizado.": "errors.unauthorized",
  "Faça login para continuar.": "errors.unauthorized",
  "E-mail ou senha incorretos.": "errors.badCredentials",
  "Esse e-mail já está em uso.": "errors.emailInUse",
  "Informe um e-mail válido.": "errors.invalidEmail",
  "Informe o nome.": "errors.invalidName",
  "A senha precisa ter pelo menos 6 caracteres.": "errors.passwordShort",
  "Você não participa deste projeto.": "errors.noProjectAccess",
};

export function localizeApiError(message, t) {
  if (!message) return t("errors.generic");
  const key = API_ERROR_KEYS[String(message).trim()];
  if (key) return t(key);
  if (/não encontrad/i.test(message) && /tarefa/i.test(message)) return t("errors.taskNotFound");
  if (/não encontrad/i.test(message) && /projeto/i.test(message)) return t("errors.projectNotFound");
  return message;
}

export function I18nProvider({ children }) {
  useEffect(() => {
    document.documentElement.lang = "pt-BR";
    localStorage.removeItem("idonea_lang");
  }, []);

  const value = useMemo(() => {
    const t = (key, vars) => interpolate(strings[key] ?? key, vars);
    const tx = (text) => text;
    return { lang: "pt", t, tx, locale: "pt-BR" };
  }, []);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}

export function useTx() {
  return useI18n().tx;
}

export function priorityLabels(t) {
  return {
    baixa: t("priority.baixa"),
    media: t("priority.media"),
    alta: t("priority.alta"),
    urgente: t("priority.urgente"),
  };
}
