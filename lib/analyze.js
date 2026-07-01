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

const MODULE_TIERS = [4, 8, 16, 32, 64]; // 한 슬롯에 흔히 꽂는 모듈 용량(GB)
const DISK_TIERS = [256, 512, 1024, 2048, 4096];
function diskLabel(gb) {
  if (gb >= 1024) return (gb % 1024 === 0 ? gb / 1024 : round1(gb / 1024)) + 'TB';
  return gb + 'GB';
}

// 소켓(또는 CPU 이름) → 같은 소켓에서 갈 수 있는 상위 CPU 추천.
// 지식 기준 시점(2026-01)의 가이드이며, 구매 전 메인보드 호환/BIOS는 확인 필요.
const CPU_UPGRADE = [
  { re: /1700/i, socket: 'LGA1700',
    picks: '가성비 i5-13400F·i5-14600KF, 고성능 i7-14700F 등으로 메인보드 교체 없이 업그레이드 가능(BIOS 업데이트 필요할 수 있음).' },
  { re: /am5/i, socket: 'AM5',
    picks: 'Ryzen 7 7700 / 게임 최강 7800X3D / 작업용 Ryzen 9 7900 등. DDR5 전용 소켓.' },
  { re: /am4/i, socket: 'AM4',
    picks: '보드 교체 없이 가성비 Ryzen 5 5600, 게임 최강 5700X3D·5800X3D까지 업그레이드 가능(BIOS 업데이트 권장).' },
  { re: /1200/i, socket: 'LGA1200',
    picks: 'i5-11400F ~ i7-11700까지 같은 소켓. 그 이상 세대는 메인보드 교체 필요.' },
  { re: /1151/i, socket: 'LGA1151',
    picks: 'i7-9700 / i7-8700까지. 최신 세대로 가려면 CPU+보드+램 동시 교체 필요.' }
];

// ---- 램 업그레이드 플랜 ----
function buildRamPlan({ memLayout, baseboard, totalGB, needUpgrade, recommendedGB, memoryLevel }) {
  const mods = (memLayout || [])
    .filter(m => m.size > 0)
    .map(m => ({
      sizeGB: Math.round(m.size / GB),
      type: (m.type || '').toUpperCase(),
      speed: m.clockSpeed || null,
      form: m.formFactor || '',
      maker: (m.manufacturer || '').split(' ')[0]
    }));

  // ⚠️ baseboard.memSlots = SMBIOS의 "메모리 디바이스 항목 수"(Win32_PhysicalMemoryArray.MemoryDevices).
  // 이 값은 물리 슬롯이 아니라 칩셋이 지원하는 최대치를 적는 보드가 많아(2슬롯을 4로 보고 등) 신뢰할 수 없다.
  // 또 WMI로는 '꽂힌 모듈'만 읽히고 빈 슬롯은 못 센다. 그래서 이 값으로 빈 슬롯을 단정하지 않고,
  // 확실한 정보인 '장착된 모듈 수'만 기준으로 판단한다.
  const reportedSlots = baseboard && baseboard.memSlots ? baseboard.memSlots : 0;
  const populated = mods.length;
  const maxGB = baseboard && baseboard.memMax ? Math.round(baseboard.memMax / GB) : null;

  const type = mods[0] ? mods[0].type : null;
  const speed = mods.reduce((a, m) => Math.max(a, m.speed || 0), 0) || null;
  const spec = type ? (speed ? `${type}-${speed}` : type) : null; // 예: DDR4-3200
  const soldered = mods.some(m => /LPDDR/.test(m.type) || /SOC|ROW/i.test(m.form)) ||
    (reportedSlots === 0 && populated <= 1 && mods.every(m => /LPDDR/.test(m.type)));

  const bySize = {};
  mods.forEach(m => { bySize[m.sizeGB] = (bySize[m.sizeGB] || 0) + 1; });
  const config = Object.entries(bySize).map(([s, c]) => `${s}GB×${c}`).join(' + ') || `${totalGB}GB`;

  const addSize = mods[0] ? mods[0].sizeGB : 8;
  const perSlot = MODULE_TIERS.find(t => t >= Math.ceil(recommendedGB / 2)) || Math.ceil(recommendedGB / 2);
  const capNote = maxGB ? ` (이 메인보드 최대 지원은 ${maxGB}GB이니 그 이하로 맞추세요.)` : '';

  // 슬롯 수를 신뢰할 수 없으므로 UI에는 정확히 아는 '장착 개수'만 노출한다.
  let action, buy = null, reason, buyable = true, slotCaveat = false;

  if (!needUpgrade || memoryLevel === 'low') {
    action = '지금은 충분';
    reason = `현재 ${config}${spec ? ` (${spec})` : ''} 구성으로 여유가 있습니다. 당장 늘릴 필요는 없어요.`;
  } else if (soldered) {
    buyable = false;
    action = '교체 불가 (온보드)';
    reason = '메모리가 메인보드에 납땜(온보드)되어 있어 램만 따로 늘릴 수 없습니다. 노트북·일체형에 많은 구조로, 램이 부족하면 상위 램 모델로 기기 교체가 필요합니다.';
  } else if (populated <= 1) {
    // 스틱이 1개면 어떤 보드든 빈 슬롯이 최소 1개는 있음 → 추가를 확정 추천
    action = '빈 슬롯에 추가 (듀얼채널)';
    buy = `${spec || '기존과 동일 규격'} ${addSize}GB 1개 추가`;
    reason = `지금 램이 ${addSize}GB 1개만 꽂혀 있어요. 같은 ${spec || '규격/속도'} ${addSize}GB를 1개 더 꽂으면 ${addSize * 2}GB가 되고, 듀얼채널이라 속도까지 올라갑니다. 용량·속도만 맞으면 브랜드는 달라도 됩니다.${capNote}`;
  } else {
    // 이미 2개 이상 장착. 남은 슬롯 유무를 firmware 값으로 단정할 수 없으므로 조건부로 안내한다.
    action = '증설 또는 교체';
    buy = `빈 슬롯 있으면 ${spec || '동일 규격'} ${addSize}GB 추가 · 없으면 ${spec || '동일 규격'} ${perSlot}GB×2 키트로 교체`;
    reason = `이미 ${config}${spec ? ` (${spec})` : ''}로 듀얼채널 구성이에요. 남는 슬롯이 있으면 같은 규격 ${addSize}GB를 추가하고, 슬롯이 꽉 찼으면 ${spec || '같은 규격'} ${perSlot}GB 2개(키트)로 교체해 ${perSlot * 2}GB로 늘리세요.${capNote} 빈 슬롯 여부는 케이스를 열어보거나 CPU-Z로 확인하는 게 가장 정확합니다.`;
    slotCaveat = true;
  }

  return { config, populated, reportedSlots, spec, type, speed, maxGB, soldered, maker: mods[0] && mods[0].maker, action, buy, reason, buyable, slotCaveat };
}

