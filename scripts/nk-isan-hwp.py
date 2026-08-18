# nk-isan-hwp.py — HWP(v5, OLE) 본문 표 추출기. nk-isan-harvest.mjs 가 child_process 로 부른다.
#
#   python scripts/nk-isan-hwp.py <파일.hwp>   →  stdout 에 UTF-8 JSON
#
# 출력: { "prvText": str, "paras": [str], "tables": [ [ {r,c,rs,cs,text} ] ] }
#
# 왜 PrvText 만으로 안 되나: PrvText 스트림은 1023자에서 잘린다(미리보기 용도).
#   이산가족 신청현황 HWP 는 거주지역별 표 중간에서 끊겨 17개 시도가 다 안 나온다.
#   → BodyText 섹션(zlib raw deflate)의 레코드를 직접 걷는다.
#     - HWPTAG_TABLE(76)      : 새 표 시작
#     - HWPTAG_LIST_HEADER(72): 표 셀. payload u16[4..7] = (col, row, colspan, rowspan)
#     - HWPTAG_PARA_TEXT(67)  : 문단 텍스트(UTF-16LE). 직전 셀에 귀속.
#     - HWPTAG_PARA_HEADER(66): level 이 셀 level '미만'으로 내려오면 셀 밖으로 나온 것.
#       (실파일 확인: 셀 LIST_HEADER lvl 2 + 셀 문단 PARA_HEADER lvl 2 '동급' — <= 로 자르면 전부 유실된다)
#   제어문자: 인라인(4-9,19,20)·확장(1-3,11-18,21-23) 컨트롤은 8 WCHAR 를 차지한다.
#   (이걸 1자로 취급하면 필드 컨트롤 잔재('浵ࡦ…')가 숫자 옆에 붙는다 — 반드시 8자 스킵.)

import sys, json, struct, zlib
import olefile

CTRL_8CHAR = {1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}
CTRL_SKIP1 = {0, 24, 25, 26, 27, 28, 29, 30, 31}


def decode_para_text(payload: bytes) -> str:
    n = len(payload) // 2
    u = struct.unpack('<%dH' % n, payload[:n * 2])
    out = []
    j = 0
    while j < n:
        ch = u[j]
        if ch in CTRL_8CHAR:
            j += 8
            continue
        if ch in (10, 13):
            out.append('\n')
            j += 1
            continue
        if ch in CTRL_SKIP1:
            j += 1
            continue
        out.append(chr(ch))
        j += 1
    return ''.join(out).strip()


def parse(path: str) -> dict:
    ole = olefile.OleFileIO(path)
    hdr = ole.openstream('FileHeader').read()
    compressed = struct.unpack('<I', hdr[36:40])[0] & 1

    prv = ''
    if ole.exists('PrvText'):
        prv = ole.openstream('PrvText').read().decode('utf-16le', errors='replace').rstrip('\x00')

    tables = []   # [[{r,c,rs,cs,text}]]
    paras = []    # 표 밖 문단
    cur = None    # 현재 셀
    cur_lvl = -1

    secs = sorted((e for e in ole.listdir() if e[0] == 'BodyText'),
                  key=lambda e: int(e[1].replace('Section', '')))
    for sec in secs:
        data = ole.openstream(sec).read()
        if compressed:
            data = zlib.decompress(data, -15)
        i = 0
        while i < len(data):
            h = struct.unpack('<I', data[i:i + 4])[0]
            tag = h & 0x3FF
            lvl = (h >> 10) & 0x3FF
            size = (h >> 20) & 0xFFF
            i += 4
            if size == 0xFFF:
                size = struct.unpack('<I', data[i:i + 4])[0]
                i += 4
            payload = data[i:i + size]
            i += size

            if tag == 76:                      # HWPTAG_TABLE
                tables.append([])
                cur = None
            elif tag == 72 and size >= 16:     # HWPTAG_LIST_HEADER (표 셀)
                u = struct.unpack('<8H', payload[:16])
                c, r, cs, rs = u[4], u[5], u[6], u[7]
                if tables and c < 64 and r < 1000 and 1 <= cs <= 64 and 1 <= rs <= 1000:
                    cur = {'r': r, 'c': c, 'rs': rs, 'cs': cs, 'text': ''}
                    cur_lvl = lvl
                    tables[-1].append(cur)
                else:
                    cur = None
            elif tag == 66:                    # HWPTAG_PARA_HEADER
                if cur is not None and lvl < cur_lvl:
                    cur = None                 # 셀 리스트를 벗어난 문단
            elif tag == 67:                    # HWPTAG_PARA_TEXT
                t = decode_para_text(payload)
                if cur is not None:
                    cur['text'] = (cur['text'] + '\n' + t).strip() if cur['text'] else t
                elif t:
                    paras.append(t)
    return {'prvText': prv, 'paras': paras, 'tables': tables}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: python nk-isan-hwp.py <file.hwp>', file=sys.stderr)
        sys.exit(2)
    result = parse(sys.argv[1])
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
