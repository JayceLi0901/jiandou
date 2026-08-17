/* 鉴豆 · 识别引擎
   本地：Tesseract.js（资源自托管，离线可用）
   云端：OpenAI 兼容视觉模型（设置页填 Key 后启用，预留）
   解析：本地 OCR 文本 → 规则提取结构化字段 */

let tesseractLoading = null;

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = './vendor/tesseract/tesseract.min.js';
    s.onload = () => res(window.Tesseract);
    s.onerror = () => { tesseractLoading = null; rej(new Error('OCR 引擎加载失败（首次使用需联网缓存一次）')); };
    document.head.appendChild(s);
  });
  return tesseractLoading;
}

const PROGRESS_CN = {
  'loading tesseract core': '加载识别核心…',
  'initializing tesseract': '初始化引擎…',
  'loading language traineddata': '下载中文语言包（仅首次，约十几 MB）…',
  'initializing api': '准备就绪…',
  'recognizing text': '正在识别标签…',
};

export async function recognizeLocal(file, onStatus) {
  const T = await loadTesseract();
  const worker = await T.createWorker('chi_sim+eng', 1, {
    workerPath: './vendor/tesseract/worker.min.js',
    corePath: './vendor/tesseract/core',
    langPath: './vendor/tesseract/lang',
    logger: (m) => {
      if (m.status && onStatus) onStatus(PROGRESS_CN[m.status] || m.status, m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text || '';
  } finally {
    try { await worker.terminate(); } catch (_) {}
  }
}

/* ---------- 云端视觉大模型（预留） ---------- */
export async function recognizeCloud(file, cfg, onStatus) {
  onStatus && onStatus('云端 AI 识别中…', null);
  const b64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const endpoint = cfg.apiBase.replace(/\/+$/, '') + '/chat/completions';
  const prompt = `你是咖啡豆包装标签识别助手。请仔细看这张咖啡豆包装袋照片，提取以下信息，以严格 JSON 输出（不要 markdown 代码块，识别不到的字段填 null，绝不编造）：{"name":"产品名","roaster":"烘焙商","origin":"产地(国家·产区)","estate":"庄园/处理厂","variety":"豆种","process":"处理法","roastDate":"YYYY-MM-DD 或 null","flavors":"风味描述","totalWeight":克重数字或null}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } },
          { type: 'text', text: prompt },
        ],
      }],
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error('云端识别请求失败：HTTP ' + res.status);
  const j = await res.json();
  let content = j?.choices?.[0]?.message?.content || '';
  content = content.replace(/```(json)?/g, '').trim();
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('云端返回无法解析');
  return JSON.parse(m[0]);
}

/* ---------- 总入口 ---------- */
export async function recognize(file, engineCfg, onStatus) {
  if (engineCfg.engine === 'cloud' && engineCfg.apiKey) {
    try {
      return await recognizeCloud(file, engineCfg, onStatus);
    } catch (e) {
    if (onStatus) onStatus('云端失败，已回退本地：' + e.message, null);
    }
  }
  const text = await recognizeLocal(file, onStatus);
  return parseLabel(text);
}

/* ================= 本地规则解析 ================= */
const PROCESS_KW = [
  ['二氧化碳浸渍法', '二氧化碳浸渍'], ['二氧化碳浸渍', '二氧化碳浸渍'], ['厌氧日晒', '厌氧日晒'],
  ['厌氧水洗', '厌氧水洗'], ['厌氧发酵', '厌氧发酵'], ['厌氧', '厌氧发酵'], ['酒桶发酵', '酒桶发酵'],
  ['红酒处理', '红酒处理'], ['蜜处理', '蜜处理'], ['日晒', '日晒'], ['水洗', '水洗'],
  ['湿刨法', '湿刨法'], ['湿刨', '湿刨法'], ['半水洗', '半水洗'],
  ['Anaerobic', '厌氧发酵'], ['Washed', '水洗'], ['Natural', '日晒'], ['Honey', '蜜处理'],
];

const VARIETY_KW = [
  '尖身波旁', '黄色波旁', '红波旁', '紫叶波旁', '帕卡马拉', '马拉戈吉佩', '瑰夏村', '卡杜拉',
  '卡杜艾', '铁皮卡', '蒂皮卡', '提吡卡', '波旁', '瑰夏', '帕卡斯', '新世界', '摩卡', '象豆',
  '原生种', 'SL28', 'SL34', '74110', '74112', '74158', '74165', 'Ruiru 11', 'Batian',
  'Geisha', 'Gesha', 'Typica', 'Bourbon', 'Caturra', 'Catuai', 'Pacamara', 'Pacas',
  'Mundo Novo', 'Maragogype', 'Heirloom', 'Parainema', 'Java', 'Sidra', 'Wush Wush', 'Laurina',
];

const ORIGIN_KW = [
  '埃塞俄比亚', '埃塞', '耶加雪菲', '科契尔', '西达摩', '古吉', '夏奇索', '罕贝拉', '班莎', '耶茄雪菲',
  '肯尼亚', '尼耶里', '恩布', '卢旺达', '布隆迪', '乌干达', '坦桑尼亚', '赞比亚',
  '哥伦比亚', '慧兰', '薇拉', '娜玲珑', '考卡', '托利马', '纳里尼奥', '金迪奥',
  '巴拿马', '波奎特', '危地马拉', '安提瓜', '薇薇特南果', '哥斯达黎加', '塔拉珠', '中央谷地',
  '墨西哥', '恰帕斯', '秘鲁', '卡哈马卡', '巴西', '喜拉多', '摩吉安纳', '米纳斯',
  '洪都拉斯', '马里卡拉', '萨尔瓦多', '尼加拉瓜', '厄瓜多尔', '玻利维亚', '委内瑞拉',
  '印度尼西亚', '印尼', '苏门答腊', '林东', '曼特宁', '托拿加', '苏拉威西', '爪哇',
  '巴布亚新几内亚', '印度', '马拉巴', '也门', '夏威夷', '柯纳', '台湾', '阿里山',
  '中国', '云南', '保山', '普洱', '临沧', '德宏',
  'Ethiopia', 'Yirgacheffe', 'Sidamo', 'Guji', 'Kenya', 'Rwanda', 'Burundi', 'Colombia', 'Huila',
  'Panama', 'Boquete', 'Guatemala', 'Antigua', 'Costa Rica', 'Tarrazu', 'Brazil', 'Cerrado',
  'Indonesia', 'Sumatra', 'Java', 'Yemen', 'Hawaii', 'Kona', 'Mexico', 'Peru', 'Honduras',
  'El Salvador', 'Nicaragua', 'Ecuador', 'Papua New Guinea', 'India', 'China', 'Yunnan',
];

const FLAVOR_KW = [
  '茉莉', '玫瑰', '橙花', '薰衣草', '花香', '柑橘', '柠檬', '青柠', '葡萄柚', '柚子', '橙子', '血橙', '陈皮',
  '莓果', '草莓', '蓝莓', '黑莓', '树莓', '覆盆子', '樱桃', '水蜜桃', '桃子', '油桃', '杏桃', '李子',
  '百香果', '热带水果', '菠萝', '芒果', '荔枝', '龙眼', '苹果', '青苹果', '梨', '葡萄', '黑醋栗', '红醋栗',
  '椰子', '香蕉', '哈密瓜', '蜜瓜', '香瓜', '无花果', '西梅', '乌梅', '话梅',
  '巧克力', '黑巧克力', '牛奶巧克力', '可可', '焦糖', '太妃糖', '蜂蜜', '枫糖', '红糖', '黑糖',
  '香草', '奶油', '黄油', '米浆', '大米', '清酒', '米酒',
  '坚果', '杏仁', '榛果', '花生', '核桃', '腰果', '核桃仁',
  '红茶', '绿茶', '乌龙', '高山茶', '茶感', '茶香',
  '威士忌', '白兰地', '朗姆', '酒香', '发酵香', '朗姆酒',
  '肉桂', '丁香', '胡椒', '辛香', '烟草', '皮革', '谷物', '麦芽',
];

function normalizeText(t) {
  return String(t || '')
    .replace(/：/g, ':')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[ \t]+/g, ' ');
}

function matchAfterKeyword(lines, compactLines, re) {
  for (const arr of [lines, compactLines]) {
    for (const line of arr) {
      const m = re.exec(line);
      if (m && m[1]) return m[1].trim().replace(/^[·\-—–|,，。:：\s]+|[·\-—–|,，。:：\s]+$/g, '');
    }
  }
  return null;
}

/* 去掉中文字符之间的 OCR 空格（治 光 师 → 治光师），先行断言支持连续匹配 */
function stripCJKSpaces(s) {
  return String(s).replace(/([一-鿿])\s+(?=[一-鿿])/g, '$1');
}

function normDate(s) {
  if (!s) return null;
  const m = /(\d{4})\s*[.\/年\-]\s*(\d{1,2})\s*[.\/月\-]\s*(\d{1,2})/.exec(String(s));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function findDate(text) {
  const re = /(\d{4})\s*[.\/年\-]\s*(\d{1,2})\s*[.\/月\-]\s*(\d{1,2})\s*日?/g;
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y >= 2020 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      found.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }
  if (!found.length) return null;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const past = found.filter((d) => d <= today && d >= '2022-01-01');
  if (past.length) return past.sort()[0]; // 多个日期取最早的过去日期（生产/烘焙在前，保质期在后）
  return found[0];
}

export function parseLabel(rawText) {
  const text = normalizeText(rawText);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const compactLines = lines.map((l) => l.replace(/\s+/g, ''));
  const compactText = compactLines.join('');
  const out = {
    name: null, roaster: null, origin: null, estate: null, variety: null,
    process: null, roastDate: null, flavors: null, totalWeight: null,
  };
  if (!text) return out;

  /* 烘焙/生产日期 */
  out.roastDate = normDate(matchAfterKeyword(lines, compactLines, /(?:烘焙|生产|焙烧|烘焙日|roast\w*\s*date|pack\w*)\s*(?:日期|时间|日)?\s*[:：]?\s*(\d{4}\s*[.\/年\-]\s*\d{1,2}\s*[.\/月\-]\s*\d{1,2})/i))
    || findDate(text);

  /* 克重 */
  const weights = [];
  const wre = /(\d{2,4}(?:\.\d+)?)\s*(?:g|G|克|公克|g装)/g;
  let wm;
  while ((wm = wre.exec(compactText))) {
    const v = parseFloat(wm[1]);
    if (v >= 30 && v <= 5000) weights.push(v);
  }
  if (weights.length) out.totalWeight = Math.max(...weights);

  /* 处理法（长词优先，紧凑文本匹配对抗 OCR 空格） */
  for (const [kw, std] of PROCESS_KW) {
    if (compactText.includes(kw)) { out.process = std; break; }
  }

  /* 豆种（长词优先） */
  const vSorted = [...VARIETY_KW].sort((a, b) => b.length - a.length);
  for (const v of vSorted) {
    if (compactText.toLowerCase().includes(v.toLowerCase())) { out.variety = v; break; }
  }

  /* 产地：先找“产地/产区”前缀，否则按关键词定位整行片段 */
  out.origin = matchAfterKeyword(lines, compactLines, /(?:产地|产区|产国|origin|single origin)[:：]?(.{2,24})/i);
  if (!out.origin) {
    for (const cl of compactLines) {
      const low = cl.toLowerCase();
      const hit = ORIGIN_KW.find((k) => low.includes(k.toLowerCase()));
      if (hit) {
        const idx = low.indexOf(hit.toLowerCase());
        const seg = cl.slice(idx, idx + 24).replace(/[|,，、;；].*$/, '');
        out.origin = seg;
        break;
      }
    }
  }

  /* 庄园 */
  out.estate = matchAfterKeyword(lines, compactLines, /(?:庄园|农场|合作社|处理厂|estate|farm|finca|hacienda)[:：]?(.{2,24})/i);

  /* 烘焙商：前缀 → 首行 */
  out.roaster = matchAfterKeyword(lines, compactLines, /(?:烘焙商|烘焙者|烘焙师|roasted\s*by|roaster)[:：]?(.{2,24})/i);
  if (!out.roaster) {
    const first = lines.find((l) => l.replace(/\s/g, '').length >= 2 && l.replace(/\s/g, '').length <= 18 && !/\d{4}/.test(l));
    if (first) out.roaster = first;
  }

  /* 风味：前缀 → 关键词收集 */
  out.flavors = matchAfterKeyword(lines, compactLines, /(?:风味描述|风味特征|风味|flavor notes|tasting notes|cupping notes|flavor)[:：]?(.{3,80})/i);
  if (!out.flavors) {
    const hits = FLAVOR_KW.filter((k) => compactText.includes(k));
    if (hits.length) out.flavors = [...new Set(hits)].slice(0, 8).join('、');
  }

  /* 名称：前缀 → 产地+豆种 → 首行 */
  out.name = matchAfterKeyword(lines, compactLines, /(?:品名|名称|豆名|product name|name)[:：]?(.{2,30})/i);
  if (!out.name && out.origin && out.variety) out.name = `${out.origin} ${out.variety}`;
  if (!out.name) out.name = lines[0]?.slice(0, 24) || null;

  /* 清洗：去中文间空格 + 收尾 */
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'string') {
      out[k] = stripCJKSpaces(out[k]).replace(/\s{2,}/g, ' ').trim() || null;
    }
  }
  return out;
}
