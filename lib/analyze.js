'use strict';

// 흔한 램 용량 티어(GB)
const RAM_TIERS = [4, 8, 16, 32, 64, 128];

// 프로세스 이름 → 카테고리 분류용 키워드
const CATEGORIES = [
  { key: 'browser',  label: '웹 브라우저',   emoji: '🌐', hint: '탭이 많을수록 램을 크게 먹어요',
    match: /chrome|whale|edge|firefox|safari|brave|opera|arc|vivaldi/i },
  { key: 'dev',      label: '개발 도구',     emoji: '🛠️', hint: 'IDE·컴파일러는 램/CPU를 많이 씁니다',
    match: /code|cursor|intellij|idea|pycharm|webstorm|xcode|android studio|docker|node|java|python|goland|clion|vscode|sublime|vim|electron/i },
  { key: 'design',   label: '디자인·영상',   emoji: '🎨', hint: '포토샵·프리미어 등은 램을 많이 씁니다',
    match: /photoshop|illustrator|premiere|after effects|figma|blender|davinci|final cut|lightroom|sketch/i },
  { key: 'chat',     label: '메신저·협업',   emoji: '💬', hint: '항상 떠 있으면서 조금씩 쌓입니다',
    match: /slack|discord|kakao|telegram|teams|zoom|notion|line|messenger/i },
  { key: 'media',    label: '미디어·게임',   emoji: '🎮', hint: '재생·게임 중엔 CPU/GPU를 씁니다',
    match: /spotify|vlc|music|steam|game|obs|youtube|netflix|potplayer/i },
  { key: 'office',   label: '문서·오피스',   emoji: '📄', hint: '',
    match: /word|excel|powerpoint|hangul|hwp|acrobat|pdf|office|onenote/i },
  { key: 'system',   label: '시스템·기타',   emoji: '⚙️', hint: '',
    match: /.*/ }
];

function categoryOf(name) {
  for (const c of CATEGORIES) if (c.match.test(name)) return c;
  return CATEGORIES[CATEGORIES.length - 1];
}

// "Google Chrome Helper (Renderer)" 같은 이름을 대표 앱 이름으로 정규화
function normalizeName(raw) {
  let n = String(raw || '').trim();
  n = n.replace(/\.(app|exe)$/i, '');
  n = n.replace(/\s*Helper.*$/i, '');          // Chrome Helper (GPU) 등
  n = n.replace(/\s*\(.*?\)\s*$/g, '');         // 괄호 꼬리표
  n = n.replace(/\s+(Renderer|GPU|Plugin|Crashpad|Update).*$/i, '');
  if (/chrome|chromium/i.test(n)) n = 'Google Chrome';
  if (/whale/i.test(n)) n = 'Naver Whale';
  if (/code|vscode/i.test(n) && !/xcode/i.test(n)) n = 'VS Code';
  if (/kakao/i.test(n)) n = 'KakaoTalk';
  if (/slack/i.test(n)) n = 'Slack';
  return n || String(raw);
}

const GB = 1024 * 1024 * 1024;
function toGB(bytes) { return bytes / GB; }
function round1(x) { return Math.round(x * 10) / 10; }

// 사용량에 여유(headroom)를 두고 알맞은 램 티어를 고른다.
// 목표: 실사용 램이 전체의 targetLoad(기본 65%) 밑에 들어오게.
function recommendRam(usedGB, currentGB, targetLoad = 0.65) {
  const need = usedGB / targetLoad;
  const tier = RAM_TIERS.find(t => t >= need) || RAM_TIERS[RAM_TIERS.length - 1];
  return Math.max(tier, currentGB); // 현재보다 낮게 추천하진 않음
}

/**
 * 원시 시스템 데이터를 받아 사람이 읽을 수 있는 진단 결과로 변환한다.
 * @param {object} raw { mem, cpu, load, processes, osInfo }
 */
