const SHORT_NAMES = {
    1: 'Pravidlá premávky',
    2: 'Prednosť a rýchlosť',
    3: 'Dopravné značky',
    4: 'Križovatky',
    5: 'Dopravná nehoda',
    6: 'Vedenie vozidla',
    7: 'Doklady a čas v doprave',
    8: 'Prevádzka vozidiel',
    9: 'Bezpečná jazda',
    10: 'Konštrukcia a údržba',
};

export const TEST_SET_INFO = {
    official: {
        name: 'Oficiálne testy MV SR',
        short: 'Oficiálne testy',
        description: '100 testov presne tak, ako ich zostavilo ministerstvo vnútra.',
    },
    custom: {
        name: 'Naše testy',
        short: 'Naše testy',
        description: '50 testov, v ktorých sú všetky otázky. Každý test má zloženie ako ostrá skúška.',
    },
};

const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Nepodarilo sa načítať ${url} (HTTP ${response.status}).`);
    return response.json();
};

export const loadData = async () => {
    const [data, customTests] = await Promise.all([fetchJson('data/questions.json'), fetchJson('data/custom-tests.json')]);
    return {
        ...data,
        testSets: { official: data.tests, custom: customTests },
        byId: new Map(data.questions.map((question) => [question.id, question])),
        sectionName: (id) => data.sections.find((section) => section.id === id)?.name ?? `Okruh ${id}`,
        shortName: (id) => SHORT_NAMES[id] ?? `Okruh ${id}`,
    };
};
