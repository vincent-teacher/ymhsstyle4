# -*- coding: utf-8 -*-
"""
梅岡風網站建置腳本
------------------------------------------------------------
把「梅岡風」資料夾裡的版面掃描檔（梅岡風[期別]期第[N]版.JPG）
轉成網頁用 WebP 圖檔、以 Windows 內建 OCR 擷取文字，
並產生 data/issues.js 與 data/text.js 供網站讀取。

新增期別：把新圖片放進「梅岡風」資料夾 → 執行 更新網站.bat 即可。
只會處理新增或有變動的檔案（增量建置）。
"""
import json, os, re, sys, subprocess, tempfile, time, statistics
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(ROOT), '梅岡風')
WEB = os.path.join(ROOT, 'img', 'web')
THUMB = os.path.join(ROOT, 'img', 'thumb')
DATA = os.path.join(ROOT, 'data')
OCRDIR = os.path.join(DATA, 'ocr')
CACHE = os.path.join(DATA, 'cache.json')
META = os.path.join(DATA, 'meta.json')

WEB_MAX = 2400      # 閱讀用圖長邊
THUMB_W = 420       # 縮圖寬度
OCR_MAX = 3000      # OCR 用暫存圖長邊

# 檔名：梅岡風03期第1版.JPG / 梅岡風03期第1版（無副檔名）/ .jpg .jpeg .png .webp
NAME_RE = re.compile(r'^梅岡風\s*(\d+)\s*期\s*第\s*(\d+)\s*版(?:\.(jpe?g|png|webp))?$', re.I)

# 已知的版名（OCR 結果以此校正）
SECTIONS = ['學校要聞', '藝智園', '生活與休閒', '擲地有聲', '多元學習', '校園動態', '學生園地',
            '藝文天地', '文藝園地', '活動花絮', '榮譽榜', '專題報導', '人物專訪', '國際交流',
            '社團風采', '輔導園地', '圖書館訊', '健康生活', '升學資訊', '特別企劃', '校園生活',
            '學習園地', '創作園地', '畢業特刊', '新生專刊', '在地文化', '繽紛文藝', '校慶特輯',
            '校慶活動特刊']

CN_NUM = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
          '十一': 11, '十二': 12}


def log(*a):
    print(*a, flush=True)


def scan():
    pages = {}
    for fn in os.listdir(SRC):
        m = NAME_RE.match(fn)
        if not m:
            continue
        iss, pg = int(m.group(1)), int(m.group(2))
        full = os.path.join(SRC, fn)
        if not os.path.isfile(full):
            continue
        pages[(iss, pg)] = fn
    return pages


def key(iss, pg):
    return f'{iss:02d}-{pg}'


def convert(args):
    fn, k, ocr_tmp = args
    src = os.path.join(SRC, fn)
    im = Image.open(src)
    im.draft('RGB', (WEB_MAX + 800, WEB_MAX + 800))   # JPEG 快速降採樣解碼
    im = im.convert('RGB')
    w, h = im.size
    o = im.copy(); o.thumbnail((OCR_MAX, OCR_MAX), Image.LANCZOS)
    o.save(ocr_tmp, quality=90)
    web = im.copy(); web.thumbnail((WEB_MAX, WEB_MAX), Image.LANCZOS)
    web.save(os.path.join(WEB, k + '.webp'), 'WEBP', quality=74, method=4)
    th = im.copy(); th.thumbnail((THUMB_W, int(THUMB_W * 1.6)), Image.LANCZOS)
    th.save(os.path.join(THUMB, k + '.webp'), 'WEBP', quality=72, method=4)
    return k, web.size


def clean(t):
    t = re.sub(r'(?<=[^\x00-\x7f]) +', '', t)
    t = re.sub(r' +(?=[^\x00-\x7f])', '', t)
    return t.strip()


def cn2int(s):
    if s.isdigit():
        return int(s)
    return CN_NUM.get(s)


def match_section(s):
    s = re.sub(r'[\s\W\d第版]', '', s)
    if not s:
        return ''
    best, score = '', 0
    for sec in SECTIONS:
        common = sum(1 for c in set(sec) if c in s)
        sc = common / max(len(sec), len(s))
        if sc > score:
            best, score = sec, sc
    if score >= 0.5:
        return best
    return s if 2 <= len(s) <= 6 else ''


