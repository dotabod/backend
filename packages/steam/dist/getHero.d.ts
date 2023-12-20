import heroes from './heroes.js';
export type HeroNames = keyof typeof heroes;
export default function handleGetHero(name?: HeroNames): {
    id: number;
    localized_name: string;
    alias: string[];
} | null;
//# sourceMappingURL=getHero.d.ts.map