import { loadData, TEST_SET_INFO } from './data.js';
import { icon, sectionIcon } from './icons.js';
import { isMastered, isMistake, loadProgress, loadSettings, recordAnswer, recordExam, resetProgress, saveSettings, TEST_SETS } from './store.js';
import { createSession, isCorrect, practiceQueue, remainingSeconds, scoreSession } from './session.js';

const PRACTICE_BATCH = 20;
const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const URGENT_SECONDS = 300;
const SEARCH_DEBOUNCE_MS = 150;
const TAB_ROUTES = ['', 'testy', 'okruhy', 'statistika'];

const TABS = [
    { route: '', label: 'Domov', icon: 'home' },
    { route: 'testy', label: 'Testy', icon: 'exam' },
    { route: 'okruhy', label: 'Okruhy', icon: 'sections' },
    { route: 'statistika', label: 'Štatistika', icon: 'stats' },
];

const dom = {
    main: document.getElementById('main'),
    tabBar: document.getElementById('tab-bar'),
    sheetRoot: document.getElementById('sheet-root'),
    toast: document.getElementById('toast'),
};

const initialSettings = loadSettings();

const state = {
    data: null,
    settings: initialSettings,
    progress: loadProgress(initialSettings.testSet ?? 'official'),
    session: null,
    result: null,
    timer: null,
    browse: null,
    route: null,
    welcomeChoice: null,
    settingsReturn: '',
};

const activeTests = () => state.data.testSets[state.settings.testSet];
const activeSetInfo = () => TEST_SET_INFO[state.settings.testSet];

const selectTestSet = (testSet) => {
    stopTimer();
    state.settings = { ...state.settings, testSet };
    saveSettings(state.settings);
    state.progress = loadProgress(testSet);
    state.session = null;
    state.result = null;
    state.browse = null;
};

const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pluralize = (count, one, few, many) => `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;

const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

const percent = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

const haptic = (pattern) => navigator.vibrate?.(pattern);

const showToast = (message) => {
    dom.toast.textContent = message;
    dom.toast.classList.add('visible');
    clearTimeout(showToast.handle);
    showToast.handle = setTimeout(() => dom.toast.classList.remove('visible'), 3500);
};

const openSheet = ({ title, body = '', actions }) =>
    new Promise((resolve) => {
        dom.sheetRoot.innerHTML = `
            <div class="scrim" data-sheet-dismiss></div>
            <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
                <span class="sheet-handle" aria-hidden="true"></span>
                <h2 id="sheet-title" class="sheet-title">${escapeHtml(title)}</h2>
                ${body}
                <div class="sheet-actions">
                    ${actions.map((a, i) => `<button class="button ${a.variant ?? 'secondary'}" data-sheet-value="${i}">${a.label}</button>`).join('')}
                </div>
            </section>`;
        const previousFocus = document.activeElement;
        const close = (value) => {
            dom.sheetRoot.removeEventListener('click', onClick);
            document.removeEventListener('keydown', onKey, true);
            dom.sheetRoot.innerHTML = '';
            previousFocus?.focus?.({ preventScroll: true });
            resolve(value);
        };
        const onClick = (event) => {
            if (event.target.closest('[data-sheet-dismiss]')) return close(null);
            const button = event.target.closest('[data-sheet-value]');
            if (button) return close(actions[Number(button.dataset.sheetValue)].value);
            const custom = event.target.closest('[data-sheet-result]');
            if (custom) close(custom.dataset.sheetResult);
        };
        const onKey = (event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            close(null);
        };
        dom.sheetRoot.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey, true);
        dom.sheetRoot.querySelector('[data-sheet-value]')?.focus();
    });

const confirmSheet = async ({ title, message, confirmLabel, cancelLabel = 'Zrušiť', danger = false }) =>
    (await openSheet({
        title,
        body: `<p class="sheet-text">${escapeHtml(message)}</p>`,
        actions: [
            { label: confirmLabel, value: true, variant: danger ? 'danger' : 'primary' },
            { label: cancelLabel, value: false, variant: 'secondary' },
        ],
    })) === true;

const currentRoute = () => location.hash.replace(/^#\/?/, '');
const routeParts = (route = currentRoute()) => {
    const [name = '', param] = route.split('/');
    return { name, param };
};
const navigate = (route) => {
    if (currentRoute() === route) render();
    else location.hash = `#/${route}`;
};
const redirect = (route) => {
    history.replaceState(null, '', `#/${route}`);
    render();
};

const stopTimer = () => {
    clearInterval(state.timer);
    state.timer = null;
};

const examInProgress = () => state.session?.mode === 'exam' && !state.session.submitted;

