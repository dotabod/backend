import heroes from './heroes.js';
export default function handleGetHero(name) {
    if (!name || typeof name !== 'string' || name.length < 3)
        return null;
    return heroes[name];
}
//# sourceMappingURL=getHero.js.map