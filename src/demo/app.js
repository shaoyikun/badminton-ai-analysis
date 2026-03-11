const state = {
  action: 'clear',
  file: null,
};

const reports = {
  clear: {
    actionName: '正手高远球',
    total: 76,
    scores: [
      ['准备姿态', 82],
      ['引拍完整度', 73],
      ['转体转髋', 68],
      ['击球点', 71],
      ['跟随动作', 79],
      ['回位意识', 83],
    ],
    issues: [
      {
        title: '击球点偏晚',
        desc: '挥拍时机略慢，接触球点更靠近身体后侧，影响出球深度。',
        impact: '影响：高远球后场长度不足，容易被对手压制。',
      },
      {
        title: '转髋不足',
        desc: '上肢主导发力明显，下肢与躯干联动不够，发力链不完整。',
        impact: '影响：动作吃力、重复击球容易疲劳。',
      },
      {
        title: '非持拍手打开不够',
        desc: '准备阶段平衡不足，导致身体展开不充分。',
        impact: '影响：击球稳定性下降，落点控制变差。',
      },
    ],
    advice: [
      '做无球引拍 + 高点击球定点练习，每天 3 组，每组 15 次。',
      '加入转髋挥拍分解训练，重点感受“蹬地—转髋—带动手臂”的连续发力。',
      '练习时刻意抬起非持拍手做平衡，帮助身体充分展开。',
    ],
  },
  smash: {
    actionName: '杀球',
    total: 72,
    scores: [
      ['准备姿态', 78],
      ['引拍完整度', 75],
      ['转体转髋', 69],
      ['击球点', 66],
      ['跟随动作', 74],
      ['回位意识', 70],
    ],
    issues: [
      {
        title: '击球点不够高',
        desc: '起跳或伸展不足，导致接触点偏低，杀球角度不够陡。',
        impact: '影响：球速有，但压迫感不够，容易被对手防起。',
      },
      {
        title: '收拍后回位慢',
        desc: '动作结束后重心回收不够快，下一拍衔接偏慢。',
        impact: '影响：连续进攻能力下降。',
      },
      {
        title: '核心带动不足',
        desc: '肩臂发力比例过大，身体整体联动不够。',
        impact: '影响：力量输出不稳定，动作容易僵。',
      },
    ],
    advice: [
      '做原地高点击球影子训练，重点找“最高点出手”的感觉。',
      '把杀球后的第一步回位单独拉出来练，连续 10 组短节奏回位。',
      '加入核心旋转训练和半场多球杀上网衔接。',
    ],
  },
};

const actionButtons = document.querySelectorAll('.action-btn');
const videoInput = document.getElementById('videoInput');
const previewWrap = document.getElementById('previewWrap');
const videoPreview = document.getElementById('videoPreview');
const videoMeta = document.getElementById('videoMeta');
const analyzeBtn = document.getElementById('analyzeBtn');
const sampleBtn = document.getElementById('sampleBtn');
const loadingCard = document.getElementById('loadingCard');
const loadingText = document.getElementById('loadingText');
const report = document.getElementById('report');
const emptyState = document.getElementById('emptyState');

actionButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    actionButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.action = btn.dataset.action;
  });
});

videoInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  state.file = file;
  const url = URL.createObjectURL(file);
  videoPreview.src = url;
  previewWrap.classList.remove('hidden');
  videoMeta.textContent = `文件名：${file.name} · 大小：${(file.size / 1024 / 1024).toFixed(2)} MB`;
});

analyzeBtn.addEventListener('click', async () => {
  if (!state.file) {
    alert('先上传一段视频再分析，或者直接点“示例报告”。');
    return;
  }
  await runAnalysis();
});

sampleBtn.addEventListener('click', async () => {
  await runAnalysis();
});

async function runAnalysis() {
  emptyState.classList.add('hidden');
  report.classList.add('hidden');
  loadingCard.classList.remove('hidden');

  const steps = ['正在提取关键帧与动作特征', '正在匹配标准动作模板', '正在生成动作问题与训练建议'];
  for (const step of steps) {
    loadingText.textContent = step;
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  loadingCard.classList.add('hidden');
  renderReport(reports[state.action]);
}

function renderReport(data) {
  report.innerHTML = `
    <div class="score-card">
      <h3>${data.actionName} · 本次总评分</h3>
      <div class="score-grid">
        <div class="score-item"><span>总分</span><strong>${data.total}</strong></div>
        ${data.scores.map(([label, score]) => `<div class="score-item"><span>${label}</span><strong>${score}</strong></div>`).join('')}
      </div>
    </div>

    <div class="issue-card">
      <h3>Top 3 动作问题</h3>
      <div class="list">
        ${data.issues.map((item) => `
          <div>
            <div class="issue-title">${item.title}</div>
            <div>${item.desc}</div>
            <div class="issue-impact">${item.impact}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="advice-card">
      <h3>训练建议</h3>
      <div class="list">
        ${data.advice.map((item, index) => `<div><strong>建议 ${index + 1}：</strong>${item}</div>`).join('')}
      </div>
    </div>

    <div class="timeline">
      <h3>复测建议</h3>
      <ol>
        <li>按当前建议训练 3~7 天</li>
        <li>保持同一拍摄角度再录一次</li>
        <li>重点观察“击球点 / 转髋 / 回位”三个维度是否提升</li>
      </ol>
    </div>
  `;
  report.classList.remove('hidden');
}