def parse_ocr(d):
    W, H = d['w'], d['h']
    lines = []
    for ln in d['lines']:
        t = clean(ln['t'])
        if not t:
            continue
        x0, y0, x1, y1 = ln['b']
        lines.append([t, round(x0 * 1000 / W), round(y0 * 1000 / H), round(x1 * 1000 / W), round(y1 * 1000 / H), y1 - y0])
    top = [l for l in lines if l[4] < 60]
    toptxt = ''.join(l[0] for l in sorted(top, key=lambda l: l[1]))
    year = month = None
    m = re.search(r'((?:19|20)\d{2})\s*年', toptxt)
    if m:
        year = int(m.group(1))
    m = re.search(r'(十[一二]|[一二三四五六七八九十]|\d{1,2})\s*月', toptxt)
    if m:
        month = cn2int(m.group(1))
    sec = ''
    # 版名在「第N版」的前面（奇數版，右上）或後面（偶數版，左上）
    band = sorted([l for l in top if l[2] < 45], key=lambda l: l[1])
    head = ''.join(l[0] for l in band)
    head = re.sub(r'(?:19|20)\d{2}年\S{1,3}月號?|中華民國\S*?日|星期\S', ' ', head)
    m = re.search(r'([一-鿿]{2,8}?)\s*第\s*[一二三四五六七八九十\d]+\s*[版腹]', head) or \
        re.search(r'第\s*[一二三四五六七八九十\d]+\s*[版腹]\s*([一-鿿]{2,8})', head)
    if m:
        sec = match_section(m.group(1))
    body = [l for l in lines if l[4] >= 60]
    hs = [l[5] for l in body] or [1]
    med = statistics.median(hs)
    heads = []
    for l in body:
        t = re.sub(r'[\s·．.。、，,:：•~丶亠…∕/\-—一]+$', '', l[0])
        t = re.sub(r'^[\s·．.。、，,:：•~丶亠…∕/\-—!！"\'“”*;；]+', '', t)
        cjk = len(re.findall(r'[一-鿿]', t))
        if l[5] >= med * 1.8 and cjk >= 4 and cjk / max(1, len(t)) >= .6 and len(t) <= 30:
            if t not in heads:
                heads.append(t)
    L = [[l[0], l[1], l[2], l[3], l[4]] for l in lines]
    return {'year': year, 'month': month, 'sec': sec, 'heads': heads[:14], 'L': L}


def run_ocr(jobs):
    """jobs: list of (tmp_jpg, out_json). 以 4 個 PowerShell 平行處理。"""
    if not jobs:
        return
    ps1 = os.path.join(ROOT, 'tools', 'ocr.ps1')
    n = min(4, len(jobs))
    chunks = [jobs[i::n] for i in range(n)]
    procs = []
    tmpdir = tempfile.mkdtemp(prefix='mgf_')
    for i, ch in enumerate(chunks):
        lf = os.path.join(tmpdir, f'list{i}.txt')
        with open(lf, 'w', encoding='utf-8') as f:
            f.write('\n'.join(f'{a}|{b}' for a, b in ch))
        procs.append(subprocess.Popen(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, lf],
                                      stdout=subprocess.PIPE, stderr=subprocess.STDOUT))
    done = 0
    for p in procs:
        for line in p.stdout:
            done += 1
            s = line.decode('utf-8', 'replace').strip()
            if s.startswith('FAIL'):
                log('  ', s)
            elif done % 10 == 0:
                log(f'  OCR {done}/{len(jobs)}')
        p.wait()


