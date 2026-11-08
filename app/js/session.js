import { isMistake } from './store.js';

export const shuffle = (items) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};

export const createSession = ({ mode, title, questions, shuffleOptions = false, testNumber = null, timeLimitSeconds = null }) => ({
    mode,
    title,
    testNumber,
    timeLimitSeconds,
    startedAt: Date.now(),
    index: 0,
    submitted: false,
    items: questions.map((question) => {
        const order = question.options.map((_, i) => i);
        return { question, optionOrder: shuffleOptions ? shuffle(order) : order, chosen: null };
    }),
});

export const isCorrect = (item) => item.chosen === item.question.correct;

export const scoreSession = (session) =>
    session.items.reduce(
        (total, item) => ({
            points: total.points + (isCorrect(item) ? item.question.points : 0),
            maxPoints: total.maxPoints + item.question.points,
            correct: total.correct + (isCorrect(item) ? 1 : 0),
            answered: total.answered + (item.chosen === null ? 0 : 1),
        }),
        { points: 0, maxPoints: 0, correct: 0, answered: 0 },
    );

export const remainingSeconds = (session, now = Date.now()) =>
    session.timeLimitSeconds == null ? null : Math.max(0, session.timeLimitSeconds - Math.floor((now - session.startedAt) / 1000));

const practicePriority = (question, progress) => {
    const stat = progress.answers[question.id];
    if (!stat) return 0;
    return isMistake(stat) ? 1 : 2;
};

export const practiceQueue = (questions, progress, size) =>
    shuffle(questions)
        .sort((a, b) => practicePriority(a, progress) - practicePriority(b, progress))
        .slice(0, size);
