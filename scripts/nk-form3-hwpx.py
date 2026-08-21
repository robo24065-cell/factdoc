#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""서식3 한글본(hwpx)의 수치를 analysis.json 에 맞춘다 — 재실행 가능·멱등.

왜 필요한가
  제출 서류는 셋이다. docx·pdf 는 scripts/make-submission-docs.cjs 가 만들지만
  **한글본(hwpx)은 사람이 만든 파일**이라 생성기가 손대지 않는다. 그래서 분석이 갱신되면
  hwpx 만 옛 수치로 남는다 — 실제로 그랬다(15.5배 · 0.121 · 1.878 · 19배 세대).
  「한 곳이라도 옛 값이 남으면 결함」이므로, 사람이 눈으로 고치는 대신 기계가 고친다.

무엇을 하는가
  Contents/section0.xml 의 <hp:t> 텍스트만 바꾼다. 서식·표 구조·이미지는 건드리지 않는다.
    ① 표 칸 — 통째로 한 수인 런만 정확히 일치할 때 바꾼다(문장 속 "2,829명" 같은 것을 건드리지 않으려고).
    ② 본문 — 문맥이 유일한 문자열만 바꾼다.
  값은 전부 frontend/public/gohyang/analysis.json 의 record-density-gap · legacy-priority 카드에서 읽는다.
  하드코딩한 것은 「무엇을 무엇으로 바꾸는가」의 **옛 문자열**뿐이다.

멱등성
  이미 새 값이면 바꿀 것이 없다고 보고하고 파일을 건드리지 않는다.
  옛 문자열이 예상 횟수와 다르게 나오면 **바꾸지 않고 죽는다** — 조용히 반쯤 고치지 않는다.

사용
  python scripts/nk-form3-hwpx.py            # 실제로 고친다(백업 .bak 생성)
  python scripts/nk-form3-hwpx.py --check    # 무엇이 남아 있는지만 본다(쓰기 없음)