// ---- CPU 업그레이드 플랜 ----
function buildCpuPlan(cpu, cpuLevel) {
  const brand = `${cpu.manufacturer || ''} ${cpu.brand || ''}`.trim();
  const socket = cpu.socket || '';
  const cores = cpu.physicalCores || cpu.cores || 0;
  const known = CPU_UPGRADE.find(c => c.re.test(socket) || c.re.test(brand));

  let action, buy = null, reason, buyable = true;

  if (/apple|^soc$/i.test(socket) || /^M\d/i.test(cpu.brand || '')) {
    buyable = false;
    action = '교체 불가 (SoC)';
    reason = 'CPU가 메인보드에 통합(SoC)되어 있어 CPU만 따로 교체할 수 없습니다.';
  } else if (cpuLevel === 'low' && cores >= 6) {
    action = '교체 불필요';
    reason = `현재 ${brand}${cores ? ` (${cores}코어)` : ''}로 CPU는 병목이 아닙니다. 지금 렉의 원인은 램/저장장치 쪽일 가능성이 큽니다.`;
    if (known) buy = `(당장은 불필요) ${known.picks}`;
  } else {
    action = cpuLevel === 'high' ? '업그레이드 권장' : '여유 있으면 업그레이드';
    if (known) {
      buy = known.picks;
      reason = `소켓 ${known.socket} 기준, 메인보드를 그대로 두고 CPU만 교체할 수 있는 선택지입니다.`;
    } else {
      buy = '같은 소켓의 상위 CPU로 교체하거나, 소켓이 오래됐다면 CPU+메인보드+램 동시 교체를 고려하세요.';
      reason = `소켓 정보(${socket || '미상'})만으로는 정확한 호환 CPU를 특정하기 어렵습니다. 메인보드 모델을 확인해 지원 CPU 목록을 보세요.`;
    }
  }

  return { brand, socket, cores, action, buy, reason, buyable };
}

// ---- 저장장치(SSD) 업그레이드 플랜 ----
function classifyDisk(d) {
  const t = (d.type || '').toLowerCase();
  const i = (d.interfaceType || '').toLowerCase();
  if (/nvme/.test(t) || /nvme|pcie/.test(i)) return 'NVMe SSD';
  if (/ssd/.test(t)) return 'SATA SSD';
  if (/hd/.test(t)) return 'HDD';
  return d.type || '알 수 없음';
}

