(function () {
  const BANK = window.QUESTION_BANK;
  const Core = window.QuizCore;
  const STORAGE_KEY = "party-quiz-practice-v1";
  const app = document.getElementById("app");
  const nav = document.getElementById("main-nav");
  const sidebar = document.querySelector(".sidebar");
  const TYPE_LABEL = { single: "单项选择", multiple: "多项选择", risk: "风险简答" };
  const RESULT_LABEL = { correct: "正确", basic: "基本正确", wrong: "错误" };
  const ROUND_LABEL = { required: "必答题", quick: "抢答题", risk: "风险题", overtime: "加赛题" };

  let state = loadState();
  let session = null;
  let simulation = null;
  let timerId = null;
  let toastId = null;

  function defaultState() {
    return { version: 1, questions: {}, resume: null, simulations: [] };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return parsed && parsed.version === 1 ? { ...defaultState(), ...parsed } : defaultState();
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Some browsers restrict storage for file:// pages; practice remains usable in-memory.
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function toast(message) {
    const element = document.getElementById("toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toastId);
    toastId = setTimeout(() => element.classList.remove("show"), 2200);
  }

  function setActive(view) {
    nav.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    sidebar.classList.remove("open");
    window.scrollTo(0, 0);
  }

  function statsFor(ids = BANK.map((question) => question.id)) {
    const entries = ids.map((id) => state.questions[id]).filter(Boolean);
    const attempts = entries.reduce((sum, item) => sum + item.attempts, 0);
    const correct = entries.reduce((sum, item) => sum + item.correct, 0);
    return {
      covered: entries.filter((item) => item.attempts > 0).length,
      attempts,
      correct,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    };
  }

  function questionIds(type) {
    return BANK.filter((question) => !type || question.type === type).map((question) => question.id);
  }

  function wrongIds() {
    return BANK.filter((question) => {
      const item = state.questions[question.id];
      return item && item.lastResult !== "correct";
    }).map((question) => question.id);
  }

  function recordAnswer(question, result) {
    const current = state.questions[question.id] || { attempts: 0, correct: 0 };
    current.attempts += 1;
    if (result === "correct") current.correct += 1;
    current.lastResult = result;
    current.lastAt = new Date().toISOString();
    state.questions[question.id] = current;
    saveState();
  }

  function reviseLast(question, previous, next) {
    const current = state.questions[question.id];
    if (!current || previous === next) return;
    if (previous === "correct") current.correct = Math.max(0, current.correct - 1);
    if (next === "correct") current.correct += 1;
    current.lastResult = next;
    current.lastAt = new Date().toISOString();
    saveState();
  }

  function page(title, subtitle, content, eyebrow = "赛前练习") {
    app.innerHTML = `
      <section class="page">
        <div class="page-head">
          <div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subtle">${subtitle}</p></div>
        </div>
        ${content}
      </section>`;
    app.focus({ preventScroll: true });
  }

  function renderDashboard() {
    clearTimer();
    setActive("dashboard");
    const total = statsFor();
    const wrong = wrongIds().length;
    const resume = state.resume && state.resume.ids?.length;
    const byType = ["single", "multiple", "risk"].map((type) => [type, statsFor(questionIds(type))]);
    page(
      "学思践悟强党性",
      "完整覆盖知识竞赛题库，通过反复练习掌握题目，并用准确率检验学习效果。",
      `
      <div class="hero">
        <p class="eyebrow" style="color:#ffd1cc">天津市第五中心医院第二届党建知识竞赛</p>
        <h1>赛前充分练习，熟悉全部 301 道题</h1>
        <p>支持顺序练习、随机抽题、错题巩固、风险题关键词判分，以及按照通知规则进行必答、抢答、风险题模拟。</p>
        <div class="hero-actions">
          <button class="primary" data-start="sequence">${resume ? "继续上次练习" : "开始顺序练习"}</button>
          <button class="secondary" data-open="random">随机抽题</button>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><span>题库覆盖</span><strong>${total.covered} / 301</strong><div class="progress"><span style="width:${Math.round(total.covered / 301 * 100)}%"></span></div></div>
        <div class="stat-card"><span>累计答题</span><strong>${total.attempts}</strong><small>每次判分均计入</small></div>
        <div class="stat-card"><span>总准确率</span><strong>${total.accuracy}%</strong><small>正确次数 ÷ 已判分次数</small></div>
        <div class="stat-card"><span>当前错题</span><strong>${wrong}</strong><small>最近一次结果非正确</small></div>
      </div>
      <div class="card-grid">
        ${byType.map(([type, data]) => `
          <article class="card action-card">
            <span class="tag">${TYPE_LABEL[type]}</span>
            <h2>${data.accuracy}% 准确率</h2>
            <p>已练 ${data.covered} / ${questionIds(type).length} 题，累计作答 ${data.attempts} 次。</p>
            <button class="ghost" data-practice-type="${type}">专项练习</button>
          </article>`).join("")}
      </div>`,
    );
  }

  function renderRandomSetup() {
    clearTimer();
    setActive("random");
    page(
      "随机练习",
      "按题型和题量随机组题，单次练习不重复抽取。",
      `<div class="card">
        <div class="form-grid">
          <div class="field"><label for="random-type">题型范围</label>
            <select id="random-type"><option value="">全部题型</option><option value="single">单项选择</option><option value="multiple">多项选择</option><option value="risk">风险简答</option></select>
          </div>
          <div class="field"><label for="random-count">抽题数量</label>
            <input id="random-count" type="number" min="1" max="301" value="20" />
          </div>
        </div>
        <div class="button-row" style="margin-top:22px"><button class="primary" id="start-random">开始随机练习</button></div>
      </div>`,
    );
  }

  function startPractice(kind, ids, title) {
    clearTimer();
    simulation = null;
    if (!ids.length) {
      page(title, "", `<div class="card empty"><strong>暂时没有可练习的题目</strong><p class="subtle">完成题目后，答错或基本正确的题目会进入错题复习。</p><button class="primary" data-start="sequence">开始顺序练习</button></div>`);
      return;
    }
    session = { kind, ids, title, index: 0, answered: false, result: null, selected: [], response: "" };
    if (kind === "sequence" && state.resume?.kind === "sequence") {
      session.index = Math.min(state.resume.index || 0, ids.length - 1);
    }
    saveResume();
    renderQuestion();
  }

  function saveResume() {
    if (!session || session.kind !== "sequence") return;
    state.resume = { kind: session.kind, ids: session.ids, index: session.index, title: session.title };
    saveState();
  }

  function currentQuestion() {
    return BANK.find((question) => question.id === session.ids[session.index]);
  }

  function optionsHtml(question, disabled = false) {
    const inputType = question.type === "multiple" ? "checkbox" : "radio";
    return `<div class="options">${question.options.map((option) => `
      <label class="option">
        <input type="${inputType}" name="answer" value="${option.key}" ${disabled ? "disabled" : ""} />
        <span class="option-key">${option.key}.</span>
        <span>${escapeHtml(option.text)}</span>
      </label>`).join("")}</div>`;
  }

  function questionShell(question, body, sideExtra = "") {
    const progress = Math.round(((session.index + 1) / session.ids.length) * 100);
    return `
      <section class="page">
        <div class="page-head">
          <div><p class="eyebrow">练习进行中</p><h1>${escapeHtml(session.title)}</h1><p class="subtle">第 ${session.index + 1} 题，共 ${session.ids.length} 题</p></div>
          <button class="ghost" data-view="dashboard">退出练习</button>
        </div>
        <div class="practice-layout">
          <article class="card question-card">
            <div class="question-meta">
              <span class="tag">${TYPE_LABEL[question.type]}</span>
              <span class="pill">原题号 ${question.originalNumber}</span>
              ${question.points ? `<span class="pill orange">${question.points} 分风险题</span>` : ""}
            </div>
            <h2 class="question-title">${escapeHtml(question.prompt)}</h2>
            ${body}
          </article>
          <aside class="card side-panel">
            <span class="subtle">练习进度</span><strong>${progress}%</strong>
            <div class="progress"><span style="width:${progress}%"></span></div>
            <dl>
              <dt>当前题号</dt><dd>${session.index + 1} / ${session.ids.length}</dd>
              <dt>本题历史练习</dt><dd>${state.questions[question.id]?.attempts || 0} 次</dd>
              <dt>当前错题总数</dt><dd>${wrongIds().length} 题</dd>
            </dl>
            ${sideExtra}
          </aside>
        </div>
      </section>`;
  }

  function renderQuestion() {
    clearTimer();
    const question = currentQuestion();
    session.answered = false;
    session.result = null;
    session.selected = [];
    session.response = "";
    const answerArea = question.type === "risk"
      ? `<textarea id="risk-answer" placeholder="请输入你的答案。提交后系统将按关键词覆盖率辅助判分。"></textarea>`
      : optionsHtml(question);
    app.innerHTML = questionShell(question, `${answerArea}<div class="button-row"><button class="primary" id="submit-answer">提交答案</button><button class="ghost" id="skip-question">暂时跳过</button></div>`);
    setActive("");
    app.focus({ preventScroll: true });
  }

  function selectedAnswers() {
    return [...app.querySelectorAll('input[name="answer"]:checked')].map((input) => input.value);
  }

  function submitPracticeAnswer() {
    const question = currentQuestion();
    let result;
    let detail = null;
    if (question.type === "risk") {
      const response = document.getElementById("risk-answer").value.trim();
      if (!response) return toast("请先输入答案");
      session.response = response;
      detail = Core.gradeRisk(question, response);
      result = detail.result;
    } else {
      const selected = selectedAnswers();
      if (!selected.length) return toast("请先选择答案");
      session.selected = selected;
      result = Core.gradeSelection(question, selected);
    }
    session.answered = true;
    session.result = result;
    recordAnswer(question, result);
    renderPracticeResult(question, result, detail);
  }

  function resultCard(question, result, detail, manual = false) {
    const title = result === "correct" ? "回答正确" : result === "basic" ? "基本正确" : "回答错误";
    const keywords = detail ? `
      <p><strong>关键词覆盖率：</strong>${Math.round(detail.ratio * 100)}%</p>
      <p><strong>已匹配：</strong></p><div class="keyword-list">${detail.matched.map((item) => `<span>${escapeHtml(item)}</span>`).join("") || "<span>暂无</span>"}</div>
      <p style="margin-top:12px"><strong>未匹配：</strong></p><div class="keyword-list">${detail.missing.map((item) => `<span>${escapeHtml(item)}</span>`).join("") || "<span>无</span>"}</div>` : "";
    const controls = manual ? `
      <p style="margin-top:14px"><strong>人工修正判定：</strong></p>
      <div class="button-row">
        <button class="ghost manual-grade" data-result="correct">判为正确</button>
        <button class="ghost manual-grade" data-result="basic">判为基本正确</button>
        <button class="ghost manual-grade" data-result="wrong">判为错误</button>
      </div>` : "";
    return `<div class="result ${result}"><h3>${title}</h3>${keywords}<p><strong>标准答案：</strong></p><div class="answer-text">${escapeHtml(question.answer)}</div>${controls}</div>`;
  }

  function renderPracticeResult(question, result, detail) {
    const body = question.type === "risk"
      ? `<textarea disabled>${escapeHtml(session.response)}</textarea>`
      : optionsHtml(question, true);
    app.innerHTML = questionShell(question, `${body}${resultCard(question, result, detail, question.type === "risk")}<div class="button-row"><button class="primary" id="next-question">${session.index + 1 === session.ids.length ? "完成练习" : "下一题"}</button></div>`);
    app.querySelectorAll('input[name="answer"]').forEach((input) => {
      if (session.selected.includes(input.value)) {
        input.checked = true;
        input.closest(".option").classList.add("selected");
      }
    });
  }

  function nextPracticeQuestion() {
    if (session.index + 1 >= session.ids.length) {
      state.resume = null;
      saveState();
      renderPracticeSummary();
      return;
    }
    session.index += 1;
    saveResume();
    renderQuestion();
  }

  function renderPracticeSummary() {
    const data = statsFor(session.ids);
    page(
      "本轮练习完成",
      `${session.title}已完成，可以继续巩固错题或开启新一轮训练。`,
      `<div class="stats-grid">
        <div class="stat-card"><span>本组题量</span><strong>${session.ids.length}</strong></div>
        <div class="stat-card"><span>已练覆盖</span><strong>${data.covered}</strong></div>
        <div class="stat-card"><span>累计准确率</span><strong>${data.accuracy}%</strong></div>
        <div class="stat-card"><span>当前错题</span><strong>${wrongIds().length}</strong></div>
      </div>
      <div class="button-row"><button class="primary" data-action="wrong">复习错题</button><button class="ghost" data-view="dashboard">返回概览</button></div>`,
    );
  }

  function renderSimulationSetup() {
    clearTimer();
    setActive("simulation");
    page(
      "赛制模拟",
      "按照通知中的统一规则进行个人模拟，实时计时与计分。",
      `<div class="card">
        <div class="form-grid">
          <div class="field"><label for="quick-count">抢答题数量</label><input id="quick-count" type="number" min="1" max="50" value="10" /></div>
          <div class="field"><label for="simulation-mode">模拟模式</label>
            <select id="simulation-mode"><option value="full">正式模拟：必答 + 抢答 + 风险</option><option value="overtime">加赛题专项练习</option></select>
          </div>
        </div>
        <div class="button-row" style="margin-top:22px"><button class="primary" id="start-simulation">开始模拟</button></div>
      </div>
      <div class="card" style="margin-top:18px">
        <h2>计分规则</h2>
        <ul class="rule-list">
          <li>初始分值 100 分；必答题答对加 10 分，答错或超时不扣分。</li>
          <li>抢答题与加赛题答对加 10 分，答错、答题不完整或超时扣 10 分。</li>
          <li>风险题可选择 10、20、30 分或放弃，答错、答案不完整或超时扣对应分值。</li>
        </ul>
      </div>`,
    );
  }

  function startSimulation() {
    session = null;
    const quickCount = Math.max(1, Math.min(50, Number(document.getElementById("quick-count").value) || 10));
    const mode = document.getElementById("simulation-mode").value;
    const choiceIds = questionIds().filter((id) => !id.startsWith("risk-"));
    if (mode === "overtime") {
      simulation = {
        mode, score: 100, rounds: Core.pickUnique(choiceIds, quickCount).map((id) => ({ round: "overtime", id, seconds: 30 })),
        index: 0, log: [], answered: false,
      };
    } else {
      const selected = Core.pickUnique(choiceIds, 3 + quickCount);
      simulation = {
        mode, score: 100,
        rounds: [
          ...selected.slice(0, 3).map((id) => ({ round: "required", id, seconds: 30 })),
          ...selected.slice(3).map((id) => ({ round: "quick", id, seconds: 30 })),
        ],
        index: 0, log: [], answered: false, riskPending: true,
      };
    }
    renderSimulationQuestion();
  }

  function simulationSide() {
    return `<div class="score-box"><span>当前总分</span><strong>${simulation.score}</strong></div>
      <div class="score-log">${simulation.log.slice().reverse().map((item) => `<div><span>${item.label}</span><b class="${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}">${item.delta > 0 ? "+" : ""}${item.delta}</b></div>`).join("")}</div>`;
  }

  function renderSimulationQuestion() {
    clearTimer();
    if (simulation.index >= simulation.rounds.length) {
      if (simulation.riskPending) return renderRiskChoice();
      return finishSimulation();
    }
    const item = simulation.rounds[simulation.index];
    const question = BANK.find((entry) => entry.id === item.id);
    simulation.answered = false;
    const total = simulation.rounds.length + (simulation.riskPending ? 1 : 0);
    const progress = Math.round(((simulation.index + 1) / total) * 100);
    app.innerHTML = `
      <section class="page">
        <div class="page-head"><div><p class="eyebrow">赛制模拟</p><h1>${ROUND_LABEL[item.round]}</h1><p class="subtle">第 ${simulation.index + 1} 题，当前总分 ${simulation.score}</p></div><div id="timer" class="timer">${item.seconds}</div></div>
        <div class="practice-layout">
          <article class="card question-card">
            <div class="question-meta"><span class="tag">${ROUND_LABEL[item.round]}</span><span class="pill">${TYPE_LABEL[question.type]}</span></div>
            <h2 class="question-title">${escapeHtml(question.prompt)}</h2>
            ${optionsHtml(question)}
            <div class="button-row"><button class="primary" id="submit-simulation">提交答案</button></div>
          </article>
          <aside class="card side-panel"><span class="subtle">模拟进度</span><strong>${progress}%</strong><div class="progress"><span style="width:${progress}%"></span></div>${simulationSide()}</aside>
        </div>
      </section>`;
    setActive("simulation");
    startTimer(item.seconds, () => submitSimulationAnswer(true));
  }

  function submitSimulationAnswer(timeout = false) {
    if (simulation.answered) return;
    const item = simulation.rounds[simulation.index];
    const question = BANK.find((entry) => entry.id === item.id);
    const selected = selectedAnswers();
    if (!timeout && !selected.length) return toast("请先选择答案");
    simulation.answered = true;
    clearTimer();
    const result = timeout ? "wrong" : Core.gradeSelection(question, selected);
    const delta = Core.scoreDelta(item.round, result);
    simulation.score += delta;
    simulation.log.push({ label: `${ROUND_LABEL[item.round]} ${simulation.index + 1}`, delta });
    recordAnswer(question, result);
    app.querySelector(".question-card").insertAdjacentHTML("beforeend", `${resultCard(question, result, null)}<div class="button-row"><button class="primary" id="next-simulation">${simulation.index + 1 === simulation.rounds.length && !simulation.riskPending ? "完成模拟" : "下一题"}</button></div>`);
    app.querySelectorAll('input[name="answer"], #submit-simulation').forEach((element) => { element.disabled = true; });
    if (timeout) toast("答题超时，已按错误计分");
    refreshSimulationSide();
  }

  function refreshSimulationSide() {
    const panel = app.querySelector(".side-panel");
    if (!panel) return;
    const old = panel.querySelector(".score-box");
    const log = panel.querySelector(".score-log");
    if (old) old.outerHTML = simulationSide().match(/<div class="score-box">[\s\S]*?<\/div>/)[0];
    if (log) log.outerHTML = `<div class="score-log">${simulation.log.slice().reverse().map((item) => `<div><span>${item.label}</span><b class="${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}">${item.delta > 0 ? "+" : ""}${item.delta}</b></div>`).join("")}</div>`;
  }

  function renderRiskChoice() {
    clearTimer();
    page(
      "选择风险题",
      `当前总分 ${simulation.score} 分。每队可选择一个分值档次，也可以放弃。`,
      `<div class="card-grid">
        ${[10, 20, 30].map((points) => `<article class="card action-card"><span class="tag">${points} 分</span><h2>${points} 分风险题</h2><p>答题时间 120 秒，正确加 ${points} 分，错误、不完整或超时扣 ${points} 分。</p><button class="primary risk-choice" data-points="${points}">选择 ${points} 分题</button></article>`).join("")}
      </div>
      <div class="button-row" style="margin-top:18px"><button class="ghost" id="skip-risk">放弃风险题</button></div>`,
      "赛制模拟",
    );
  }

  function startRiskSimulation(points) {
    const pool = BANK.filter((question) => question.type === "risk" && question.points === points);
    const question = Core.pickUnique(pool, 1)[0];
    simulation.riskQuestion = question;
    simulation.riskPending = false;
    simulation.answered = false;
    app.innerHTML = `
      <section class="page">
        <div class="page-head"><div><p class="eyebrow">赛制模拟</p><h1>${points} 分风险题</h1><p class="subtle">当前总分 ${simulation.score}</p></div><div id="timer" class="timer">120</div></div>
        <div class="practice-layout">
          <article class="card question-card">
            <div class="question-meta"><span class="tag">风险题</span><span class="pill orange">${points} 分</span></div>
            <h2 class="question-title">${escapeHtml(question.prompt)}</h2>
            <textarea id="risk-answer" placeholder="请输入答案"></textarea>
            <div class="button-row"><button class="primary" id="submit-risk-simulation">提交答案</button></div>
          </article>
          <aside class="card side-panel">${simulationSide()}</aside>
        </div>
      </section>`;
    startTimer(120, () => submitRiskSimulation(true));
  }

  function submitRiskSimulation(timeout = false) {
    if (simulation.answered) return;
    const question = simulation.riskQuestion;
    const response = document.getElementById("risk-answer").value.trim();
    if (!timeout && !response) return toast("请先输入答案");
    simulation.answered = true;
    clearTimer();
    const detail = timeout ? { result: "wrong", ratio: 0, matched: [], missing: question.keywords } : Core.gradeRisk(question, response);
    const result = detail.result;
    const delta = Core.scoreDelta("risk", result, question.points);
    simulation.score += delta;
    simulation.log.push({ label: `${question.points} 分风险题`, delta });
    recordAnswer(question, result);
    app.querySelector(".question-card").insertAdjacentHTML("beforeend", `${resultCard(question, result, detail, true)}<div class="button-row"><button class="primary" id="finish-simulation">完成模拟</button></div>`);
    app.querySelectorAll("#risk-answer, #submit-risk-simulation").forEach((element) => { element.disabled = true; });
    refreshSimulationSide();
    if (timeout) toast("风险题超时，已扣除对应分值");
  }

  function finishSimulation() {
    clearTimer();
    const record = { at: new Date().toISOString(), score: simulation.score, mode: simulation.mode, log: simulation.log };
    state.simulations = [record, ...state.simulations].slice(0, 10);
    saveState();
    page(
      "模拟完成",
      simulation.mode === "overtime" ? "加赛题专项练习完成。" : "必答题、抢答题和风险题模拟完成。",
      `<div class="hero"><p class="eyebrow" style="color:#ffd1cc">最终成绩</p><h1>${simulation.score} 分</h1><p>初始分值为 100 分，本轮共完成 ${simulation.log.length} 道计分题。</p><div class="hero-actions"><button class="primary" data-view="simulation">再来一轮</button><button class="secondary" data-view="dashboard">返回概览</button></div></div>
      <div class="card" style="margin-top:18px"><h2>计分明细</h2><div class="score-log">${simulation.log.map((item) => `<div><span>${item.label}</span><b class="${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}">${item.delta > 0 ? "+" : ""}${item.delta}</b></div>`).join("")}</div></div>`,
      "赛制模拟",
    );
  }

  function startTimer(seconds, onTimeout) {
    let remaining = seconds;
    timerId = setInterval(() => {
      remaining -= 1;
      const timer = document.getElementById("timer");
      if (timer) {
        timer.textContent = remaining;
        timer.classList.toggle("warning", remaining <= 10);
      }
      if (remaining <= 0) {
        clearTimer();
        onTimeout();
      }
    }, 1000);
  }

  function clearTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function renderRules() {
    clearTimer();
    setActive("rules");
    page(
      "竞赛流程与规则",
      "根据《党建知识竞赛通知》及附带比赛规则手册整理。",
      `<div class="timeline">
        <article class="card"><span class="tag">初赛</span><h2>46 支队伍逐级晋级</h2><p class="subtle">首轮 8 组各取前 3 名，共 24 支；第二轮 4 组共选拔 12 支进入复赛。</p></article>
        <article class="card"><span class="tag">复赛</span><h2>12 进 6</h2><p class="subtle">分为 2 个小组，每组 6 支队伍，各组前 3 名进入决赛。</p></article>
        <article class="card"><span class="tag">决赛</span><h2>决出最终名次</h2><p class="subtle">6 支队伍按总得分排序，决出一等奖 1 名、二等奖 2 名、三等奖 3 名。</p></article>
      </div>
      <article class="card rule-section" style="margin-top:18px"><h2>统一规则</h2><ul class="rule-list"><li>每队固定 3 名选手，初始分值 100 分，最终按总分排名；同分且影响名次时启动加赛。</li><li>所有答题须在规定时间内完成，答案以命题组标准答案为准。</li><li>指定选手或抢答成功选手独立作答，同队其他队员不得提示、补答。</li></ul></article>
      <div class="card-grid">
        <article class="card rule-section"><h2>必答题</h2><ul class="rule-list"><li>每位选手独立作答 1 题，每题 10 分。</li><li>答题时间 30 秒。</li><li>正确加 10 分；错误、不完整或超时不扣分。</li></ul></article>
        <article class="card rule-section"><h2>抢答题</h2><ul class="rule-list"><li>主持人宣布开始后方可抢答。</li><li>每题 10 分，答题时间 30 秒。</li><li>正确加 10 分；错误、不完整或超时扣 10 分。</li></ul></article>
        <article class="card rule-section"><h2>风险题</h2><ul class="rule-list"><li>自主选择 10、20、30 分题或放弃。</li><li>答题时间 120 秒。</li><li>正确加对应分值；错误、不完整或超时扣对应分值。</li></ul></article>
      </div>
      <article class="card rule-section" style="margin-top:18px"><h2>抢答违规与加赛</h2><ul class="rule-list"><li>提前抢答扣 10 分；同一队伍单场累计 2 次违规抢答，取消本轮剩余抢答题资格。</li><li>加赛题仅设置抢答环节，每题 10 分，答题时间 30 秒，规则与正式抢答题一致。</li></ul></article>`,
    );
  }

  function reviseRiskGrade(button) {
    const question = simulation?.riskQuestion || currentQuestion();
    const previous = simulation?.riskQuestion ? state.questions[question.id]?.lastResult : session.result;
    const next = button.dataset.result;
    reviseLast(question, previous, next);
    if (simulation?.riskQuestion && simulation.answered) {
      const oldDelta = simulation.log.at(-1).delta;
      const newDelta = Core.scoreDelta("risk", next, question.points);
      simulation.score += newDelta - oldDelta;
      simulation.log.at(-1).delta = newDelta;
      refreshSimulationSide();
    } else {
      session.result = next;
    }
    button.closest(".result").className = `result ${next}`;
    button.closest(".result").querySelector("h3").textContent = `已人工修正为${RESULT_LABEL[next]}`;
    toast(`判定已修正为${RESULT_LABEL[next]}`);
  }

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.view === "dashboard") renderDashboard();
    if (button.dataset.view === "random") renderRandomSetup();
    if (button.dataset.view === "simulation") renderSimulationSetup();
    if (button.dataset.view === "rules") renderRules();
    if (button.dataset.action === "sequence") startPractice("sequence", questionIds(), "顺序练习");
    if (button.dataset.action === "wrong") startPractice("wrong", wrongIds(), "错题复习");
    if (button.dataset.action === "risk") startPractice("risk", questionIds("risk"), "风险题练习");
  });

  app.addEventListener("click", (event) => {
    const target = event.target.closest("button, .option");
    if (!target) return;
    if (target.classList.contains("option") && !target.querySelector("input")?.disabled) {
      setTimeout(() => target.classList.toggle("selected", target.querySelector("input").checked), 0);
    }
    if (target.dataset.view === "dashboard") renderDashboard();
    if (target.dataset.view === "random" || target.dataset.open === "random") renderRandomSetup();
    if (target.dataset.view === "simulation") renderSimulationSetup();
    if (target.dataset.action === "wrong") startPractice("wrong", wrongIds(), "错题复习");
    if (target.dataset.start === "sequence") startPractice("sequence", questionIds(), "顺序练习");
    if (target.dataset.practiceType) startPractice(target.dataset.practiceType, questionIds(target.dataset.practiceType), `${TYPE_LABEL[target.dataset.practiceType]}专项练习`);
    if (target.id === "start-random") {
      const type = document.getElementById("random-type").value;
      const count = Math.max(1, Number(document.getElementById("random-count").value) || 20);
      startPractice("random", Core.pickUnique(questionIds(type), count), "随机练习");
    }
    if (target.id === "submit-answer") submitPracticeAnswer();
    if (target.id === "skip-question" || target.id === "next-question") nextPracticeQuestion();
    if (target.id === "start-simulation") startSimulation();
    if (target.id === "submit-simulation") submitSimulationAnswer(false);
    if (target.id === "next-simulation") { simulation.index += 1; renderSimulationQuestion(); }
    if (target.classList.contains("risk-choice")) startRiskSimulation(Number(target.dataset.points));
    if (target.id === "skip-risk") { simulation.riskPending = false; simulation.log.push({ label: "放弃风险题", delta: 0 }); finishSimulation(); }
    if (target.id === "submit-risk-simulation") submitRiskSimulation(false);
    if (target.id === "finish-simulation") finishSimulation();
    if (target.classList.contains("manual-grade")) reviseRiskGrade(target);
  });

  document.getElementById("menu-toggle").addEventListener("click", () => sidebar.classList.toggle("open"));
  document.getElementById("clear-data").addEventListener("click", () => {
    if (!confirm("确定清空全部练习记录和模拟成绩吗？此操作无法撤销。")) return;
    state = defaultState();
    saveState();
    renderDashboard();
    toast("练习记录已清空");
  });

  renderDashboard();
})();
(function () {
  const BANK = window.QUESTION_BANK;
  const Core = window.QuizCore;
  const STORAGE_KEY = "party-quiz-practice-v1";
  const app = document.getElementById("app");
  const nav = document.getElementById("main-nav");
  const sidebar = document.querySelector(".sidebar");
  const TYPE_LABEL = { single: "单项选择", multiple: "多项选择", risk: "风险简答" };
  const RESULT_LABEL = { correct: "正确", basic: "基本正确", wrong: "错误" };
  const ROUND_LABEL = { required: "必答题", quick: "抢答题", risk: "风险题", overtime: "加赛题" };

  let state = loadState();
  let session = null;
  let simulation = null;
  let timerId = null;
  let toastId = null;

  function defaultState() {
    return { version: 1, questions: {}, resume: null, simulations: [] };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return parsed && parsed.version === 1 ? { ...defaultState(), ...parsed } : defaultState();
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Some browsers restrict storage for file:// pages; practice remains usable in-memory.
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function toast(message) {
    const element = document.getElementById("toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toastId);
    toastId = setTimeout(() => element.classList.remove("show"), 2200);
  }

  function setActive(view) {
    nav.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    sidebar.classList.remove("open");
    window.scrollTo(0, 0);
  }

  function statsFor(ids = BANK.map((question) => question.id)) {
    const entries = ids.map((id) => state.questions[id]).filter(Boolean);
    const attempts = entries.reduce((sum, item) => sum + item.attempts, 0);
    const correct = entries.reduce((sum, item) => sum + item.correct, 0);
    return {
      covered: entries.filter((item) => item.attempts > 0).length,
      attempts,
      correct,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    };
  }

  function questionIds(type) {
    return BANK.filter((question) => !type || question.type === type).map((question) => question.id);
  }

  function wrongIds() {
    return BANK.filter((question) => {
      const item = state.questions[question.id];
      return item && item.lastResult !== "correct";
    }).map((question) => question.id);
  }

  function recordAnswer(question, result) {
    const current = state.questions[question.id] || { attempts: 0, correct: 0 };
    current.attempts += 1;
    if (result === "correct") current.correct += 1;
    current.lastResult = result;
    current.lastAt = new Date().toISOString();
    state.questions[question.id] = current;
    saveState();
  }

  function reviseLast(question, previous, next) {
    const current = state.questions[question.id];
    if (!current || previous === next) return;
    if (previous === "correct") current.correct = Math.max(0, current.correct - 1);
    if (next === "correct") current.correct += 1;
    current.lastResult = next;
    current.lastAt = new Date().toISOString();
    saveState();
  }

  function page(title, subtitle, content, eyebrow = "赛前练习") {
    app.innerHTML = `
      <section class="page">
        <div class="page-head">
          <div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subtle">${subtitle}</p></div>
        </div>
        ${content}
      </section>`;
    app.focus();
  }

  function renderDashboard() {
    clearTimer();
    setActive("dashboard");
    const total = statsFor();
    const wrong = wrongIds().length;
    const resume = state.resume && state.resume.ids?.length;
    const byType = ["single", "multiple", "risk"].map((type) => [type, statsFor(questionIds(type))]);
    page(
      "学思践悟强党性",
      "完整覆盖知识竞赛题库，通过反复练习掌握题目，并用准确率检验学习效果。",
      `
      <div class="hero">
        <p class="eyebrow" style="color:#ffd1cc">天津市第五中心医院第二届党建知识竞赛</p>
        <h1>赛前充分练习，熟悉全部 301 道题</h1>
        <p>支持顺序练习、随机抽题、错题巩固、风险题关键词判分，以及按照通知规则进行必答、抢答、风险题模拟。</p>
        <div class="hero-actions">
          <button class="primary" data-start="sequence">${resume ? "继续上次练习" : "开始顺序练习"}</button>
          <button class="secondary" data-open="random">随机抽题</button>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><span>题库覆盖</span><strong>${total.covered} / 301</strong><div class="progress"><span style="width:${Math.round(total.covered / 301 * 100)}%"></span></div></div>
        <div class="stat-card"><span>累计答题</span><strong>${total.attempts}</strong><small>每次判分均计入</small></div>
        <div class="stat-card"><span>总准确率</span><strong>${total.accuracy}%</strong><small>正确次数 ÷ 已判分次数</small></div>
        <div class="stat-card"><span>当前错题</span><strong>${wrong}</strong><small>最近一次结果非正确</small></div>
      </div>
      <div class="card-grid">
        ${byType.map(([type, data]) => `
          <article class="card action-card">
            <span class="tag">${TYPE_LABEL[type]}</span>
            <h2>${data.accuracy}% 准确率</h2>
            <p>已练 ${data.covered} / ${questionIds(type).length} 题，累计作答 ${data.attempts} 次。</p>
            <button class="ghost" data-practice-type="${type}">专项练习</button>
          </article>`).join("")}
      </div>`,
    );
  }

  function renderRandomSetup() {
    clearTimer();
    setActive("random");
    page(
      "随机练习",
      "按题型和题量随机组题，单次练习不重复抽取。",
      `<div class="card">
        <div class="form-grid">
          <div class="field"><label for="random-type">题型范围</label>
            <select id="random-type"><option value="">全部题型</option><option value="single">单项选择</option><option value="multiple">多项选择</option><option value="risk">风险简答</option></select>
          </div>
          <div class="field"><label for="random-count">抽题数量</label>
            <input id="random-count" type="number" min="1" max="301" value="20" />
          </div>
        </div>
        <div class="button-row" style="margin-top:22px"><button class="primary" id="start-random">开始随机练习</button></div>
      </div>`,
    );
  }

  function startPractice(kind, ids, title) {
    clearTimer();
    simulation = null;
    if (!ids.length) {
      page(title, "", `<div class="card empty"><strong>暂时没有可练习的题目</strong><p class="subtle">完成题目后，答错或基本正确的题目会进入错题复习。</p><button class="primary" data-start="sequence">开始顺序练习</button></div>`);
      return;
    }
    session = { kind, ids, title, index: 0, answered: false, result: null, selected: [], response: "" };
    if (kind === "sequence" && state.resume?.kind === "sequence") {
      session.index = Math.min(state.resume.index || 0, ids.length - 1);
    }
    saveResume();
    renderQuestion();
  }

  function saveResume() {
    if (!session || session.kind !== "sequence") return;
    state.resume = { kind: session.kind, ids: session.ids, index: session.index, title: session.title };
    saveState();
  }

  function currentQuestion() {
    return BANK.find((question) => question.id === session.ids[session.index]);
  }

  function optionsHtml(question, disabled = false) {
    const inputType = question.type === "multiple" ? "checkbox" : "radio";
    return `<div class="options">${question.options.map((option) => `
      <label class="option">
        <input type="${inputType}" name="answer" value="${option.key}" ${disabled ? "disabled" : ""} />
        <span class="option-key">${option.key}.</span>
        <span>${escapeHtml(option.text)}</span>
      </label>`).join("")}</div>`;
  }

  function questionShell(question, body, sideExtra = "") {
    const progress = Math.round(((session.index + 1) / session.ids.length) * 100);
    return `
      <section class="page">
        <div class="page-head">
          <div><p class="eyebrow">练习进行中</p><h1>${escapeHtml(session.title)}</h1><p class="subtle">第 ${session.index + 1} 题，共 ${session.ids.length} 题</p></div>
          <button class="ghost" data-view="dashboard">退出练习</button>
        </div>
        <div class="practice-layout">
          <article class="card question-card">
            <div class="question-meta">
              <span class="tag">${TYPE_LABEL[question.type]}</span>
              <span class="pill">原题号 ${question.originalNumber}</span>
              ${question.points ? `<span class="pill orange">${question.points} 分风险题</span>` : ""}
            </div>
            <h2 class="question-title">${escapeHtml(question.prompt)}</h2>
            ${body}
          </article>
          <aside class="card side-panel">
            <span class="subtle">练习进度</span><strong>${progress}%</strong>
            <div class="progress"><span style="width:${progress}%"></span></div>
            <dl>
              <dt>当前题号</dt><dd>${session.index + 1} / ${session.ids.length}</dd>
              <dt>本题历史练习</dt><dd>${state.questions[question.id]?.attempts || 0} 次</dd>
              <dt>当前错题总数</dt><dd>${wrongIds().length} 题</dd>
            </dl>
            ${sideExtra}
          </aside>
        </div>
      </section>`;
  }

  function renderQuestion() {
    clearTimer();
    const question = currentQuestion();
    session.answered = false;
    session.result = null;
    session.selected = [];
    session.response = "";
    const answerArea = question.type === "risk"
      ? `<textarea id="risk-answer" placeholder="请输入你的答案。提交后系统将按关键词覆盖率辅助判分。"></textarea>`
      : optionsHtml(question);
    app.innerHTML = questionShell(question, `${answerArea}<div class="button-row"><button class="primary" id="submit-answer">提交答案</button><button class="ghost" id="skip-question">暂时跳过</button></div>`);
    setActive("");
    app.focus();
  }

  function selectedAnswers() {
    return [...app.querySelectorAll('input[name="answer"]:checked')].map((input) => input.value);
  }

  function submitPracticeAnswer() {
    const question = currentQuestion();
    let result;
    let detail = null;
    if (question.type === "risk") {
      const response = document.getElementById("risk-answer").value.trim();
      if (!response) return toast("请先输入答案");
      session.response = response;
      detail = Core.gradeRisk(question, response);
      result = detail.result;
    } else {
      const selected = selectedAnswers();
      if (!selected.length) return toast("请先选择答案");
      session.selected = selected;
      result = Core.gradeSelection(question, selected);
    }
    session.answered = true;
    session.result = result;
    recordAnswer(question, result);
    renderPracticeResult(question, result, detail);
  }

  function resultCard(question, result, detail, manual = false) {
    const title = result === "correct" ? "回答正确" : result === "basic" ? "基本正确" : "回答错误";
    const keywords = detail ? `
      <p><strong>关键词覆盖率：</strong>${Math.round(detail.ratio * 100)}%</p>
      <p><strong>已匹配：</strong></p><div class="keyword-list">${detail.matched.map((item) => `<span>${escapeHtml(item)}</span>`).join("") || "<span>暂无</span>"}</div>
      <p style="margin-top:12px"><strong>未匹配：</strong></p><div class="keyword-list">${detail.missing.map((item) => `<span>${escapeHtml(item)}</span>`).join("") || "<span>无</span>"}</div>` : "";
    const controls = manual ? `
      <p style="margin-top:14px"><strong>人工修正判定：</strong></p>
      <div class="button-row">
        <button class="ghost manual-grade" data-result="correct">判为正确</button>
        <button class="ghost manual-grade" data-result="basic">判为基本正确</button>
        <button class="ghost manual-grade" data-result="wrong">判为错误</button>
      </div>` : "";
    return `<div class="result ${result}"><h3>${title}</h3>${keywords}<p><strong>标准答案：</strong></p><div class="answer-text">${escapeHtml(question.answer)}</div>${controls}</div>`;
  }

  function renderPracticeResult(question, result, detail) {
    const body = question.type === "risk"
      ? `<textarea disabled>${escapeHtml(session.response)}</textarea>`
      : optionsHtml(question, true);
    app.innerHTML = questionShell(question, `${body}${resultCard(question, result, detail, question.type === "risk")}<div class="button-row"><button class="primary" id="next-question">${session.index + 1 === session.ids.length ? "完成练习" : "下一题"}</button></div>`);
    app.querySelectorAll('input[name="answer"]').forEach((input) => {
      if (session.selected.includes(input.value)) {
        input.checked = true;
        input.closest(".option").classList.add("selected");
      }
    });
  }

  function nextPracticeQuestion() {
    if (session.index + 1 >= session.ids.length) {
      state.resume = null;
      saveState();
      renderPracticeSummary();
      return;
    }
    session.index += 1;
    saveResume();
    renderQuestion();
  }

  function renderPracticeSummary() {
    const data = statsFor(session.ids);
    page(
      "本轮练习完成",
      `${session.title}已完成，可以继续巩固错题或开启新一轮训练。`,
      `<div class="stats-grid">
        <div class="stat-card"><span>本组题量</span><strong>${session.ids.length}</strong></div>
        <div class="stat-card"><span>已练覆盖</span><strong>${data.covered}</strong></div>
        <div class="stat-card"><span>累计准确率</span><strong>${data.accuracy}%</strong></div>
        <div class="stat-card"><span>当前错题</span><strong>${wrongIds().length}</strong></div>
      </div>
      <div class="button-row"><button class="primary" data-action="wrong">复习错题</button><button class="ghost" data-view="dashboard">返回概览</button></div>`,
    );
  }

  function renderSimulationSetup() {
    clearTimer();
    setActive("simulation");
    page(
      "赛制模拟",
      "按照通知中的统一规则进行个人模拟，实时计时与计分。",
      `<div class="card">
        <div class="form-grid">
          <div class="field"><label for="quick-count">抢答题数量</label><input id="quick-count" type="number" min="1" max="50" value="10" /></div>
          <div class="field"><label for="simulation-mode">模拟模式</label>
            <select id="simulation-mode"><option value="full">正式模拟：必答 + 抢答 + 风险</option><option value="overtime">加赛题专项练习</option></select>
          </div>
        </div>
        <div class="button-row" style="margin-top:22px"><button class="primary" id="start-simulation">开始模拟</button></div>
      </div>
      <div class="card" style="margin-top:18px">
        <h2>计分规则</h2>
        <ul class="rule-list">
          <li>初始分值 100 分；必答题答对加 10 分，答错或超时不扣分。</li>
          <li>抢答题与加赛题答对加 10 分，答错、答题不完整或超时扣 10 分。</li>
          <li>风险题可选择 10、20、30 分或放弃，答错、答案不完整或超时扣对应分值。</li>
        </ul>
      </div>`,
    );
  }

  function startSimulation() {
    session = null;
    const quickCount = Math.max(1, Math.min(50, Number(document.getElementById("quick-count").value) || 10));
    const mode = document.getElementById("simulation-mode").value;
    const choiceIds = questionIds().filter((id) => !id.startsWith("risk-"));
    if (mode === "overtime") {
      simulation = {
        mode, score: 100, rounds: Core.pickUnique(choiceIds, quickCount).map((id) => ({ round: "overtime", id, seconds: 30 })),
        index: 0, log: [], answered: false,
      };
    } else {
      const selected = Core.pickUnique(choiceIds, 3 + quickCount);
      simulation = {
        mode, score: 100,
        rounds: [
          ...selected.slice(0, 3).map((id) => ({ round: "required", id, seconds: 30 })),
          ...selected.slice(3).map((id) => ({ round: "quick", id, seconds: 30 })),
        ],
        index: 0, log: [], answered: false, riskPending: true,
      };
    }
    renderSimulationQuestion();
  }

  function simulationSide() {
    return `<div class="score-box"><span>当前总分</span><strong>${simulation.score}</strong></div>
      <div class="score-log">${simulation.log.slice().reverse().map((item) => `<div><span>${item.label}</span><b class="${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}">${item.delta > 0 ? "+" : ""}${item.delta}</b></div>`).join("")}</div>`;
  }

  function renderSimulationQuestion() {
    clearTimer();
    if (simulation.index >= simulation.rounds.length) {
      if (simulation.riskPending) return renderRiskChoice();
      return finishSimulation();
    }
    const item = simulation.rounds[simulation.index];
    const question = BANK.find((entry) => entry.id === item.id);
    simulation.answered = false;
    const total = simulation.rounds.length + (simulation.riskPending ? 1 : 0);
    const progress = Math.round(((simulation.index + 1) / total) * 100);
    app.innerHTML = `
      <section class="page">
        <div class="page-head"><div><p class="eyebrow">赛制模拟</p><h1>${ROUND_LABEL[item.round]}</h1><p class="subtle">第 ${simulation.index + 1} 题，当前总分 ${simulation.score}</p></div><div id="timer" class="timer">${item.seconds}</div></div>
        <div class="practice-layout">
          <article class="card question-card">
            <div class="question-meta"><span class="tag">${ROUND_LABEL[item.round]}</span><span class="pill">${TYPE_LABEL[question.type]}</span></div>
            <h2 class="question-title">${escapeHtml(question.prompt)}</h2>
            ${optionsHtml(question)}
            <div class="button-row"><button class="primary" id="submit-simulation">提交答案</button></div>
          </article>
          <aside class="card side-panel"><span class="subtle">模拟进度</span><strong>${progress}%</strong><div class="progress"><span style="width:${progress}%"></span></div>${simulationSide()}</aside>
        </div>
      </section>`;
    setActive("simulation");
    startTimer(item.seconds, () => submitSimulationAnswer(true));
  }

  function submitSimulationAnswer(timeout = false) {
    if (simulation.answered) return;
    const item = simulation.rounds[simulation.index];
    const question = BANK.find((entry) => entry.id === item.id);
    const selected = selectedAnswers();
    if (!timeout && !selected.length) return toast("请先选择答案");
    simulation.answered = true;
    clearTimer();
    const result = timeout ? "wrong" : Core.gradeSelection(question, selected);
    const delta = Core.scoreDelta(item.round, result);
    simulation.score += delta;
    simulation.log.push({ label: `${ROUND_LABEL[item.round]} ${simulation.index + 1}`, delta });
    recordAnswer(question, result);
    app.querySelector(".question-card").insertAdjacentHTML("beforeend", `${resultCard(question, result, null)}<div class="button-row"><button class="primary" id="next-simulation">${simulation.index + 1 === simulation.rounds.length && !simulation.riskPending ? "完成模拟" : "下一题"}</button></div>`);
    app.querySelectorAll('input[name="answer"], #submit-simulation').forEach((element) => { element.disabled = true; });
    if (timeout) toast("答题超时，已按错误计分");
    refreshSimulationSide();
  }

  function refreshSimulationSide() {
    const panel = app.querySelector(".side-panel");
    if (!panel) return;
    const old = panel.querySelector(".score-box");
    const log = panel.querySelector(".score-log");
    if (old) old.outerHTML = simulationSide().match(/<div class="score-box">[\s\S]*?<\/div>/)[0];
    if (log) log.outerHTML = `<div class="score-log">${simulation.log.slice().reverse().map((item) => `<div><span>${item.label}</span><b class="${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}">${item.delta > 0 ? "+" : ""}${item.delta}</b></div>`).join("")}</div>`;
  }

  function renderRiskChoice() {
    clearTimer();
    page(
      "选择风险题",
      `当前总分 ${simulation.score} 分。每队可选择一个分值档次，也可以放弃。`,
      `<div class="card-grid">
        ${[10, 20, 30].map((points) => `<article class="card action-card"><span class="tag">${points} 分</span><h2>${points} 分风险题</h2><p>答题时间 120 秒，正确加 ${points} 分，错误、不完整或超时扣 ${points} 分。</p><button class="primary risk-choice" data-points="${points}">选择 ${points} 分题</button></article>`).join("")}
      </div>
      <div class="button-row" style="margin-top:18px"><button class="ghost" id="skip-risk">放弃风险题</button></div>`,
      "赛制模拟",
    );
  }

  function startRiskSimulation(points) {
    const pool = BANK.filter((question) => question.type === "risk" && question.points === points);
    const question = Core.pickUnique(pool, 1)[0];
    simulation.riskQuestion = question;
    simulation.riskPending = false;
    simulation.answered = false;
    app.innerHTML = `
      <section class="page">
        <div class="page-head"><div><p class="eyebrow">赛制模拟</p><h1>${points} 分风险题</h1><p class="subtle">当前总分 ${simulation.score}</p></div><div id="timer" class="timer">120</div></div>
        <div class="practice-layout">
          <article class="card question-card">
            <div class="question-meta"><span class="tag">风险题</span><span class="pill orange">${points} 分</span></div>
            <h2 class="question-title">${escapeHtml(question.prompt)}</h2>
            <textarea id="risk-answer" placeholder="请输入答案"></textarea>
            <div class="button-row"><button class="primary" id="submit-risk-simulation">提交答案</button></div>
          </article>
          <aside class="card side-panel">${simulationSide()}</aside>
        </div>
      </section>`;
    startTimer(120, () => submitRiskSimulation(true));
  }

  function submitRiskSimulation(timeout = false) {
    if (simulation.answered) return;
    const question = simulation.riskQuestion;
    const response = document.getElementById("risk-answer").value.trim();
    if (!timeout && !response) return toast("请先输入答案");
    simulation.answered = true;
    clearTimer();
    const detail = timeout ? { result: "wrong", ratio: 0, matched: [], missing: question.keywords } : Core.gradeRisk(question, response);
    const result = detail.result;
    const delta = Core.scoreDelta("risk", result, question.points);
    simulation.score += delta;
    simulation.log.push({ label: `${question.points} 分风险题`, delta });
    recordAnswer(question, result);
    app.querySelector(".question-card").insertAdjacentHTML("beforeend", `${resultCard(question, result, detail, true)}<div class="button-row"><button class="primary" id="finish-simulation">完成模拟</button></div>`);
    app.querySelectorAll("#risk-answer, #submit-risk-simulation").forEach((element) => { element.disabled = true; });
    refreshSimulationSide();
    if (timeout) toast("风险题超时，已扣除对应分值");
  }

  function finishSimulation() {
    clearTimer();
    const record = { at: new Date().toISOString(), score: simulation.score, mode: simulation.mode, log: simulation.log };
    state.simulations = [record, ...state.simulations].slice(0, 10);
    saveState();
    page(
      "模拟完成",
      simulation.mode === "overtime" ? "加赛题专项练习完成。" : "必答题、抢答题和风险题模拟完成。",
      `<div class="hero"><p class="eyebrow" style="color:#ffd1cc">最终成绩</p><h1>${simulation.score} 分</h1><p>初始分值为 100 分，本轮共完成 ${simulation.log.length} 道计分题。</p><div class="hero-actions"><button class="primary" data-view="simulation">再来一轮</button><button class="secondary" data-view="dashboard">返回概览</button></div></div>
      <div class="card" style="margin-top:18px"><h2>计分明细</h2><div class="score-log">${simulation.log.map((item) => `<div><span>${item.label}</span><b class="${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}">${item.delta > 0 ? "+" : ""}${item.delta}</b></div>`).join("")}</div></div>`,
      "赛制模拟",
    );
  }

  function startTimer(seconds, onTimeout) {
    let remaining = seconds;
    timerId = setInterval(() => {
      remaining -= 1;
      const timer = document.getElementById("timer");
      if (timer) {
        timer.textContent = remaining;
        timer.classList.toggle("warning", remaining <= 10);
      }
      if (remaining <= 0) {
        clearTimer();
        onTimeout();
      }
    }, 1000);
  }

  function clearTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function renderRules() {
    clearTimer();
    setActive("rules");
    page(
      "竞赛流程与规则",
      "根据《党建知识竞赛通知》及附带比赛规则手册整理。",
      `<div class="timeline">
        <article class="card"><span class="tag">初赛</span><h2>46 支队伍逐级晋级</h2><p class="subtle">首轮 8 组各取前 3 名，共 24 支；第二轮 4 组共选拔 12 支进入复赛。</p></article>
        <article class="card"><span class="tag">复赛</span><h2>12 进 6</h2><p class="subtle">分为 2 个小组，每组 6 支队伍，各组前 3 名进入决赛。</p></article>
        <article class="card"><span class="tag">决赛</span><h2>决出最终名次</h2><p class="subtle">6 支队伍按总得分排序，决出一等奖 1 名、二等奖 2 名、三等奖 3 名。</p></article>
      </div>
      <article class="card rule-section" style="margin-top:18px"><h2>统一规则</h2><ul class="rule-list"><li>每队固定 3 名选手，初始分值 100 分，最终按总分排名；同分且影响名次时启动加赛。</li><li>所有答题须在规定时间内完成，答案以命题组标准答案为准。</li><li>指定选手或抢答成功选手独立作答，同队其他队员不得提示、补答。</li></ul></article>
      <div class="card-grid">
        <article class="card rule-section"><h2>必答题</h2><ul class="rule-list"><li>每位选手独立作答 1 题，每题 10 分。</li><li>答题时间 30 秒。</li><li>正确加 10 分；错误、不完整或超时不扣分。</li></ul></article>
        <article class="card rule-section"><h2>抢答题</h2><ul class="rule-list"><li>主持人宣布开始后方可抢答。</li><li>每题 10 分，答题时间 30 秒。</li><li>正确加 10 分；错误、不完整或超时扣 10 分。</li></ul></article>
        <article class="card rule-section"><h2>风险题</h2><ul class="rule-list"><li>自主选择 10、20、30 分题或放弃。</li><li>答题时间 120 秒。</li><li>正确加对应分值；错误、不完整或超时扣对应分值。</li></ul></article>
      </div>
      <article class="card rule-section" style="margin-top:18px"><h2>抢答违规与加赛</h2><ul class="rule-list"><li>提前抢答扣 10 分；同一队伍单场累计 2 次违规抢答，取消本轮剩余抢答题资格。</li><li>加赛题仅设置抢答环节，每题 10 分，答题时间 30 秒，规则与正式抢答题一致。</li></ul></article>`,
    );
  }

  function reviseRiskGrade(button) {
    const question = simulation?.riskQuestion || currentQuestion();
    const previous = simulation?.riskQuestion ? state.questions[question.id]?.lastResult : session.result;
    const next = button.dataset.result;
    reviseLast(question, previous, next);
    if (simulation?.riskQuestion && simulation.answered) {
      const oldDelta = simulation.log.at(-1).delta;
      const newDelta = Core.scoreDelta("risk", next, question.points);
      simulation.score += newDelta - oldDelta;
      simulation.log.at(-1).delta = newDelta;
      refreshSimulationSide();
    } else {
      session.result = next;
    }
    button.closest(".result").className = `result ${next}`;
    button.closest(".result").querySelector("h3").textContent = `已人工修正为${RESULT_LABEL[next]}`;
    toast(`判定已修正为${RESULT_LABEL[next]}`);
  }

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.view === "dashboard") renderDashboard();
    if (button.dataset.view === "random") renderRandomSetup();
    if (button.dataset.view === "simulation") renderSimulationSetup();
    if (button.dataset.view === "rules") renderRules();
    if (button.dataset.action === "sequence") startPractice("sequence", questionIds(), "顺序练习");
    if (button.dataset.action === "wrong") startPractice("wrong", wrongIds(), "错题复习");
    if (button.dataset.action === "risk") startPractice("risk", questionIds("risk"), "风险题练习");
  });

  app.addEventListener("click", (event) => {
    const target = event.target.closest("button, .option");
    if (!target) return;
    if (target.classList.contains("option") && !target.querySelector("input")?.disabled) {
      setTimeout(() => target.classList.toggle("selected", target.querySelector("input").checked), 0);
    }
    if (target.dataset.view === "dashboard") renderDashboard();
    if (target.dataset.view === "random" || target.dataset.open === "random") renderRandomSetup();
    if (target.dataset.view === "simulation") renderSimulationSetup();
    if (target.dataset.action === "wrong") startPractice("wrong", wrongIds(), "错题复习");
    if (target.dataset.start === "sequence") startPractice("sequence", questionIds(), "顺序练习");
    if (target.dataset.practiceType) startPractice(target.dataset.practiceType, questionIds(target.dataset.practiceType), `${TYPE_LABEL[target.dataset.practiceType]}专项练习`);
    if (target.id === "start-random") {
      const type = document.getElementById("random-type").value;
      const count = Math.max(1, Number(document.getElementById("random-count").value) || 20);
      startPractice("random", Core.pickUnique(questionIds(type), count), "随机练习");
    }
    if (target.id === "submit-answer") submitPracticeAnswer();
    if (target.id === "skip-question" || target.id === "next-question") nextPracticeQuestion();
    if (target.id === "start-simulation") startSimulation();
    if (target.id === "submit-simulation") submitSimulationAnswer(false);
    if (target.id === "next-simulation") { simulation.index += 1; renderSimulationQuestion(); }
    if (target.classList.contains("risk-choice")) startRiskSimulation(Number(target.dataset.points));
    if (target.id === "skip-risk") { simulation.riskPending = false; simulation.log.push({ label: "放弃风险题", delta: 0 }); finishSimulation(); }
    if (target.id === "submit-risk-simulation") submitRiskSimulation(false);
    if (target.id === "finish-simulation") finishSimulation();
    if (target.classList.contains("manual-grade")) reviseRiskGrade(target);
  });

  document.getElementById("menu-toggle").addEventListener("click", () => sidebar.classList.toggle("open"));
  document.getElementById("clear-data").addEventListener("click", () => {
    if (!confirm("确定清空全部练习记录和模拟成绩吗？此操作无法撤销。")) return;
    state = defaultState();
    saveState();
    renderDashboard();
    toast("练习记录已清空");
  });

  renderDashboard();
})();
