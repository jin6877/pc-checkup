const $ = (id) => document.getElementById(id);
const intro = $('intro');
const loading = $('loading');
const result = $('result');

$('startBtn').addEventListener('click', runScan);

async function runScan() {
  intro.classList.add('hidden');
  result.classList.add('hidden');
  loading.classList.remove('hidden');

  // 스피너가 잠깐이라도 보이게(체감상 "점검 중")
  const [data] = await Promise.all([
    window.api.scan(),
    new Promise((r) => setTimeout(r, 650))
  ]);

  loading.classList.add('hidden');
  render(data);
  result.classList.remove('hidden');
}

function levelKo(level) {
  return { high: '위험', medium: '주의', low: '양호' }[level] || level;
}

function render(d) {
  $('sysBadge').textContent = d.cpuBrand
    ? `${d.cpuBrand} · ${d.cores}코어 · ${d.memory.totalGB}GB`
    : `${d.cores}코어 · ${d.memory.totalGB}GB`;

  const m = d.memory;
  const gaugeCol = m.level === 'high' ? 'var(--red)' : m.level === 'medium' ? 'var(--amber)' : 'var(--green)';

  const recoHtml = m.needUpgrade
    ? `<div class="reco">
         <span class="from">${m.currentTier}GB</span>
         <span class="arrow">→</span>
         <span class="to">${m.recommendedGB}GB</span>
         <span class="to-label">추천</span>
       </div>`
    : `<div class="reco">
         <span class="to">${m.currentTier}GB</span>
         <span class="to-label">현재 사양으로 충분</span>
       </div>`;

  const appsHtml = d.topApps.map((a) => `
    <div class="app-row">
      <div class="app-emoji">${a.emoji}</div>
      <div>
        <div class="app-name">${escapeHtml(a.name)}</div>
        <div class="app-cat">${a.category}${a.procCount > 1 ? ` · ${a.procCount}개 프로세스` : ''}</div>
      </div>
      <div class="app-mem">
        <div class="num">${a.memGB} GB</div>
        <div class="bar"><i style="width:${Math.min(100, a.memPercent)}%"></i></div>
      </div>
    </div>`).join('');

  result.innerHTML = `
    <div class="verdict ${d.verdictTone}">
      <div class="v-label">종합 진단</div>
      <div class="v-text">${escapeHtml(d.verdict)}</div>
    </div>

    <h2 class="section-title">🛒 무엇을 사면 좋을까 <span>내 하드웨어 기준 맞춤 추천</span></h2>
    <div class="buy-grid">
      ${buyCard('🧠', '메모리 (램)', d.ramPlan)}
      ${buyCard('⚡', 'CPU', d.cpuPlan)}
      ${buyCard('💾', '저장장치 (SSD)', d.storagePlan)}
    </div>

    <h2 class="section-title">📊 지금 상태</h2>
    <div class="grid">
      <div class="card">
        <h3>메모리(램) <span class="pill ${m.level}">${levelKo(m.level)}</span></h3>
        <div class="gauge-wrap">
          <div class="gauge" style="--pct:${m.usedPercent}; --col:${gaugeCol}">
            <span>${m.usedPercent}%<small>사용 중</small></span>
          </div>
          <div class="gauge-meta">
            <div><b>${m.usedGB}GB</b> / ${m.totalGB}GB 사용</div>
            ${m.swapUsedGB >= 0.1 ? `<div>스왑 <b>${m.swapUsedGB}GB</b> (디스크 대체)</div>` : ''}
            <div>실행 앱 <b>${d.appCount}개</b> 감지</div>
          </div>
        </div>
        ${recoHtml}
        <div class="level-msg">${escapeHtml(m.message)}</div>
      </div>

      <div class="card">
        <h3>CPU <span class="pill ${d.cpu.level}">${levelKo(d.cpu.level)}</span></h3>
        <div class="gauge-wrap">
          <div class="gauge" style="--pct:${d.cpu.load}; --col:${d.cpu.level === 'high' ? 'var(--red)' : d.cpu.level === 'medium' ? 'var(--amber)' : 'var(--green)'}">
            <span>${d.cpu.load}%<small>사용 중</small></span>
          </div>
          <div class="gauge-meta">
            <div><b>${d.cores}코어</b></div>
            <div style="font-size:12px; margin-top:4px;">${escapeHtml(d.cpuBrand || '')}</div>
          </div>
        </div>
        <div class="level-msg">${escapeHtml(d.cpu.message)}</div>
      </div>
    </div>

    <div class="card">
      <h3>메모리를 많이 쓰는 프로그램 TOP ${d.topApps.length}</h3>
      <div class="applist">${appsHtml}</div>
    </div>

    <div class="footer-actions">
      <button class="btn-ghost" id="rescanBtn">🔄 다시 점검</button>
      <div class="timestamp">점검 시각: ${new Date(d.when).toLocaleString('ko-KR')}</div>
    </div>
  `;

  $('rescanBtn').addEventListener('click', runScan);
}

// 플랜 종류별 현재 상태 요약 줄
function planCurrent(title, p) {
  if (title.includes('램')) {
    const modTxt = p.populated ? ` · ${p.populated}개 장착` : '';
    const maxTxt = p.maxGB ? ` · 최대 ${p.maxGB}GB 지원` : '';
    return `${escapeHtml(p.config)}${p.spec ? ` (${escapeHtml(p.spec)})` : ''}${modTxt}${maxTxt}`;
  }
  if (title.includes('CPU')) {
    return `${escapeHtml(p.brand)}${p.cores ? ` · ${p.cores}코어` : ''}${p.socket ? ` · 소켓 ${escapeHtml(p.socket)}` : ''}`;
  }
  // 저장장치
  const list = (p.disks || []).map(dk => `${escapeHtml(dk.kind)} ${dk.sizeGB >= 1024 ? (dk.sizeGB/1024).toFixed(dk.sizeGB%1024?1:0)+'TB' : dk.sizeGB+'GB'}`).join(', ');
  const usage = p.usedPercent != null ? ` · ${p.usedPercent}% 사용(여유 ${p.freeGB}GB)` : '';
  return `${list || '디스크 정보'}${usage}`;
}

// 액션 배지 색상: 살 필요 있음(warn) / 불가(none) / 충분(ok)
function planTone(p) {
  if (p.buyable === false) return 'none';
  if (p.buy) return 'warn';
  return 'ok';
}

function buyCard(icon, title, p) {
  const tone = planTone(p);
  const buyHtml = p.buy
    ? `<div class="buy-box"><span class="buy-tag">이렇게 사세요</span><b>${escapeHtml(p.buy)}</b></div>`
    : '';
  return `
    <div class="buy-card ${tone}">
      <div class="buy-head">
        <span class="buy-icon">${icon}</span>
        <div>
          <div class="buy-title">${title}</div>
          <div class="buy-current">${planCurrent(title, p)}</div>
        </div>
        <span class="buy-action ${tone}">${escapeHtml(p.action)}</span>
      </div>
      ${buyHtml}
      <p class="buy-reason">${escapeHtml(p.reason)}</p>
      ${p.slotCaveat ? `<p class="buy-note">ℹ️ 총 슬롯 수는 Windows가 BIOS 기록값을 그대로 주는데, 실제 물리 슬롯보다 많게 나오는 보드가 흔해서 여기선 표시하지 않았어요.</p>` : ''}
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
