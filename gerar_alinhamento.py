# -*- coding: utf-8 -*-
"""PDF só com texto, sem cor."""

from reportlab.lib.colors import black
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    KeepTogether,
)

pdfmetrics.registerFont(TTFont("Calibri", r"C:\Windows\Fonts\calibri.ttf"))
pdfmetrics.registerFont(TTFont("Calibri-Bold", r"C:\Windows\Fonts\calibrib.ttf"))

PAGE_W, PAGE_H = A4
LEFT = 22 * mm
RIGHT = 22 * mm
TOP = 20 * mm
BOTTOM = 18 * mm


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(black)
    canvas.setFont("Calibri", 9)
    canvas.drawCentredString(PAGE_W / 2, 10 * mm, str(doc.page))
    canvas.restoreState()


def styles():
    body = ParagraphStyle(
        "body",
        fontName="Calibri",
        fontSize=11,
        leading=15,
        textColor=black,
        alignment=TA_JUSTIFY,
        spaceAfter=2.2 * mm,
    )
    return {
        "title": ParagraphStyle(
            "title",
            fontName="Calibri-Bold",
            fontSize=14,
            leading=18,
            textColor=black,
            alignment=TA_LEFT,
            spaceAfter=4 * mm,
        ),
        "h": ParagraphStyle(
            "h",
            fontName="Calibri-Bold",
            fontSize=12,
            leading=16,
            textColor=black,
            alignment=TA_LEFT,
            spaceBefore=3 * mm,
            spaceAfter=2 * mm,
        ),
        "body": body,
        "item": ParagraphStyle(
            "item",
            fontName="Calibri",
            fontSize=11,
            leading=14.5,
            textColor=black,
            alignment=TA_LEFT,
            leftIndent=8 * mm,
            firstLineIndent=-5 * mm,
            spaceAfter=0.8 * mm,
        ),
        "close": ParagraphStyle(
            "close",
            fontName="Calibri",
            fontSize=11,
            leading=16,
            textColor=black,
            alignment=TA_LEFT,
            spaceBefore=2 * mm,
            spaceAfter=0,
        ),
    }


S = styles()


def flatten(blocks):
    out = []
    for block in blocks:
        if isinstance(block, list):
            out.extend(block)
        else:
            out.append(block)
    return out


def section(title, blocks):
    blocks = flatten(blocks)
    head = Paragraph(title, S["h"])
    return [KeepTogether([head, blocks[0]]), *blocks[1:]]


def bullets(items):
    return [Paragraph(f"•  {text}", S["item"]) for text in items] + [Spacer(1, 1.5 * mm)]


def numbers(items):
    return [Paragraph(f"{i}.  {text}", S["item"]) for i, text in enumerate(items, start=1)] + [
        Spacer(1, 1.5 * mm)
    ]