function analyze(raw) {
  const { mem, cpu, load, processes, osInfo } = raw;

  const totalGB = toGB(mem.total);
  // active: 실제 사용 중(캐시 제외). 없으면 used로 폴백.
  const usedBytes = mem.active || mem.used || (mem.total - mem.available);
  const usedGB = toGB(usedBytes);
  const usedPercent = Math.min(100, (usedBytes / mem.total) * 100);
  const swapUsedGB = toGB(mem.swapused || 0);

  // 프로세스를 대표 앱 이름으로 묶기
  const groups = new Map();
  for (const p of (processes.list || [])) {
    const memBytes = (p.mem / 100) * mem.total; // p.mem = 전체 램 대비 %
    const name = normalizeName(p.name);
    const g = groups.get(name) || { name, memBytes: 0, cpu: 0, count: 0 };
    g.memBytes += memBytes;
    g.cpu += (p.cpu || 0);
    g.count += 1;
    groups.set(name, g);
  }

  const apps = [...groups.values()]
    .map(g => {
      const c = categoryOf(g.name);
      return {
        name: g.name,
        memGB: round1(toGB(g.memBytes)),
        memPercent: Math.round((g.memBytes / mem.total) * 100),
        cpu: Math.round(g.cpu),
        procCount: g.count,
        category: c.label,
        emoji: c.emoji
      };
    })
    .filter(a => a.memGB >= 0.05)
    .sort((a, b) => b.memGB - a.memGB);

  const topApps = apps.slice(0, 12);

  // 카테고리별 합계
  const byCategory = {};
  for (const a of apps) {
    byCategory[a.category] = byCategory[a.category] || { label: a.category, memGB: 0, count: 0, emoji: a.emoji };
    byCategory[a.category].memGB += a.memGB;
    byCategory[a.category].count += a.count || 1;
  }
  const categories = Object.values(byCategory)
    .map(c => ({ ...c, memGB: round1(c.memGB) }))
    .sort((a, b) => b.memGB - a.memGB);

  // ---- 메모리 압박 판정 ----
  let memoryLevel, memoryMsg;
  if (swapUsedGB >= 1 || usedPercent >= 90) {
    memoryLevel = 'high';
    memoryMsg = swapUsedGB >= 1
      ? `물리 램이 부족해 디스크(스왑) ${round1(swapUsedGB)}GB까지 끌어 쓰고 있어요. 이게 렉의 직접 원인일 가능성이 큽니다.`
      : '램 사용률이 90%를 넘겨 여유가 거의 없습니다. 프로그램을 하나만 더 켜도 버벅일 수 있어요.';
  } else if (usedPercent >= 75) {
    memoryLevel = 'medium';
    memoryMsg = '램 사용률이 높은 편입니다. 지금은 버티지만 무거운 작업이 겹치면 느려질 수 있어요.';
  } else {
    memoryLevel = 'low';
    memoryMsg = '램에는 아직 여유가 있습니다.';
  }

  const currentTier = RAM_TIERS.find(t => t >= totalGB - 0.5) || Math.round(totalGB);
  const recommendedGB = recommendRam(usedGB, currentTier);
  const needUpgrade = recommendedGB > currentTier;

  // ---- CPU 판정 ----
  const cores = cpu.physicalCores || cpu.cores || 1;
  const cpuLoad = load.currentLoad || 0; // 전체 코어 대비 %
  let cpuLevel, cpuMsg;
  if (cpuLoad >= 85) {
    cpuLevel = 'high';
    cpuMsg = `CPU 사용률이 ${Math.round(cpuLoad)}%로 매우 높습니다. 지금 켜둔 작업엔 CPU도 부담을 받고 있어요.`;
  } else if (cpuLoad >= 55) {
    cpuLevel = 'medium';
    cpuMsg = `CPU 사용률 ${Math.round(cpuLoad)}%. 여유는 있지만 종종 바쁩니다.`;
  } else {
    cpuLevel = 'low';
    cpuMsg = `CPU 사용률 ${Math.round(cpuLoad)}%로 여유롭습니다. 렉의 원인은 CPU가 아닐 가능성이 큽니다.`;
  }

  // ---- 최종 한 줄 조언 ----
  let verdict, verdictTone;
  if (needUpgrade && memoryLevel !== 'low') {
    verdict = `지금 사용 패턴이면 램을 ${recommendedGB}GB로 늘리는 걸 추천해요. (현재 ${currentTier}GB)`;
    verdictTone = 'warn';
  } else if (memoryLevel === 'medium') {
    verdict = `당장 업그레이드가 필수는 아니지만, 안 쓰는 프로그램을 정리하면 한결 쾌적해집니다. (여유를 원하면 ${recommendedGB}GB)`;
    verdictTone = 'watch';
  } else {
    verdict = `현재 ${currentTier}GB로 지금 작업에는 충분합니다. 렉이 있다면 특정 무거운 앱이나 저장장치(SSD)를 의심해 보세요.`;
    verdictTone = 'ok';
  }

  return {
    when: new Date().toISOString(),
    os: osInfo ? `${osInfo.distro} ${osInfo.release}` : '',
    cpuBrand: `${cpu.manufacturer || ''} ${cpu.brand || ''}`.trim(),
    cores,
    memory: {
      totalGB: round1(totalGB),
      usedGB: round1(usedGB),
      usedPercent: Math.round(usedPercent),
      swapUsedGB: round1(swapUsedGB),
      currentTier,
      recommendedGB,
      needUpgrade,
      level: memoryLevel,
      message: memoryMsg
    },
    cpu: { load: Math.round(cpuLoad), level: cpuLevel, message: cpuMsg },
    verdict,
    verdictTone,
    topApps,
    categories,
    appCount: apps.length
  };
}

module.exports = { analyze, recommendRam, normalizeName, RAM_TIERS };