const ring = (value, max, label, size = 'large') => {
    const pct = percent(value, max);
    return `
        <div class="ring ring-${size}" role="img" aria-label="${label}">
            <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle class="ring-track" cx="60" cy="60" r="52" />
                ${pct > 0 ? `<circle class="ring-value" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${pct} 100" />` : ''}
            </svg>
            <span class="ring-label"><strong>${pct}%</strong></span>
        </div>`;
};

const largeHeader = (title, subtitle = '', trailing = '') => `
    <header class="large-header">
        <div class="large-header-row">
            <h1>${escapeHtml(title)}</h1>
            ${trailing}
        </div>
        ${subtitle ? `<p>${subtitle}</p>` : ''}
    </header>`;

const settingsButton = () => `<button class="icon-button header-action" data-nav="nastavenia" aria-label="Nastavenia">${icon('settings')}</button>`;

const pushHeader = (title, back) => `
    <header class="top-bar">
        <button class="icon-button" data-nav="${back}" aria-label="Späť">${icon('back')}</button>
        <h1 class="top-bar-title">${escapeHtml(title)}</h1>
        <span class="icon-button-spacer" aria-hidden="true"></span>
    </header>`;

const listRow = ({ attrs, leading, title, subtitle = '', trailing = icon('next'), disabled = false }) => `
    <li>
        <button class="row" ${attrs} ${disabled ? 'disabled' : ''}>
            ${leading}
            <span class="row-body"><span class="row-title">${title}</span>${subtitle ? `<span class="row-subtitle">${subtitle}</span>` : ''}</span>
            <span class="row-trailing">${trailing}</span>
        </button>
    </li>`;

const renderTabBar = (visible) => {
    dom.tabBar.hidden = !visible;
    document.body.classList.toggle('has-tab-bar', visible);
    if (!visible) return;
    const active = routeParts().name;
    dom.tabBar.innerHTML = TABS.map(
        (tab) => `
        <a href="#/${tab.route}" class="tab" ${active === tab.route ? 'aria-current="page"' : ''}>
            <span class="tab-icon">${icon(tab.icon)}</span><span>${tab.label}</span>
        </a>`,
    ).join('');
};

const setScreen = (html, { actionBar = '' } = {}) => {
    dom.main.innerHTML = `<div class="screen">${html}</div>${actionBar}`;
    document.body.classList.toggle('has-action-bar', Boolean(actionBar));
};

const overallProgress = () => {
    const stats = state.data.questions.map((q) => state.progress.answers[q.id]);
    return {
        total: state.data.questions.length,
        seen: stats.filter(Boolean).length,
        mastered: stats.filter(isMastered).length,
        mistakes: stats.filter(isMistake).length,
    };
};

const sectionStats = (sectionId) => {
    const questions = state.data.questions.filter((q) => q.section === sectionId);
    const stats = questions.map((q) => state.progress.answers[q.id]).filter(Boolean);
    const right = stats.reduce((sum, s) => sum + s.right, 0);
    const wrong = stats.reduce((sum, s) => sum + s.wrong, 0);
    return {
        total: questions.length,
        seen: stats.length,
        mastered: stats.filter(isMastered).length,
        accuracy: right + wrong === 0 ? null : percent(right, right + wrong),
    };
};

const readiness = () => {
    const recent = state.progress.exams.slice(0, 5);
    if (recent.length === 0) return { label: 'Bez ostrého testu', tone: 'neutral', detail: 'Sprav si prvý ostrý test a uvidíš, kde stojíš.' };
    const passed = recent.filter((exam) => exam.passed).length;
    const detail = `Posledné ostré testy: spravené ${passed} z ${recent.length}.`;
    if (passed === recent.length && recent.length >= 3) return { label: 'Pripravený', tone: 'success', detail };
    if (passed >= Math.ceil(recent.length / 2)) return { label: 'Na dobrej ceste', tone: 'warning', detail };
    return { label: 'Treba trénovať', tone: 'danger', detail };
};

const startExam = (testNumber) => {
    const { data } = state;
    const tests = activeTests();
    const test = tests.find((t) => t.number === testNumber) ?? tests[Math.floor(Math.random() * tests.length)];
    state.session = createSession({
        mode: 'exam',
        title: `Test č. ${test.number}`,
        testNumber: test.number,
        timeLimitSeconds: data.exam.timeLimitSeconds,
        questions: test.questions.map((id) => data.byId.get(id)),
    });
    navigate('relacia');
};

const startPractice = (title, questions, origin) => {
    if (questions.length === 0) {
        showToast('Na precvičenie tu teraz nič nie je.');
        return;
    }
    state.session = { ...createSession({ mode: 'practice', title, questions, shuffleOptions: true }), origin };
    navigate('relacia');
};

const startSectionPractice = (sectionId) => {
    const pool = state.data.questions.filter((q) => sectionId === 0 || q.section === sectionId);
    const title = sectionId === 0 ? 'Precvičovanie' : state.data.shortName(sectionId);
    startPractice(title, practiceQueue(pool, state.progress, PRACTICE_BATCH), { sectionId });
};

const startMistakesPractice = () =>
    startPractice(
        'Moje chyby',
        practiceQueue(
            state.data.questions.filter((q) => isMistake(state.progress.answers[q.id])),
            state.progress,
            Infinity,
        ),
        { mistakes: true },
    );

const viewHome = () => {
    const overall = overallProgress();
    const ready = readiness();
    const { exam } = state.data;
    setScreen(`
        ${largeHeader('Vodičák B', `${activeSetInfo().name} · otázky MV SR`, settingsButton())}
        <section class="card progress-card" aria-label="Tvoj postup">
            ${ring(overall.mastered, overall.total, `Zvládnuté ${overall.mastered} z ${overall.total} otázok`)}
            <div class="progress-card-body">
                <span class="status-chip tone-${ready.tone}">${ready.label}</span>
                <p class="progress-card-title">${overall.mastered} z ${overall.total} otázok zvládnutých</p>
                <p class="muted small">${ready.detail}</p>
            </div>
        </section>
        <section class="card cta-card">
            <div>
                <h2 class="card-title">Ostrý test</h2>
                <p class="muted small">${exam.questionCount} otázok · ${exam.timeLimitSeconds / 60} minút · úspech od ${exam.passPoints} bodov</p>
            </div>
            <button class="button primary block" data-action="exam">${icon('play')} Spustiť test</button>
        </section>
        <h2 class="group-title">Učenie</h2>
        <ul class="list-group">
            ${listRow({ attrs: 'data-action="practice-all"', leading: `<span class="icon-tile tone-primary">${icon('shuffle')}</span>`, title: 'Rýchle precvičovanie', subtitle: `${PRACTICE_BATCH} otázok, najprv tie nové` })}
            ${listRow({
                attrs: 'data-nav="chyby"',
                leading: `<span class="icon-tile tone-danger">${icon('mistakes')}</span>`,
                title: 'Moje chyby',
                subtitle: overall.mistakes ? 'Otázky, ktoré ti nejdú' : 'Zatiaľ žiadne',
                trailing: `${overall.mistakes ? `<span class="count-badge">${overall.mistakes}</span>` : ''}${icon('next')}`,
            })}
            ${listRow({ attrs: 'data-nav="okruhy"', leading: `<span class="icon-tile tone-3">${icon('s3')}</span>`, title: 'Okruhy otázok', subtitle: 'Značky, križovatky a ďalšie' })}
        </ul>`);
};

const viewTests = () => {
    const best = state.progress.bestByTest;
    const pass = state.data.exam.passPoints;
    const tests = activeTests();
    const passedCount = Object.values(best).filter((score) => score >= pass).length;
    setScreen(`
        ${largeHeader('Testy', `${escapeHtml(activeSetInfo().name)} · spravené ${passedCount} z ${tests.length}`, settingsButton())}
        <button class="button primary block" data-action="exam">${icon('shuffle')} Náhodný test</button>
        <ul class="test-grid" aria-label="${escapeHtml(activeSetInfo().name)}">
            ${tests
                .map((test) => {
                    const score = best[test.number];
                    const status = score == null ? 'untried' : score >= pass ? 'passed' : 'failed';
                    const label = score == null ? 'neskúšaný' : `${score} bodov, ${score >= pass ? 'spravený' : 'nespravený'}`;
                    return `<li><button class="test-chip status-${status}" data-exam="${test.number}" aria-label="Test ${test.number}, ${label}">
                        <span class="test-number">${test.number}</span>
                        <span class="test-score">${score == null ? '–' : score}</span>
                    </button></li>`;
                })
                .join('')}
        </ul>
        <p class="muted small center">Zelená = spravený, červená = nespravený. Číslo dole je tvoje najlepšie skóre.</p>`);
};

const viewSections = () => {
    setScreen(`
        ${largeHeader('Okruhy', 'Prechádzaj otázky so správnymi odpoveďami alebo si okruh precvič')}
        <ul class="list-group">
            ${state.data.sections
                .map((section) => {
                    const s = sectionStats(section.id);
                    return listRow({
                        attrs: `data-nav="prehlad/${section.id}"`,
                        leading: sectionIcon(section.id),
                        title: escapeHtml(state.data.shortName(section.id)),
                        subtitle: `${s.mastered} / ${s.total} zvládnutých
                            <span class="meter" aria-hidden="true"><span style="width:${percent(s.mastered, s.total)}%"></span></span>`,
                    });
                })
                .join('')}
        </ul>`);
};

const BROWSE_FILTERS = [
    { id: 'all', label: 'Všetky', matches: () => true },
    { id: 'unmastered', label: 'Nezvládnuté', matches: (stat) => !isMastered(stat) },
    { id: 'mistakes', label: 'Chyby', matches: (stat) => isMistake(stat) },
];

const normalizeText = (value) =>
    value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();

const browseQuestions = () => {
    const { sectionId, query, filter } = state.browse;
    const needle = normalizeText(query.trim());
    const matchesFilter = BROWSE_FILTERS.find((f) => f.id === filter).matches;
    return state.data.questions
        .filter((q) => q.section === sectionId)
        .map((question, index) => ({ question, number: index + 1 }))
        .filter(({ question }) => matchesFilter(state.progress.answers[question.id]))
        .filter(({ question }) => !needle || normalizeText([question.text, ...question.options].join(' ')).includes(needle));
};

const statusPill = (stat) => {
    if (isMastered(stat)) return `<span class="pill success">${icon('check')} Zvládnutá</span>`;
    if (isMistake(stat)) return `<span class="pill danger">${icon('cross')} Chyba</span>`;
    return '';
};

const questionImage = (question, alt, lazy = false) =>
    question.image
        ? `<figure class="question-image"><img src="img/${encodeURIComponent(question.image)}" alt="${alt}" ${lazy ? 'loading="lazy"' : ''} decoding="async" /></figure>`
        : '';

const renderBrowseCard = ({ question, number }) => {
    const answer = `
        <div class="answer-block">
            <p class="answer correct">${icon('check', 'Správna odpoveď')}<span>${escapeHtml(question.options[question.correct])}</span></p>
            <details class="other-options">
                <summary>Nesprávne možnosti</summary>
                <ul>${question.options
                    .filter((_, i) => i !== question.correct)
                    .map((option) => `<li class="answer wrong">${icon('cross', 'Nesprávna')}<span>${escapeHtml(option)}</span></li>`)
                    .join('')}</ul>
            </details>
        </div>`;
    return `
        <li class="card browse-card">
            <div class="question-meta">
                <span>Otázka ${number} · ${pluralize(question.points, 'bod', 'body', 'bodov')}</span>
                ${statusPill(state.progress.answers[question.id])}
            </div>
            <h3 class="browse-question">${escapeHtml(question.text)}</h3>
            ${questionImage(question, `Obrázok k otázke ${number}`, true)}
            ${state.browse.hideAnswers ? `<details class="reveal"><summary>${icon('eye')} Ukázať odpoveď</summary>${answer}</details>` : answer}
        </li>`;
};

const renderBrowseList = () => {
    const items = browseQuestions();
    document.getElementById('browse-count').textContent = pluralize(items.length, 'otázka', 'otázky', 'otázok');
    document.getElementById('browse-list').innerHTML = items.length
        ? items.map(renderBrowseCard).join('')
        : '<li class="empty-state"><p class="muted">Žiadna otázka nezodpovedá filtru.</p></li>';
    document.querySelectorAll('[data-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === state.browse.filter)));
};

const viewBrowse = (sectionId) => {
    const section = state.data.sections.find((s) => s.id === sectionId);
    if (!section) return navigate('okruhy');
    if (state.browse?.sectionId !== sectionId) state.browse = { sectionId, query: '', filter: 'all', hideAnswers: state.browse?.hideAnswers ?? false };
    const s = sectionStats(sectionId);
    setScreen(
        `
        ${pushHeader(state.data.shortName(sectionId), 'okruhy')}
        <section class="section-hero">
            ${sectionIcon(sectionId)}
            <div>
                <p class="section-hero-title">${escapeHtml(section.name)}</p>
                <p class="muted small">${pluralize(s.total, 'otázka', 'otázky', 'otázok')} · ${s.mastered} zvládnutých</p>
            </div>
        </section>
        <div class="browse-tools">
            <label class="search">
                ${icon('search')}
                <span class="visually-hidden">Hľadať v otázkach okruhu</span>
                <input type="search" id="browse-search" placeholder="Hľadať v otázkach" autocomplete="off" enterkeyhint="search" value="${escapeHtml(state.browse.query)}" />
            </label>
            <div class="segmented" role="group" aria-label="Ktoré otázky zobraziť">
                ${BROWSE_FILTERS.map((f) => `<button class="segment" data-filter="${f.id}" aria-pressed="${f.id === state.browse.filter}">${f.label}</button>`).join('')}
            </div>
            <label class="switch-row">
                <span>Skryť odpovede</span>
                <input type="checkbox" role="switch" id="hide-answers" class="switch" ${state.browse.hideAnswers ? 'checked' : ''} />
            </label>
        </div>
        <p class="group-title" id="browse-count" aria-live="polite"></p>
        <ol class="browse-list" id="browse-list"></ol>`,
        { actionBar: `<div class="action-bar"><button class="button primary block" data-section="${sectionId}">${icon('play')} Precvičiť okruh</button></div>` },
    );
    renderBrowseList();
};

const viewMistakes = () => {
    const mistakes = state.data.questions.filter((q) => isMistake(state.progress.answers[q.id]));
    if (mistakes.length === 0) {
        setScreen(`
            ${pushHeader('Moje chyby', '')}
            <section class="empty-state">
                <span class="icon-tile tone-success large">${icon('check')}</span>
                <h2 class="card-title">Žiadne chyby</h2>
                <p class="muted">Otázky, na ktoré odpovieš zle, sa objavia tu. Zmiznú, keď ich dvakrát za sebou zodpovieš správne.</p>
                <button class="button secondary" data-action="practice-all">Precvičovať</button>
            </section>`);
        return;
    }
    setScreen(
        `
        ${pushHeader('Moje chyby', '')}
        <p class="muted intro">${pluralize(mistakes.length, 'otázka', 'otázky', 'otázok')} na opravu. Otázka odíde, keď ju dvakrát za sebou zodpovieš správne.</p>
        <ul class="list-group">
            ${mistakes
                .map(
                    (q) => `<li class="row static">
                        ${sectionIcon(q.section)}
                        <span class="row-body"><span class="row-title regular">${escapeHtml(q.text)}</span>
                        <span class="row-subtitle">${escapeHtml(state.data.shortName(q.section))}</span></span>
                    </li>`,
                )
                .join('')}
        </ul>`,
        { actionBar: `<div class="action-bar"><button class="button primary block" data-action="mistakes">${icon('play')} Opraviť chyby</button></div>` },
    );
};

const viewStats = () => {
    const overall = overallProgress();
    const exams = state.progress.exams;
    setScreen(`
        ${largeHeader('Štatistika')}
        <section class="stat-tiles">
            <div class="stat-tile"><strong>${overall.seen}</strong><span>videných</span></div>
            <div class="stat-tile"><strong>${overall.mastered}</strong><span>zvládnutých</span></div>
            <div class="stat-tile"><strong>${exams.filter((e) => e.passed).length}/${exams.length}</strong><span>testov spravených</span></div>
        </section>
        <h2 class="group-title">Okruhy</h2>
        <ul class="list-group">
            ${state.data.sections
                .map((section) => {
                    const s = sectionStats(section.id);
                    return `<li class="row static">
                        ${sectionIcon(section.id)}
                        <span class="row-body">
                            <span class="row-title">${escapeHtml(state.data.shortName(section.id))}</span>
                            <span class="row-subtitle">${s.mastered}/${s.total} zvládnutých<span class="meter" aria-hidden="true"><span style="width:${percent(s.mastered, s.total)}%"></span></span></span>
                        </span>
                        <span class="row-value">${s.accuracy == null ? '–' : `${s.accuracy} %`}<small>úspešnosť</small></span>
                    </li>`;
                })
                .join('')}
        </ul>
        <h2 class="group-title">Posledné ostré testy</h2>
        ${
            exams.length === 0
                ? '<p class="muted intro">Zatiaľ žiadny ostrý test.</p>'
                : `<ul class="list-group">${exams
                      .slice(0, 10)
                      .map(
                          (e) => `<li class="row static">
                            <span class="icon-tile tone-${e.passed ? 'success' : 'danger'}">${icon(e.passed ? 'check' : 'cross')}</span>
                            <span class="row-body"><span class="row-title">Test č. ${e.testNumber}</span>
                                <span class="row-subtitle">${new Date(e.at).toLocaleString('sk-SK', { dateStyle: 'medium', timeStyle: 'short' })}</span></span>
                            <span class="row-value">${e.points} b.<small>${e.passed ? 'spravený' : 'nespravený'}</small></span>
                        </li>`,
                      )
                      .join('')}</ul>`
        }`);
};

const testSetOption = (testSet, selected, name) => {
    const info = TEST_SET_INFO[testSet];
    const count = state.data.testSets[testSet].length;
    return `
        <label class="choice ${selected ? 'selected' : ''}">
            <input type="radio" name="${name}" value="${testSet}" ${selected ? 'checked' : ''} />
            <span class="icon-tile ${testSet === 'official' ? 'tone-2' : 'tone-primary'}" aria-hidden="true">${icon(testSet === 'official' ? 'exam' : 'shuffle')}</span>
            <span class="row-body">
                <span class="row-title">${escapeHtml(info.name)}</span>
                <span class="row-subtitle">${escapeHtml(info.description)}</span>
                <span class="choice-meta">${count} testov · ${state.data.questions.length} otázok</span>
            </span>
            <span class="choice-check" aria-hidden="true">${icon('check')}</span>
        </label>`;
};

const viewWelcome = () => {
    const preselected = state.welcomeChoice ?? null;
    setScreen(
        `
        <header class="large-header welcome-header">
            <span class="icon-tile tone-primary large" aria-hidden="true">${icon('s3')}</span>
            <h1>Vitaj vo Vodičáku B</h1>
            <p>Vyber si, s akými testami sa chceš pripravovať. Všetky otázky sú oficiálne od ministerstva vnútra.</p>
        </header>
        <fieldset class="choice-group">
            <legend class="group-title">Sada testov</legend>
            ${TEST_SETS.map((testSet) => testSetOption(testSet, preselected === testSet, 'welcome-set')).join('')}
        </fieldset>
        <p class="muted small center">Sadu zmeníš kedykoľvek v Nastaveniach. Každá sada má vlastný postup.</p>`,
        { actionBar: `<div class="action-bar"><button class="button primary block" data-action="confirm-set" ${preselected ? '' : 'disabled'}>Začať</button></div>` },
    );
};

const viewSettings = () => {
    setScreen(`
        ${pushHeader('Nastavenia', state.settingsReturn ?? '')}
        <fieldset class="choice-group">
            <legend class="group-title">Sada testov</legend>
            ${TEST_SETS.map((testSet) => testSetOption(testSet, state.settings.testSet === testSet, 'settings-set')).join('')}
        </fieldset>
        <p class="muted small">Každá sada má vlastný postup: odpovede, chyby, zvládnuté otázky aj výsledky testov sa ukladajú osobitne. Prepnutím nič nestratíš.</p>
        <h2 class="group-title">Postup sady „${escapeHtml(activeSetInfo().short)}“</h2>
        <ul class="list-group">
            <li><button class="row destructive" data-action="reset"><span class="row-body"><span class="row-title">${icon('trash')} Vymazať postup tejto sady</span></span></button></li>
        </ul>
        <p class="muted small center">Zdroj otázok: Ministerstvo vnútra SR, elektronické skúšobné testy.</p>`);
};

const refocusChoice = (name, value) => document.querySelector(`input[name="${name}"][value="${value}"]`)?.focus({ preventScroll: true });

const handleTestSetChange = (event) => {
    const { name, value } = event.target;
    if (name === 'welcome-set') {
        state.welcomeChoice = value;
        viewWelcome();
        return refocusChoice(name, value);
    }
    if (name !== 'settings-set' || value === state.settings.testSet) return;
    selectTestSet(value);
    showToast(`Prepnuté na ${TEST_SET_INFO[value].short}.`);
    viewSettings();
    refocusChoice(name, value);
};

const optionState = (session, item, optionIndex) => {
    const reveal = session.mode === 'practice' ? item.chosen !== null : session.submitted;
    if (!reveal) return item.chosen === optionIndex ? 'selected' : '';
    if (optionIndex === item.question.correct) return 'correct';
    return item.chosen === optionIndex ? 'wrong' : 'dimmed';
};

const optionMarker = (stateName, key) => {
    if (stateName === 'correct') return icon('check', 'Správna odpoveď');
    if (stateName === 'wrong') return icon('cross', 'Tvoja nesprávna odpoveď');
    return key;
};

const sessionTopBar = (session) => {
    const answered = scoreSession(session).answered;
    const trailing =
        session.mode === 'exam' && !session.submitted
            ? '<span class="timer" id="timer" role="timer" aria-live="off"></span>'
            : `<span class="session-score">${icon('check')} ${scoreSession(session).correct}</span>`;
    const progress = session.mode === 'exam' ? percent(answered, session.items.length) : percent(session.index + (session.items[session.index].chosen === null ? 0 : 1), session.items.length);
    return `
        <header class="session-bar">
            <div class="session-bar-row">
                <button class="icon-button" data-action="leave" aria-label="${session.submitted ? 'Zavrieť' : 'Ukončiť'}">${icon('close')}</button>
                <span class="session-title"><strong>${session.index + 1}</strong> / ${session.items.length}</span>
                ${trailing}
            </div>
            <div class="session-progress" role="progressbar" aria-label="Postup" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>
        </header>`;
};

const renderQuestion = (session, item) => {
    const locked = session.mode === 'practice' ? item.chosen !== null : session.submitted;
    const q = item.question;
    return `
        <article class="question" aria-labelledby="q-text">
            <p class="question-chip">${sectionIcon(q.section)}<span>${escapeHtml(state.data.shortName(q.section))} · ${pluralize(q.points, 'bod', 'body', 'bodov')}</span></p>
            <h2 id="q-text" class="question-text">${escapeHtml(q.text)}</h2>
            ${questionImage(q, 'Obrázok k otázke')}
            <div class="options" role="group" aria-label="Možnosti odpovede">
                ${item.optionOrder
                    .map((optionIndex, i) => {
                        const stateName = optionState(session, item, optionIndex);
                        return `<button class="option ${stateName}" data-option="${optionIndex}" ${locked ? 'aria-disabled="true"' : ''} aria-pressed="${item.chosen === optionIndex}">
                            <span class="option-key">${optionMarker(stateName, OPTION_KEYS[i])}</span>
                            <span class="option-text">${escapeHtml(q.options[optionIndex])}</span>
                        </button>`;
                    })
                    .join('')}
            </div>
        </article>`;
};

const practiceActionBar = (session, item) => {
    const isLast = session.index === session.items.length - 1;
    if (item.chosen === null) return '<div class="action-bar"><p class="action-hint">Vyber jednu odpoveď</p></div>';
    const correct = isCorrect(item);
    return `
        <div class="action-bar feedback ${correct ? 'success' : 'danger'}" role="alert">
            <p class="feedback-title">${icon(correct ? 'check' : 'cross')} ${correct ? 'Správne!' : 'Nesprávne'}</p>
            ${correct ? '' : `<p class="feedback-text">Správna odpoveď: ${escapeHtml(item.question.options[item.question.correct])}</p>`}
            <button class="button ${correct ? 'success' : 'danger'} block" data-action="next">${isLast ? 'Vyhodnotiť' : 'Pokračovať'}</button>
        </div>`;
};

const examActionBar = (session) => {
    const isLast = session.index === session.items.length - 1;
    const answered = scoreSession(session).answered;
    const forward = session.submitted
        ? `<button class="button secondary" data-action="next" ${isLast ? 'disabled' : ''} aria-label="Ďalšia otázka">${icon('next')}</button>`
        : isLast
          ? `<button class="button primary" data-action="submit">Odovzdať</button>`
          : `<button class="button primary" data-action="next" aria-label="Ďalšia otázka">Ďalej ${icon('next')}</button>`;
    return `
        <div class="action-bar exam-bar">
            <button class="button secondary" data-action="prev" ${session.index === 0 ? 'disabled' : ''} aria-label="Predchádzajúca otázka">${icon('back')}</button>
            <button class="button ghost overview-button" data-action="overview">${icon('grid')} ${session.submitted ? 'Prehľad' : `${answered}/${session.items.length}`}</button>
            ${forward}
        </div>`;
};

const updateTimer = () => {
    if (!examInProgress()) return stopTimer();
    const seconds = remainingSeconds(state.session);
    const el = document.getElementById('timer');
    if (el) {
        el.innerHTML = `${icon('clock')}<span>${formatTime(seconds)}</span>`;
        el.classList.toggle('urgent', seconds <= URGENT_SECONDS);
        el.setAttribute('aria-label', `Zostávajúci čas ${formatTime(seconds)}`);
    }
    if (seconds === 0) {
        showToast('Čas vypršal, test sa odovzdal.');
        submitExam();
    }
};

const viewSession = () => {
    const session = state.session;
    if (!session) return navigate('');
    const item = session.items[session.index];
    dom.main.innerHTML = `
        ${sessionTopBar(session)}
        <div class="screen session-screen">${renderQuestion(session, item)}</div>
        ${session.mode === 'exam' ? examActionBar(session) : practiceActionBar(session, item)}`;
    document.body.classList.add('has-action-bar');
    if (examInProgress() && !state.timer) state.timer = setInterval(updateTimer, 1000);
    if (examInProgress()) updateTimer();
};

const chooseOption = (optionIndex) => {
    const session = state.session;
    const item = session.items[session.index];
    if (session.submitted || (session.mode === 'practice' && item.chosen !== null)) return;
    item.chosen = optionIndex;
    if (session.mode === 'practice') {
        recordAnswer(state.progress, item.question.id, isCorrect(item));
        haptic(isCorrect(item) ? 10 : [30, 60, 30]);
    } else {
        haptic(8);
    }
    viewSession();
    if (session.mode === 'practice') document.querySelector('.action-bar [data-action="next"]')?.focus({ preventScroll: true });
};

const finishPractice = () => {
    const session = state.session;
    const score = scoreSession(session);
    state.result = { mode: 'practice', title: session.title, ...score, total: score.answered };
    session.submitted = true;
    navigate('vysledok');
};

const submitExam = () => {
    const session = state.session;
    if (!session || session.submitted) return;
    stopTimer();
    session.submitted = true;
    session.items.forEach((item) => recordAnswer(state.progress, item.question.id, isCorrect(item)));
    const score = scoreSession(session);
    const passed = score.points >= state.data.exam.passPoints;
    recordExam(state.progress, { testNumber: session.testNumber, points: score.points, passed });
    state.result = { mode: 'exam', title: session.title, passed, ...score, total: session.items.length };
    haptic(passed ? [20, 40, 20] : [60]);
    navigate('vysledok');
};

const confirmSubmit = async () => {
    const unanswered = state.session.items.length - scoreSession(state.session).answered;
    const confirmed = await confirmSheet({
        title: 'Odovzdať test?',
        message: unanswered ? `Nezodpovedal si ${pluralize(unanswered, 'otázku', 'otázky', 'otázok')}. Nezodpovedané sa rátajú ako nesprávne.` : 'Zodpovedal si všetky otázky.',
        confirmLabel: 'Odovzdať',
        cancelLabel: 'Pokračovať v teste',
    });
    if (confirmed) submitExam();
};

const openOverview = async () => {
    const session = state.session;
    const cells = session.items
        .map((item, i) => {
            const status = session.submitted ? (isCorrect(item) ? 'correct' : 'wrong') : item.chosen !== null ? 'answered' : '';
            const label = `Otázka ${i + 1}${session.submitted ? (isCorrect(item) ? ', správne' : ', nesprávne') : item.chosen !== null ? ', zodpovedaná' : ', nezodpovedaná'}`;
            return `<button class="grid-cell ${status}" data-sheet-result="${i}" ${i === session.index ? 'aria-current="step"' : ''} aria-label="${label}">${i + 1}</button>`;
        })
        .join('');
    const choice = await openSheet({
        title: session.submitted ? 'Prehľad odpovedí' : `Zodpovedané ${scoreSession(session).answered} z ${session.items.length}`,
        body: `<div class="question-grid">${cells}</div>`,
        actions: session.submitted ? [{ label: 'Zavrieť', value: null, variant: 'secondary' }] : [{ label: 'Odovzdať test', value: 'submit', variant: 'primary' }],
    });
    if (choice === 'submit') return confirmSubmit();
    if (choice !== null && choice !== undefined) {
        session.index = Number(choice);
        viewSession();
    }
};

const leaveSession = async () => {
    const session = state.session;
    if (session?.submitted) return navigate(session.mode === 'exam' || state.result ? 'vysledok' : '');
    if (examInProgress()) {
        const confirmed = await confirmSheet({
            title: 'Ukončiť test?',
            message: 'Rozpracovaný test sa nezapočíta a odpovede sa stratia.',
            confirmLabel: 'Ukončiť test',
            cancelLabel: 'Pokračovať',
            danger: true,
        });
        if (!confirmed) return;
    }
    const answered = session ? scoreSession(session).answered : 0;
    if (session?.mode === 'practice' && answered > 0) return finishPractice();
    state.session = null;
    navigate(session?.origin?.sectionId ? `prehlad/${session.origin.sectionId}` : '');
};

const viewResult = () => {
    const result = state.result;
    if (!result || !state.session) return navigate('');
    const session = state.session;
    const isExam = result.mode === 'exam';
    const wrongItems = session.items.map((item, index) => ({ item, index })).filter(({ item }) => !isCorrect(item));
    const tone = isExam ? (result.passed ? 'success' : 'danger') : result.correct === result.total ? 'success' : 'primary';
    const value = isExam ? result.points : result.correct;
    const max = isExam ? result.maxPoints : result.total;
    setScreen(
        `
        <header class="top-bar">
            <button class="icon-button" data-nav="" aria-label="Zavrieť">${icon('close')}</button>
            <h1 class="top-bar-title">${escapeHtml(result.title)}</h1>
            <span class="icon-button-spacer" aria-hidden="true"></span>
        </header>
        <section class="result-hero tone-${tone}">
            ${ring(value, max, `${value} z ${max}`)}
            <h2 class="result-title">${isExam ? (result.passed ? 'Test si spravil!' : 'Test si nespravil') : result.correct === result.total ? 'Bez chyby!' : 'Dobrá práca'}</h2>
            <p class="result-score"><strong>${value}</strong> / ${max} ${isExam ? 'bodov' : 'správne'}</p>
            ${isExam ? `<p class="muted small">Na úspech treba ${state.data.exam.passPoints} bodov · správne ${result.correct} z ${result.total}</p>` : ''}
        </section>
        ${
            wrongItems.length
                ? `<h2 class="group-title">Nesprávne zodpovedané (${wrongItems.length})</h2>
                   <ul class="list-group">${wrongItems
                       .map(
                           ({ item, index }) => `<li><button class="row review-row" data-review="${index}">
                                <span class="row-body">
                                    <span class="row-subtitle">Otázka ${index + 1}</span>
                                    <span class="row-title regular">${escapeHtml(item.question.text)}</span>
                                    <span class="answer wrong">${icon('cross', 'Tvoja odpoveď')}<span>${item.chosen === null ? 'bez odpovede' : escapeHtml(item.question.options[item.chosen])}</span></span>
                                    <span class="answer correct">${icon('check', 'Správna odpoveď')}<span>${escapeHtml(item.question.options[item.question.correct])}</span></span>
                                </span>
                                <span class="row-trailing">${icon('next')}</span>
                            </button></li>`,
                       )
                       .join('')}</ul>`
                : ''
        }`,
        {
            actionBar: `<div class="action-bar stacked">
                ${isExam ? `<button class="button primary block" data-action="exam">Ďalší test</button>` : `<button class="button primary block" data-action="practice-again">Ďalších ${PRACTICE_BATCH} otázok</button>`}
                ${wrongItems.length ? `<button class="button ghost block" data-action="mistakes">Opraviť chyby</button>` : ''}
            </div>`,
        },
    );
};

const ROUTES = {
    '': viewHome,
    testy: viewTests,
    okruhy: viewSections,
    statistika: viewStats,
    chyby: viewMistakes,
    prehlad: (param) => viewBrowse(Number(param)),
    relacia: viewSession,
    vysledok: viewResult,
    nastavenia: viewSettings,
    vitaj: viewWelcome,
};

const render = () => {
    if (!state.settings.testSet && routeParts().name !== 'vitaj') return redirect('vitaj');
    if (state.settings.testSet && routeParts().name === 'vitaj') return redirect('');
    const { name, param } = routeParts();
    if (name === 'nastavenia' && routeParts(state.route ?? '').name !== 'nastavenia') state.settingsReturn = state.route ?? '';
    if (name !== 'relacia') stopTimer();
    state.route = currentRoute();
    renderTabBar(TAB_ROUTES.includes(name));
    (ROUTES[name] ?? viewHome)(param);
    dom.main.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
};

const onHashChange = async () => {
    const leavingRunningExam = routeParts(state.route ?? '').name === 'relacia' && examInProgress() && routeParts().name !== 'vysledok';
    if (!leavingRunningExam) return render();
    const target = currentRoute();
    history.replaceState(null, '', '#/relacia');
    const confirmed = await confirmSheet({
        title: 'Ukončiť test?',
        message: 'Rozpracovaný test sa nezapočíta a odpovede sa stratia.',
        confirmLabel: 'Ukončiť test',
        cancelLabel: 'Pokračovať',
        danger: true,
    });
    if (!confirmed) return;
    state.session = null;
    stopTimer();
    location.hash = `#/${target}`;
};

