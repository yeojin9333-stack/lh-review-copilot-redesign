#!/usr/bin/env python3
"""Generate the fixed PoC full-evidence report shipped with the prototype."""

from __future__ import annotations

import html
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "ramp-scenarios.json"
OUTPUT_DIR = ROOT / "output" / "pdf"
PUBLIC_DIR = ROOT / "public" / "assets"
OUTPUT_NAME = "A-17BL_B1-R02_AI-review-full-evidence.pdf"
FONT_REGULAR = ROOT / "scripts" / "pdf-fonts" / "NanumSquareR.ttf"
FONT_BOLD = ROOT / "scripts" / "pdf-fonts" / "NanumSquareB.ttf"
SCENARIO_IDS = ("RMP-S26", "RMP-S19")

NAVY = colors.HexColor("#0C1D34")
TEAL = colors.HexColor("#0D8A62")
LIGHT_TEAL = colors.HexColor("#EAF7F3")
BLUE = colors.HexColor("#1D5FD1")
LIGHT_BLUE = colors.HexColor("#EAF1FE")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#657086")
LINE = colors.HexColor("#DFE4EC")
SOFT_BG = colors.HexColor("#F5F7FA")
AMBER_BG = colors.HexColor("#FFF4DD")


def esc(value: object) -> str:
    return html.escape(str(value or "")).replace("\n", "<br/>")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("NanumSquare", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("NanumSquareBold", str(FONT_BOLD)))


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "cover_kicker",
            parent=base["Normal"],
            fontName="NanumSquareBold",
            fontSize=9,
            textColor=TEAL,
            leading=13,
            tracking=1.8,
            alignment=TA_CENTER,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontName="NanumSquareBold",
            fontSize=26,
            textColor=NAVY,
            leading=36,
            alignment=TA_CENTER,
            wordWrap="CJK",
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle",
            parent=base["Normal"],
            fontName="NanumSquare",
            fontSize=11,
            textColor=MUTED,
            leading=18,
            alignment=TA_CENTER,
            wordWrap="CJK",
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="NanumSquareBold",
            fontSize=20,
            textColor=NAVY,
            leading=28,
            spaceAfter=10,
            wordWrap="CJK",
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="NanumSquareBold",
            fontSize=13,
            textColor=NAVY,
            leading=20,
            spaceAfter=7,
            wordWrap="CJK",
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontName="NanumSquareBold",
            fontSize=10,
            textColor=TEAL,
            leading=16,
            spaceAfter=4,
            wordWrap="CJK",
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName="NanumSquare",
            fontSize=8.7,
            textColor=INK,
            leading=14.5,
            wordWrap="CJK",
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName="NanumSquare",
            fontSize=7.5,
            textColor=MUTED,
            leading=12,
            wordWrap="CJK",
        ),
        "label": ParagraphStyle(
            "label",
            parent=base["BodyText"],
            fontName="NanumSquareBold",
            fontSize=7.6,
            textColor=MUTED,
            leading=12,
            wordWrap="CJK",
        ),
        "table": ParagraphStyle(
            "table",
            parent=base["BodyText"],
            fontName="NanumSquare",
            fontSize=7.5,
            textColor=INK,
            leading=11.5,
            wordWrap="CJK",
        ),
        "table_bold": ParagraphStyle(
            "table_bold",
            parent=base["BodyText"],
            fontName="NanumSquareBold",
            fontSize=7.5,
            textColor=NAVY,
            leading=11.5,
            wordWrap="CJK",
        ),
        "disclaimer": ParagraphStyle(
            "disclaimer",
            parent=base["BodyText"],
            fontName="NanumSquare",
            fontSize=8.3,
            textColor=colors.HexColor("#8A5A00"),
            leading=14,
            wordWrap="CJK",
        ),
    }