def build():
    out = r"C:\Users\Administrator\Documents\Workana-task\Carolina-Lovable\Alinhamento-do-projeto.pdf"
    doc = BaseDocTemplate(
        out,
        pagesize=A4,
        title="Alinhamento do projeto",
        author="Carolina Santos",
    )
    frame = Frame(
        LEFT,
        BOTTOM,
        PAGE_W - LEFT - RIGHT,
        PAGE_H - TOP - BOTTOM,
        id="main",
        showBoundary=0,
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=footer)])

    story = []
    story.append(Paragraph("Alinhamento do projeto", S["title"]))
    story.append(Paragraph("Marcelo, boa tarde.", S["body"]))
    story.append(
        Paragraph(
            "Revisei tudo o que combinamos. Segue organizado, para começarmos alinhados.",
            S["body"],
        )
    )

    story.extend(
        section(
            "Conta no Lovable",
            [
                Paragraph(
                    "Pode ser como você disse. A conta fica no seu nome. Na entrega, passamos para o plano grátis. "
                    "Antes disso, o código já estará no GitHub e os dois sistemas já estarão na sua VPS. "
                    "A partir daí, o que fica no ar é a VPS. O plano grátis do Lovable serve para você manter o acesso ao projeto. "
                    "Durante o desenvolvimento, eu ativo o plano pago e os créditos ficam por minha conta, como combinado. Você não paga o Lovable.",
                    S["body"],
                ),
                Paragraph("Para abrir a conta no seu nome, preciso só disto:", S["body"]),
                numbers(
                    [
                        "O e-mail que será o dono da conta.",
                        "Confirmação de que você abre esse e-mail, porque o acesso chega por lá.",
                        "Seu usuário do GitHub, se já tiver. Se não tiver, eu te oriento a criar um gratuito nesse mesmo e-mail. É por ele que o código sai do Lovable e vai para a VPS.",
                    ]
                ),
                Paragraph(
                    "A senha você cria direto no Lovable. Não precisa enviar senha por aqui. "
                    "O caminho mais simples é você entrar em lovable.dev/signup, criar a conta com esse e-mail e me convidar para o workspace. "
                    "Se preferir, me manda o e-mail que eu te guio passo a passo.",
                    S["body"],
                ),
            ],
        )
    )

    story.extend(
        section(
            "Ordem e prazo",
            [
                Paragraph("São dois projetos separados.", S["body"]),
                numbers(
                    [
                        "Primeiro, a plataforma no estilo do Asana, com controle de horas nativo. Entrega na VPS, já com a importação do Asana e do Clockify funcionando. Prazo de 15 a 20 dias, com entregas parciais para você acompanhar.",
                        "Depois, o CRM no estilo do Pipedrive. Mais 20 dias, também com entregas parciais.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "Plataforma de gestão",
            [
                Paragraph("Primeiro projeto, no estilo do Asana.", S["body"]),
                bullets(
                    [
                        "Projetos e tarefas, com responsável, prazo, prioridade, subtarefas, anexos e comentários.",
                        "Lista e quadro Kanban, com arrastar e soltar.",
                        "Menções, notificações e histórico de atividades.",
                        "Controle de horas nativo: timer na tarefa, lançamento manual e relatório por pessoa, tarefa, projeto e período.",
                        "Importação do Asana, funcional: projetos, seções, tarefas, subtarefas, responsáveis, prazos e comentários.",
                        "Importação do Clockify, funcional: horas já registradas, ligadas a cada tarefa, para não perder o histórico.",
                        "Integração com o GPT: criar tarefa, atualizar status, adicionar comentário e registrar andamento por texto.",
                        "Apoio de inteligência artificial: estimativa de tempo com base no histórico, alerta de tarefa com risco de atraso, resumo do andamento e criação de tarefas a partir de um texto.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "CRM de vendas",
            [
                Paragraph("Segundo projeto, no estilo do Pipedrive.", S["body"]),
                bullets(
                    [
                        "Funil visual, com etapas personalizáveis.",
                        "Negócios, contatos e empresas.",
                        "Atividades e follow-ups.",
                        "Relatórios de conversão por etapa e por vendedor.",
                        "Negócio fechado gera um projeto na plataforma de gestão, já com as tarefas iniciais.",
                        "Previsão de fechamento no funil, com inteligência artificial.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "VPS",
            [
                Paragraph(
                    "Na entrega do primeiro projeto, faço a migração para a Hostinger KVM 2 "
                    "(2 vCPU, 8 GB de RAM e 100 GB NVMe), no datacenter do Brasil. "
                    "O front-end fica com Docker e Nginx, e o banco PostgreSQL no próprio servidor, "
                    "com usuários, dados e configurações. O custo mensal, a partir daí, é só o da VPS, no seu nome. "
                    "Se o uso crescer, o upgrade para o KVM 4 não perde os dados.",
                    S["body"],
                ),
            ],
        )
    )

    story.extend(
        section(
            "O que fica para a etapa da importação",
            [
                Paragraph(
                    "Isso não trava o início. Quando a base da plataforma estiver pronta, preciso de um acesso de administrador no Asana "
                    "e da chave de API do Clockify, para trazer o histórico e deixar a importação funcionando.",
                    S["body"],
                ),
            ],
        )
    )

    story.append(Spacer(1, 2 * mm))
    story.append(
        Paragraph(
            "Se este roteiro estiver de acordo, me envie o e-mail da conta que eu já abro o Lovable e começo pela plataforma no estilo do Asana.",
            S["close"],
        )
    )
    story.append(Paragraph("Um abraço,", S["close"]))
    story.append(Paragraph("Carolina", S["close"]))

    doc.build(story)
    print(out)


if __name__ == "__main__":
    build()