const ACTIONS = {
    exam: () => startExam(null),
    'practice-all': () => startSectionPractice(0),
    'practice-again': () => startSectionPractice(state.session?.origin?.sectionId ?? 0),
    mistakes: startMistakesPractice,
    submit: confirmSubmit,
    overview: openOverview,
    leave: leaveSession,
    prev: () => {
        state.session.index -= 1;
        viewSession();
    },
    next: () => {
        const session = state.session;
        if (session.mode === 'practice' && session.index === session.items.length - 1) return finishPractice();
        session.index = Math.min(session.index + 1, session.items.length - 1);
        viewSession();
        window.scrollTo({ top: 0 });
    },
    reset: async () => {
        const confirmed = await confirmSheet({
            title: 'Vymazať postup?',
            message: `Zmažú sa odpovede, chyby a výsledky testov sady ${activeSetInfo().short}. Druhá sada zostane nedotknutá. Toto sa nedá vrátiť.`,
            confirmLabel: 'Vymazať',
            danger: true,
        });
        if (!confirmed) return;
        resetProgress(state.progress);
        showToast(`Postup sady ${activeSetInfo().short} bol vymazaný.`);
        viewSettings();
    },
    'confirm-set': () => {
        if (!state.welcomeChoice) return;
        selectTestSet(state.welcomeChoice);
        state.welcomeChoice = null;
        redirect('');
    },
};