def page_header_footer(canvas, doc) -> None:
    canvas.saveState()
    page_width, page_height = A4
    if doc.page > 1:
        canvas.setFont("NanumSquareBold", 7.5)
        canvas.setFillColor(NAVY)
        canvas.drawString(18 * mm, page_height - 13 * mm, "LH REVIEW COPILOT")
        canvas.setFont("NanumSquare", 7)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(
            page_width - 18 * mm,
            page_height - 13 * mm,
            "A-17BL · B1 곡선형 램프 R-02 · 전체 근거",
        )
        canvas.setStrokeColor(LINE)
        canvas.line(18 * mm, page_height - 16 * mm, page_width - 18 * mm, page_height - 16 * mm)
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 13 * mm, page_width - 18 * mm, 13 * mm)
    canvas.setFont("NanumSquare", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 8 * mm, "시연용 PoC 보고서 · 전문가 확인 전제")
    canvas.drawRightString(page_width - 18 * mm, 8 * mm, f"{doc.page}")
    canvas.restoreState()


def kv_table(rows, styles, widths=(34 * mm, 132 * mm), background=colors.white):
    data = [
        [
            Paragraph(esc(label), styles["label"]),
            Paragraph(esc(value), styles["body"]),
        ]
        for label, value in rows
    ]
    table = Table(data, colWidths=list(widths), hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), SOFT_BG),
                ("BACKGROUND", (1, 0), (1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def section_title(number: str, title: str, description: str, styles):
    badge = Table(
        [
            [
                Paragraph(number, styles["table_bold"]),
                Paragraph(title, styles["h1"]),
            ]
        ],
        colWidths=[18 * mm, 148 * mm],
    )
    badge.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), LIGHT_TEAL),
                ("TEXTCOLOR", (0, 0), (0, 0), TEAL),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, 0), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return [badge, Spacer(1, 3 * mm), Paragraph(description, styles["body"]), Spacer(1, 6 * mm)]


def evidence_card(index, evidence, source, styles):
    source = source or {}
    candidate = evidence.get("후보명·사례명", "연결 근거")
    rows = [
        ("사례 ID", evidence.get("후보 ID", "")),
        ("해결하려던 문제", source.get("이슈 상세") or source.get("이슈") or evidence.get("회수 기대 이유")),
        ("개선 행위", source.get("제안행위") or candidate),
        ("유사한 이유", evidence.get("회수 기대 이유")),
        ("현재 조건과 다른 점", evidence.get("적용 조건·주의")),
        ("원문 출처", f"{evidence.get('출처 파일·기관', '')} · {evidence.get('근거 위치', '')}"),
    ]
    return KeepTogether(
        [
            Paragraph(f"VE {index:02d} · {esc(candidate)}", styles["h2"]),
            kv_table(rows, styles),
            Spacer(1, 5 * mm),
        ]
    )


def rule_card(index, evidence, rule, styles):
    rule = rule or {}
    document = evidence.get("후보명·사례명", "연결 근거")
    rows = [
        ("근거 유형", evidence.get("근거 유형", "")),
        ("문서명", document),
        ("조항·문단", evidence.get("근거 위치") or rule.get("핵심 조문·근거 위치", "")),
        ("적용 조건", evidence.get("적용 조건·주의") or rule.get("적용 대상·전제", "")),
        ("현재 검토와의 관련성", evidence.get("회수 기대 이유")),
        ("직접 근거 / AI 해석", "원문 인용 ID 연결" if evidence.get("원문 인용 ID") else "AI 연결 후보 - 전문가 확인 필요"),
        ("원문 출처", evidence.get("출처 파일·기관") or rule.get("공식 출처", "")),
    ]
    return KeepTogether(
        [
            Paragraph(f"{index:02d} · {esc(document)}", styles["h2"]),
            kv_table(rows, styles),
            Spacer(1, 5 * mm),
        ]
    )


