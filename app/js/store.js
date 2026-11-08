const PROGRESS_KEY_PREFIX = 'vodicak-b:v1';
const LEGACY_PROGRESS_KEY = 'vodicak-b:v1';
const SETTINGS_KEY = 'vodicak-b:settings';
const MASTERED_STREAK = 2;
const EXAM_HISTORY_LIMIT = 50;

export const TEST_SETS = ['official', 'custom'];

const emptyProgress = () => ({ answers: {}, bestByTest: {}, exams: [] });

const readJson = (key) => {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch {
        return null;
    }
};

const progressKey = (testSet) => `${PROGRESS_KEY_PREFIX}:${testSet}`;

const migrateLegacyProgress = () => {
    const legacy = readJson(LEGACY_PROGRESS_KEY);
    if (!legacy) return;
    if (!localStorage.getItem(progressKey('official'))) localStorage.setItem(progressKey('official'), JSON.stringify(legacy));
    localStorage.removeItem(LEGACY_PROGRESS_KEY);
    if (!readJson(SETTINGS_KEY)?.testSet) saveSettings({ testSet: 'official' });
};

export const saveSettings = (settings) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

export const loadSettings = () => {
    migrateLegacyProgress();
    const settings = readJson(SETTINGS_KEY) ?? {};
    return { testSet: TEST_SETS.includes(settings.testSet) ? settings.testSet : null };
};

export const loadProgress = (testSet) => ({ ...emptyProgress(), ...readJson(progressKey(testSet)), testSet });

const save = (progress) => {
    const { testSet, ...stored } = progress;
    localStorage.setItem(progressKey(testSet), JSON.stringify(stored));
};

export const recordAnswer = (progress, questionId, correct) => {
    const stat = progress.answers[questionId] ?? { right: 0, wrong: 0, streak: 0 };
    progress.answers[questionId] = correct
        ? { ...stat, right: stat.right + 1, streak: stat.streak + 1 }
        : { ...stat, wrong: stat.wrong + 1, streak: 0 };
    save(progress);
};

export const recordExam = (progress, { testNumber, points, passed }) => {
    progress.exams = [{ at: new Date().toISOString(), testNumber, points, passed }, ...progress.exams].slice(0, EXAM_HISTORY_LIMIT);
    if (testNumber != null) progress.bestByTest[testNumber] = Math.max(points, progress.bestByTest[testNumber] ?? 0);
    save(progress);
};

export const resetProgress = (progress) => {
    Object.assign(progress, emptyProgress());
    save(progress);
};

export const isMastered = (stat) => Boolean(stat) && stat.streak >= MASTERED_STREAK;
export const isMistake = (stat) => Boolean(stat) && stat.wrong > 0 && stat.streak < MASTERED_STREAK;