const handleClick = (event) => {
    if (event.target.closest('#sheet-root')) return;
    const target = event.target.closest('button, a');
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    const { action, nav, exam, section, option, review, filter } = target.dataset;

    if (nav !== undefined) return navigate(nav);
    if (filter !== undefined) {
        state.browse.filter = filter;
        return renderBrowseList();
    }
    if (exam !== undefined) return startExam(Number(exam));
    if (section !== undefined) return startSectionPractice(Number(section));
    if (option !== undefined) return chooseOption(Number(option));
    if (review !== undefined) {
        state.session.index = Number(review);
        return navigate('relacia');
    }
    ACTIONS[action]?.();
};

const handleKey = (event) => {
    if (dom.sheetRoot.childElementCount || routeParts().name !== 'relacia' || !state.session) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const session = state.session;
    const item = session.items[session.index];
    const letterIndex = OPTION_KEYS.indexOf(event.key.toUpperCase());
    const digitIndex = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
    const position = letterIndex >= 0 ? letterIndex : digitIndex;
    if (position >= 0 && position < item.optionOrder.length) {
        event.preventDefault();
        return chooseOption(item.optionOrder[position]);
    }
    const clickIfEnabled = (selector) => {
        const button = document.querySelector(`${selector}:not([disabled])`);
        if (!button) return;
        event.preventDefault();
        button.click();
    };
    if (event.key === 'ArrowRight') clickIfEnabled('.action-bar [data-action="next"]');
    if (event.key === 'ArrowLeft') clickIfEnabled('.action-bar [data-action="prev"]');
    if (event.key === 'Escape') ACTIONS.leave();
};

const handleBrowseInput = (event) => {
    if (!state.browse) return;
    if (event.target.id === 'hide-answers' && event.type === 'change') {
        state.browse.hideAnswers = event.target.checked;
        renderBrowseList();
    }
    if (event.target.id === 'browse-search' && event.type === 'input') {
        state.browse.query = event.target.value;
        clearTimeout(handleBrowseInput.handle);
        handleBrowseInput.handle = setTimeout(renderBrowseList, SEARCH_DEBOUNCE_MS);
    }
};

const start = async () => {
    try {
        state.data = await loadData();
    } catch (error) {
        dom.main.innerHTML = `<section class="empty-state"><h2 class="card-title">Otázky sa nenačítali</h2><p class="muted">${escapeHtml(error.message)}</p>
            <button class="button primary" onclick="location.reload()">Skúsiť znova</button></section>`;
        return;
    }
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('input', handleBrowseInput);
    document.addEventListener('change', handleBrowseInput);
    document.addEventListener('change', handleTestSetChange);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('beforeunload', (event) => {
        if (examInProgress()) event.preventDefault();
    });
    render();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
};

start();