def build_report() -> Path:
    register_fonts()
    styles = make_styles()
    payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    scenarios = [
        item for item in payload["scenarios"] if item["시나리오 ID"] in SCENARIO_IDS
    ]
    contexts = [item["context"] for item in scenarios]
    evidence_by_id = {}
    for scenario in scenarios:
        for item in scenario.get("evidence", []):
            evidence_by_id.setdefault(item["Evidence ID"], item)
    evidence = list(evidence_by_id.values())
    cases = [item for item in evidence if "사례" in item.get("근거 유형", "")]
    rules = [item for item in evidence if item not in cases]
    source_cases = {item["사례 ID"]: item for item in payload.get("sourceCases", [])}
    source_rules = {item["Rule ID"]: item for item in payload.get("rules", [])}

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / OUTPUT_NAME
    generated_at = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y.%m.%d %H:%M KST")

    doc = BaseDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title="A-17BL B1-R02 AI 설계검토 전체 근거",
        author="LH Review Copilot",
        subject="PoC 시나리오 및 연결 근거 보고서",
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="normal",
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    doc.addPageTemplates(
        PageTemplate(id="report", frames=frame, onPage=page_header_footer)
    )

    story = [
        Spacer(1, 32 * mm),
        Paragraph("LH REVIEW COPILOT", styles["cover_kicker"]),
        Spacer(1, 7 * mm),
        Paragraph("AI 설계검토 전체 근거", styles["cover_title"]),
        Spacer(1, 5 * mm),
        Paragraph(
            "A-17BL 공동주택 · 지하주차장 B1 · 곡선형 램프 R-02",
            styles["cover_subtitle"],
        ),
        Spacer(1, 18 * mm),
        kv_table(
            [
                ("프로젝트명", "A-17BL 공동주택"),
                ("검토 대상", "B1 곡선형 램프 R-02"),
                (
                    "검토 의도",
                    "B1 램프의 차량 동선, 곡선부 시야와 우수 유입·배수 조건을 함께 검토",
                ),
                ("생성 일시", generated_at),
                ("데이터 범위", "RMP-S26 + RMP-S19 · 연결 Evidence 전체"),
                ("출처 모드", "규칙·데이터 기반 RAG (sourceMode: rule)"),
            ],
            styles,
            background=LIGHT_BLUE,
        ),
        Spacer(1, 15 * mm),
        Paragraph(
            "이 보고서는 화면에 우선 표시되는 상위 3건뿐 아니라 현재 검토조건에 연결된 "
            f"VE 사례 {len(cases)}건과 법령·지침 {len(rules)}건을 모두 포함합니다.",
            styles["cover_subtitle"],
        ),
        PageBreak(),
    ]

    story.extend(
        section_title(
            "01",
            "Review Context 요약",
            "선택 공간과 인접 객체, 검토 이슈, 미확인 정보를 두 개의 PoC 시나리오에서 통합했습니다.",
            styles,
        )
    )
    story.append(
        kv_table(
            [
                ("선택 공간", "지하주차장 B1 · 곡선형 램프 R-02"),
                ("주요 객체", "곡선 램프 · 내측 벽체 · 트렌치 · 집수정"),
                (
                    "인접 객체·공종",
                    "주차구획 · 보행동선 · 난간 · 차량 궤적 · 방수층 · 노면마감 · 전기·설비",
                ),
                (
                    "공간조건",
                    "곡선형 · 구배 14% · 내측 벽체 존재 · 인접 주차면 존재 · 외기 유입부",
                ),
                (
                    "검토 이슈",
                    "차량 동선 · 곡선부 시야 · 보행안전 · 우수 유입 · 배수 · 결빙 · 유지관리",
                ),
                (
                    "미확인 정보",
                    "회전반경 자료 · 집수정 연결 상세 · 배수 구배 · 동절기 운영조건 · 적용 법령의 대상 여부",
                ),
            ],
            styles,
        )
    )
    story.append(Spacer(1, 7 * mm))
    for context in contexts:
        story.extend(
            [
                Paragraph(
                    f"{esc(context['시나리오 ID'])} · {esc(context['주요객체'])}",
                    styles["h3"],
                ),
                Paragraph(esc(context["Context 요약"]), styles["body"]),
                Spacer(1, 4 * mm),
            ]
        )

    story.append(PageBreak())
    story.extend(
        section_title(
            "02",
            "관련 VE 사례 전체",
            f"현재 검토에 연결된 VE 사례 {len(cases)}건입니다. 유사성은 대안 탐색 근거이며 현재 설계에 그대로 적용하지 않습니다.",
            styles,
        )
    )
    for index, item in enumerate(cases, 1):
        story.append(evidence_card(index, item, source_cases.get(item["후보 ID"]), styles))

    story.append(PageBreak())
    story.extend(
        section_title(
            "03",
            "관련 법령·지침 전체",
            f"현재 검토에 연결된 법령·LH 지침 {len(rules)}건입니다. 적법·위법 또는 충족·위반 여부를 AI가 확정하지 않습니다.",
            styles,
        )
    )
    for index, item in enumerate(rules, 1):
        story.append(rule_card(index, item, source_rules.get(item["후보 ID"]), styles))

    story.append(PageBreak())
    story.extend(
        section_title(
            "04",
            "검토 대안 요약",
            "아래 대안은 현재 조건에서 검토할 수 있는 후보이며 전문가가 형상·운영·적용조건을 확인합니다.",
            styles,
        )
    )
    alternatives = [
        (
            "현재안",
            "기존 곡선형 램프와 높은 내측 벽체, 기존 트렌치 및 차량 동선을 유지",
            "현재 형상과 운영조건 유지",
            "회전반경 자료 · 시거 및 배수계산서",
        ),
        (
            "대안 1 · 시야 개선",
            "곡선부 내측 벽체 일부 후퇴 및 높이 축소, P-01 운영 제외, 차량 궤적 조정",
            "곡선부 시야와 회전공간 확보 후보",
            "구조 검토 · 인접 주차면 운영범위 · 차량 궤적",
        ),
        (
            "대안 2 · 배수 개선",
            "트렌치를 램프 저점부로 이동하고 집수정 후보와 연결 배관, 우수 흐름 표시",
            "우수 유입과 결빙 대응 후보",
            "배수 구배 · 집수정 연결 상세 · 방수층 접합부",
        ),
        (
            "대안 3 · 설비 보완",
            "기본 형상 유지, 곡선부 반사경·검지코일·진입 경고등·정지선 추가",
            "형상 변경 없이 인지·운영설비를 보완하는 후보",
            "설비 전원 · 시인성 · 유지관리 · 설치 상세",
        ),
    ]
    for title, change, effect, checks in alternatives:
        story.extend(
            [
                Paragraph(title, styles["h2"]),
                kv_table(
                    [
                        ("변경 내용", change),
                        ("기대효과", effect),
                        ("추가 확인사항", checks),
                    ],
                    styles,
                ),
                Spacer(1, 6 * mm),
            ]
        )

    story.append(PageBreak())
    story.extend(
        section_title(
            "05",
            "판단 경계와 면책",
            "검토 준비와 근거 연결은 AI가 수행하지만 판단 권한과 책임은 전문가 및 LH 담당자에게 있습니다.",
            styles,
        )
    )
    disclaimer_items = [
        "AI는 설계 적정성, 구조안전성, 법적 승인 여부를 최종 판단하지 않습니다.",
        "법령·지침은 적용 후보와 확인조건이며 최신 원문과 대상 시설 여부를 전문가가 확인해야 합니다.",
        "비용·공기·성능 수치는 계산근거가 연결된 경우에만 사용할 수 있으며 이 보고서는 임의 수치를 생성하지 않습니다.",
        "최종 대안 채택·보완·기각 판단은 전문가가 수행하고, LH 담당자가 설계사 답변과 반영 결과를 확인합니다.",
        "본 문서는 PoC 검증용 합성 시나리오 및 표준화 자료에 기반한 시연용 보고서입니다.",
    ]
    disclaimer_box = Table(
        [[Paragraph(f"• {esc(item)}", styles["disclaimer"])] for item in disclaimer_items],
        colWidths=[166 * mm],
    )
    disclaimer_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), AMBER_BG),
                ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#E6C579")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    story.append(disclaimer_box)
    story.append(Spacer(1, 14 * mm))
    story.append(
        Paragraph(
            "복잡한 검토 준비는 AI가 완료하고, 사용자는 근거와 대안을 확인한 뒤 결정합니다.",
            styles["cover_subtitle"],
        )
    )

    doc.build(story)
    public_path = PUBLIC_DIR / OUTPUT_NAME
    public_path.write_bytes(output_path.read_bytes())
    return output_path


if __name__ == "__main__":
    print(build_report())
