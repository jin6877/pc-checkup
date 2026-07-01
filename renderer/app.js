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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