"""
import io
import json
import os
import re
import shutil
import sys
import zipfile

# 윈도우 콘솔은 기본이 cp949 라 ✓·★ 같은 글자에서 죽는다 — 표준출력을 UTF-8 로 고정한다.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception:      # 파이프·리다이렉트 등 reconfigure 가 없는 경우는 그대로 둔다
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HWPX = os.path.join(ROOT, '제출서류', '작성서류서식', '서식3. 아이디어 기획서.hwpx')
ANALYSIS = os.path.join(ROOT, 'frontend', 'public', 'gohyang', 'analysis.json')
REUNION = os.path.join(ROOT, 'frontend', 'public', 'gohyang', 'reunion.json')
CHECK = '--check' in sys.argv


def load(p):
    with io.open(p, encoding='utf-8') as f:
        return json.load(f)


A = load(ANALYSIS)
R = load(REUNION)
cards = {c['id']: c for c in A['cards']}
DENS, PRIO = cards['record-density-gap'], cards['legacy-priority']
fin = lambda card, label: next(f for f in card['findings'] if f['label'] == label)
num = lambda s: re.search(r'[\d,]+(?:\.\d+)?', s).group(0)

gap = num(fin(DENS, '격차')['value'])                                   # 13.9
gap_narrow = re.search(r'([\d.]+)배', fin(DENS, '격차')['note']).group(1)  # 15
bot_d = num(fin(DENS, '밀도 최하위')['value'].split(' ', 1)[1])            # 0.14
top_d = num(fin(DENS, '밀도 최상위')['value'].split(' ', 1)[1])            # 1.944
p1 = fin(PRIO, '1순위')['note']
p1_dens = re.search(r'기록 ([\d.]+)건/인', p1).group(1)
p1_ident = re.search(r'식별기록 ([\d.]+)건/인', p1).group(1)

# 집계 기준일 — 카드가 말하는 것을 그대로 쓴다. 손으로 박아 두면 문서 안에서 두 날짜가 공존한다(실제로 그랬다).
AGG = DENS['asOfAxes']['aggregation']
# 보수 집계로 순위가 그대로인가 — 카드가 계산해 붙인 문장에서 읽는다(단언하지 않는다)
NARROW_ORDER = ('순위도 그대로다' if '순서도 그대로' in fin(DENS, '격차')['note']
                else '가장 많은 곳과 가장 적은 곳은 그대로이고 중간 순서는 바뀐다')
# 고향 안내인 하니스 실적 — 손으로 옮기지 않는다(29 로 적혀 있었고 실측은 36 이었다)
GUIDE = load(os.path.join(ROOT, '북한자료-api', 'guide-check.json'))

# 밀도 표 — 생존자 많은 순(한글본 표의 행 순서와 같다)
rows = sorted(DENS['table'], key=lambda r: -r['생존자'])
assert len(rows) == 7, '밀도 표 행이 7개가 아니다'
fmt = lambda n: '{:,}'.format(n)

# ── ① 표 칸: 런 전체가 그 수일 때만 바꾼다 (옛 값 → 새 값) ─────────────────
CELL = [
    ('829', fmt(rows[0]['기록계'])), ('0.121', str(rows[0]['밀도'])),
    ('4,499', fmt(rows[1]['기록계'])), ('1.266', str(rows[1]['밀도'])),
    ('1,443', fmt(rows[2]['기록계'])), ('0.459', str(rows[2]['밀도'])),
    ('825', fmt(rows[3]['기록계'])), ('0.400', str(rows[3]['밀도'])),
    ('621', fmt(rows[4]['기록계'])), ('0.572', str(rows[4]['밀도'])),
    ('979', fmt(rows[5]['기록계'])), ('0.908', str(rows[5]['밀도'])),
    ('969', fmt(rows[6]['기록계'])), ('1.878', str(rows[6]['밀도'])),
]

# ── ② 본문: 문맥이 유일한 문자열만 ────────────────────────────────────────
CORNERS = (
    '이산가족정보통합시스템 12개 코너(나의 살던 고향은·영상편지·이산가족상봉 이모저모·시간여행·웹툰·'
    '박물관 소개·손편지·컬렉션·기록관·기증현황·연표·통합검색) — 수집일 {d}. '
    '이 가운데 고향이 원문으로 확정되는 {n}건(사진 {pm}/{pc} · 영상편지 {vm}/{vc:,})만 기록 밀도 분자에 더했고, '
    '나머지 10개 코너는 기존 사료와 중복이거나 지역 귀속이 없어 넣지 않았다.'
).format(
    d=R['collectedAt']['htgallery'], n=R['numeratorDelta']['distinctRecordsAdded'],
    pm=R['htgallery']['mapped'], pc=R['htgallery']['collected'],
    vm=R['vletter']['mapped'], vc=R['vletter']['collected'],
)
TITLE = '「이어 적는 고향」 : 이산가족의 고향별 기록 공백을 계산해 기증으로 잇는 서비스'

PROSE = [
    # (옛 문자열, 새 문자열, 예상 횟수)
    ('0.121', bot_d, 3),
    ('1.878', top_d, 1),
    ('15.5배', gap + '배', 6),
    ('19배이며', gap_narrow + '배이며', 1),
    ('(연표·보도자료·사료만)', '(연표·보도자료·사료·신규 수집분만)', 1),
    ('기록 0.400건/인', '기록 ' + p1_dens + '건/인', 1),
    ('식별사료 0.018건/인', '식별기록 ' + p1_ident + '건/인', 1),
    ('식별 가능한 사료의 공백', '식별 가능한 기록의 공백', 1),
    ('집계 실행일이 2026-08-15다', '집계 실행일이 2026-08-21이다', 1),
    ('(집계 실행 2026-08-15 ·', '(집계 실행 2026-08-21 ·', 1),
    # ── 기록 계의 정의가 자기 표의 값과 어긋나 있었다 ──────────────────────
    #   적힌 식(연표+보도자료+동향+개황+사료)대로 더하면 황해도(구) 829 가 나오는데
    #   표에 실린 값은 957 이다(고향사진 19 · 영상편지 109 를 더한 값). docx 는 이미 고쳐졌고
    #   hwpx 만 옛 문장이 남아 있었다 — 제출은 한글본으로 하므로 여기가 틀린 쪽이었다.
    ('기록 계(연표·보도자료·동향·개황·사료의 합)',
     '기록 계(연표·보도자료·동향·개황·사료·고향사진·영상편지의 합)', 1),
    # ── 집계 기준일 — 한 문서 안에서 2026-08-15 와 2026-08-21 이 함께 쓰이고 있었다 ──
    ('단일 기준일이 없고, 집계 실행일이 2026-08-21이다', '단일 기준일이 없다 — ' + AGG, 1),
    ('(집계 실행 2026-08-21 ·', '(' + AGG + ' ·', 1),
    ('집계 실행 2026-08-15, 사료 수집 2026-08-19', AGG + ', 사료 수집 2026-08-19', 1),
    #   2)항은 「기록 집계 실행일2026-08-15」만 적어 신규 수집분 반영일이 빠져 있었다
    ('2026-08-15 ·사료 수집일 2026-08-19',
     '2026-08-15 · 신규 수집분 반영 2026-08-21 · 사료 수집일 2026-08-19', 1),
    # ── 검증 실적 — 실측보다 낮게 적혀 있었다(29 → 36) ──────────────────────
    ('검사 29건 통과', '검사 %d건 통과' % GUIDE['passed'], 1),
    # ── 보수 집계에서 순위가 그대로인지는 계산으로 판정한다 ─────────────────
    ('배이며 순위는 그대로다', '배이며 ' + NARROW_ORDER, 1),
    # ── 화면·문서에 나갈 글이 아닌 것 ───────────────────────────────────────
    ('원본analysis.json의 해시(sha256:56b17ac9…99e0c9)', '원본 분석 파일의 지문값', 1),
    # 새 문자열이 옛 문자열의 부분집합이면 멱등성 가드에 걸려 영영 안 바뀐다 — 표기를 달리 쓴다
    ('통계청 완전생명표 2024년(KOSIS DT_1B42)', '통계청 완전생명표(1세별) 2024년', 1),
    ('통일의식조사 자료임을 명기해 주시길 부탁 드립니다」',
     '통일의식조사 자료임.」', 1),
    #   위 치환으로 앞말 끝소리가 바뀐다 — 조사도 함께 맞춘다(「…다」를 → 「…임.」을)
    ('통일의식조사 자료임.」를 싣고', '통일의식조사 자료임.」을 싣고', 1),
    # 제목 — 제출물 3종이 서로 다른 제목을 달고 있었다. docx(make-submission-docs.cjs TITLE)로 맞춘다.
    ('「이어 적는 고향」 : 이산가족 기록 공백 분석과 세대 계승 지도', TITLE, 1),
    # 활용 데이터 — 12개 코너를 출처·데이터명 두 줄에 싣는다(한글본에는 표가 없다)
    ('공공데이터 포털, 북한정보포털, 이산가족정보통합시스템',
     '공공데이터 포털, 북한정보포털, 이산가족정보통합시스템(게시판 공표 HWP · 스토리/디지털박물관 12개 코너), 남북이산가족 디지털박물관', 1),
    ('북한 동향 · 남북관계연표 · 보도자료 · 북한 개황 · 북한이탈주민 재북 출신지역별 현황',
     '북한 동향 · 남북관계연표 · 보도자료 · 북한 개황 · 북한이탈주민 재북 출신지역별 현황 · '
     '이산가족찾기 등록현황 월별 · 남북이산가족 디지털박물관 사료 · ' + CORNERS, 1),
]

with zipfile.ZipFile(HWPX) as z:
    names = z.namelist()
    blobs = {n: z.read(n) for n in names}
xml = blobs['Contents/section0.xml'].decode('utf-8')
orig = xml

changed, skipped, problems = [], [], []

for old, new in CELL:
    if old == new:
        continue
    pat = '<hp:t>%s</hp:t>' % old
    n = xml.count(pat)
    if n == 0:
        skipped.append('표 칸 %s (이미 갱신됨이거나 없음)' % old)
        continue
    if n > 1:
        problems.append('표 칸 %s 이 %d 곳 — 어느 것인지 가릴 수 없다' % (old, n))
        continue
    xml = xml.replace(pat, '<hp:t>%s</hp:t>' % new)
    changed.append('표 칸 %s → %s' % (old, new))

for old, new, want in PROSE:
    if old == new:
        continue
    # ★ 멱등성 — 새 문자열이 옛 문자열을 **포함**하는 치환(꼬리를 덧붙이는 것)은
    #   그냥 두 번 돌리면 꼬리가 또 붙는다(실측 사고: 활용 데이터 두 줄이 3배로 늘었다).
    #   그래서 새 문자열이 이미 있으면 건드리지 않는다.
    if new in xml:
        skipped.append('본문 「%s…」 (이미 갱신됨)' % old[:24])
        continue
    n = xml.count(old)
    if n == 0:
        skipped.append('본문 「%s…」 (이미 갱신됨)' % old[:24])
        continue
    if n != want:
        problems.append('본문 「%s…」 %d 곳 (예상 %d) — 원고가 바뀌었다. 사람이 확인할 것' % (old[:24], n, want))
        continue
    xml = xml.replace(old, new)
    changed.append('본문 %d곳 「%s…」 → 「%s…」' % (n, old[:20], new[:20]))

for line in changed:
    print('  + ' + line)
for line in skipped:
    print('  · ' + line)
for line in problems:
    print('  ! ' + line)

# 남은 옛 값 감사 — 고쳤든 안 고쳤든 마지막에 반드시 0 이어야 한다
LEFTOVER = ['15.5배', '0.121', '1.878', '0.400건/인', '0.018건/인', '19배이며']
left = [(s, xml.count(s)) for s in LEFTOVER if xml.count(s)]

if problems:
    print('\n✗ 예상과 다른 곳이 있어 쓰지 않았다 — 원고를 확인하라')
    sys.exit(1)
if CHECK:
    print('\n(--check) 쓰지 않았다. 남은 옛 값: %s' % (left or '없음'))
    sys.exit(0)
if xml == orig:
    print('\n✓ 바꿀 것이 없다 — hwpx 가 이미 현행 값이다. 남은 옛 값: %s' % (left or '없음'))
    sys.exit(0)
if left:
    print('\n✗ 바꾼 뒤에도 옛 값이 남았다: %s' % left)
    sys.exit(1)

shutil.copyfile(HWPX, HWPX + '.bak')
blobs['Contents/section0.xml'] = xml.encode('utf-8')
# mimetype 은 zip 첫 항목·무압축이어야 한글이 연다(OCF 규약) — 원본 순서를 그대로 유지한다
with zipfile.ZipFile(HWPX, 'w') as z:
    for n in names:
        z.writestr(
            n, blobs[n],
            zipfile.ZIP_STORED if n == 'mimetype' else zipfile.ZIP_DEFLATED,
        )
print('\n✓ %s 갱신 (백업 .bak) — 남은 옛 값 없음' % os.path.relpath(HWPX, ROOT))