def main():
    t0 = time.time()
    for d in (WEB, THUMB, OCRDIR):
        os.makedirs(d, exist_ok=True)
    pages = scan()
    log(f'找到 {len(pages)} 個版面檔案，共 {len({k[0] for k in pages})} 期')
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    meta = json.load(open(META, encoding='utf-8')) if os.path.exists(META) else {}

    tmpdir = tempfile.mkdtemp(prefix='mgf_ocr_')
    todo, ocr_jobs = [], []
    for (iss, pg), fn in sorted(pages.items()):
        k = key(iss, pg)
        st = os.stat(os.path.join(SRC, fn))
        sig = [st.st_size, int(st.st_mtime)]
        have = all(os.path.exists(p) for p in (os.path.join(WEB, k + '.webp'), os.path.join(THUMB, k + '.webp')))
        have_ocr = os.path.exists(os.path.join(OCRDIR, k + '.json'))
        if cache.get(k, {}).get('sig') == sig and have and have_ocr:
            continue
        tmp = os.path.join(tmpdir, k + '.jpg')
        todo.append((fn, k, tmp))
        ocr_jobs.append((tmp, os.path.join(OCRDIR, k + '.json')))
        cache[k] = {'sig': sig}

    if todo:
        log(f'轉檔 {len(todo)} 個版面…')
        with ProcessPoolExecutor(max_workers=max(2, (os.cpu_count() or 4) - 1)) as ex:
            for i, (k, size) in enumerate(ex.map(convert, todo), 1):
                cache[k]['size'] = list(size)
                if i % 10 == 0:
                    log(f'  圖片 {i}/{len(todo)}')
        log('OCR 文字辨識…')
        run_ocr(ocr_jobs)
    else:
        log('沒有新的或變動的圖片，只重新產生資料檔。')

    # 移除已不存在的版面
    valid = {key(i, p) for (i, p) in pages}
    for k in list(cache):
        if k not in valid:
            cache.pop(k)
            for p in (os.path.join(WEB, k + '.webp'), os.path.join(THUMB, k + '.webp'), os.path.join(OCRDIR, k + '.json')):
                if os.path.exists(p):
                    os.remove(p)

    # 組合資料
    issues = {}
    text = {}
    for (iss, pg), fn in sorted(pages.items()):
        k = key(iss, pg)
        op = os.path.join(OCRDIR, k + '.json')
        info = {'year': None, 'month': None, 'sec': '', 'heads': [], 'L': []}
        if os.path.exists(op):
            try:
                info = parse_ocr(json.load(open(op, encoding='utf-8-sig')))
            except Exception as e:
                log('  解析失敗', k, e)
        it = issues.setdefault(iss, {'no': iss, 'pages': [], 'years': [], 'months': []})
        if info['year']:
            it['years'].append(info['year'])
        if info['month']:
            it['months'].append(info['month'])
        size = cache.get(k, {}).get('size') or [1728, 2400]
        it['pages'].append({'p': pg, 'k': k, 'src': fn, 'sec': info['sec'], 'heads': info['heads'],
                            'w': size[0], 'h': size[1]})
        text[k] = info['L']

    out = []
    for iss in sorted(issues):
        it = issues[iss]
        y = max(set(it['years']), key=it['years'].count) if it['years'] else None
        mo = max(set(it['months']), key=it['months'].count) if it['months'] else None
        m = meta.get(f'{iss:02d}', {})
        # 版名空白者以相鄰期同版補齊
        rec = {'no': iss, 'year': m.get('year', y), 'month': m.get('month', mo),
               'title': m.get('title', ''), 'note': m.get('note', ''), 'pages': it['pages']}
        out.append(rec)
    for idx, rec in enumerate(out):
        for pg in rec['pages']:
            if not pg['sec']:
                for d in (1, -1, 2, -2, 3, -3):
                    j = idx + d
                    if 0 <= j < len(out):
                        cand = [q['sec'] for q in out[j]['pages'] if q['p'] == pg['p'] and q['sec']]
                        if cand:
                            pg['sec'] = cand[0]
                            break
            if not pg['sec'] and pg['p'] > 4:   # 加頁（第5版以後）沿用前一版名
                prev = [q['sec'] for q in rec['pages'] if q['p'] == pg['p'] - 1]
                pg['sec'] = prev[0] if prev else '特別加頁'
    # 年份缺漏者以前後期推估（約每學期一期）
    for idx, rec in enumerate(out):
        if not rec['year']:
            prev = next((out[j] for j in range(idx - 1, -1, -1) if out[j]['year']), None)
            if prev:
                rec['year'] = prev['year'] + (1 if (prev['month'] or 1) >= 9 else 0)
                rec['guess'] = True

    os.makedirs(DATA, exist_ok=True)
    stamp = time.strftime('%Y-%m-%d %H:%M')
    with open(os.path.join(DATA, 'issues.js'), 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/build.py 自動產生，請勿手動修改；要改期別資訊請編輯 data/meta.json */\n')
        f.write('window.MGF_ISSUES = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write(f'window.MGF_BUILT = "{stamp}";\n')
    with open(os.path.join(DATA, 'text.js'), 'w', encoding='utf-8') as f:
        f.write('/* OCR 全文（自動產生）：[文字, x0, y0, x1, y1]，座標為千分比 */\n')
        f.write('window.MGF_TEXT = ' + json.dumps(text, ensure_ascii=False, separators=(',', ':')) + ';\n')
    if not os.path.exists(META):
        with open(META, 'w', encoding='utf-8') as f:
            json.dump({'_說明': '可在此覆寫某期資訊，例如 "45": {"year": 2027, "month": 1, "title": "畢業特刊", "note": ""}'},
                      f, ensure_ascii=False, indent=2)
    with open(CACHE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False)

    # 讓瀏覽器重新讀取資料
    idx_html = os.path.join(ROOT, 'index.html')
    if os.path.exists(idx_html):
        s = open(idx_html, encoding='utf-8').read()
        v = str(int(time.time()))
        s = re.sub(r'(data/(?:issues|text)\.js)\?v=\d+', r'\1?v=' + v, s)
        open(idx_html, 'w', encoding='utf-8').write(s)
    log(f'完成！{len(out)} 期、{len(pages)} 個版面，耗時 {time.time() - t0:.0f} 秒。')


if __name__ == '__main__':
    main()