function buildStoragePlan({ diskLayout, fsSize }) {
  const disks = (diskLayout || [])
    .map(d => ({ name: d.name || d.device, kind: classifyDisk(d), iface: d.interfaceType || '', sizeGB: Math.round((d.size || 0) / GB) }))
    .filter(d => d.sizeGB > 0);

  // 시스템 볼륨(윈도우 C:, 맥 /) 기준 여유공간
  const vols = (fsSize || []).filter(f => f.size && f.use != null && f.size > 20 * GB);
  const sys = vols.find(f => /^c:/i.test(f.mount)) || vols.find(f => f.mount === '/') ||
    vols.sort((a, b) => b.size - a.size)[0] || null;

  const primary = disks[0] || null;
  const usedPercent = sys ? Math.round(sys.use) : null;
  const totalGB = sys ? Math.round(sys.size / GB) : (primary ? primary.sizeGB : null);
  const freeGB = sys ? Math.round((sys.size - sys.used) / GB) : null;
  const usedGB = sys ? Math.round(sys.used / GB) : null;

  const lowSpace = usedPercent != null && (usedPercent >= 85 || (freeGB != null && freeGB < 25));
  const primaryIsHDD = primary && primary.kind === 'HDD';

  // 필요 용량 티어(사용량에 30% 여유)
  const targetGB = usedGB ? (DISK_TIERS.find(t => t >= usedGB / 0.7) || DISK_TIERS[DISK_TIERS.length - 1]) : 512;

  let action, buy = null, reason, level = 'low';

  if (primaryIsHDD) {
    level = 'high';
    action = 'SSD로 교체 강력 추천';
    buy = `NVMe M.2 SSD ${diskLabel(targetGB)} (M.2 슬롯 있을 때) 또는 2.5인치 SATA SSD ${diskLabel(targetGB)}`;
    reason = `시스템 디스크가 HDD입니다. 체감 속도를 가장 크게 올리는 1순위 업그레이드예요. 메인보드에 M.2 슬롯이 있으면 NVMe(SATA SSD보다 5~7배 빠름), 없으면 2.5인치 SATA SSD로 교체하세요.`;
  } else if (lowSpace) {
    level = 'high';
    action = '용량 부족 — 증설/교체';
    if (primary && primary.kind === 'NVMe SSD') {
      buy = `NVMe M.2 SSD ${diskLabel(targetGB)} 추가 또는 교체`;
      reason = `시스템 드라이브가 ${usedPercent}% 찼습니다(여유 ${freeGB}GB). 지금이 NVMe라 빈 M.2 슬롯이 있으면 ${diskLabel(targetGB)} NVMe를 추가하는 게 가장 깔끔합니다.`;
    } else if (primary && primary.kind === 'SATA SSD') {
      buy = `빈 M.2 슬롯 있으면 NVMe ${diskLabel(targetGB)}, 없으면 2.5인치 SATA SSD ${diskLabel(targetGB)} 추가`;
      reason = `시스템 드라이브가 ${usedPercent}% 찼습니다(여유 ${freeGB}GB). 속도까지 올리려면 M.2 NVMe 추가를, 슬롯이 없으면 2.5인치 SATA SSD를 추가하세요.`;
    } else {
      buy = `NVMe M.2 SSD ${diskLabel(targetGB)} 권장`;
      reason = `시스템 드라이브가 ${usedPercent}% 찼습니다(여유 ${freeGB}GB). 용량을 늘리세요.`;
    }
  } else {
    action = '저장장치는 충분';
    reason = usedPercent != null
      ? `시스템 드라이브 ${usedPercent}% 사용(여유 ${freeGB}GB), ${primary ? primary.kind : 'SSD'} 사용 중이라 지금은 문제없습니다.`
      : '저장장치 여유를 확인했습니다.';
  }

  return { disks, primaryKind: primary && primary.kind, usedPercent, totalGB, freeGB, usedGB, lowSpace, level, action, buy, reason };
}

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
  const { mem, cpu, load, processes, osInfo, memLayout, baseboard, diskLayout, fsSize } = raw;

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

  // ---- 하드웨어 업그레이드 플랜(구매 추천) ----
  const ramPlan = buildRamPlan({ memLayout, baseboard, totalGB, needUpgrade, recommendedGB, memoryLevel });
  const cpuPlan = buildCpuPlan(cpu, cpuLevel);
  const storagePlan = buildStoragePlan({ diskLayout, fsSize });

  return {
    when: new Date().toISOString(),
    os: osInfo ? `${osInfo.distro} ${osInfo.release}` : '',
    board: baseboard ? `${baseboard.manufacturer || ''} ${baseboard.model || ''}`.trim() : '',
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
    appCount: apps.length,
    ramPlan,
    cpuPlan,
    storagePlan
  };
}

module.exports = { analyze, recommendRam, normalizeName, RAM_TIERS };
