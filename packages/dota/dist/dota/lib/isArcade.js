export function isArcade(gsi) {
    if (!gsi)
        return false;
    return gsi.map?.customgamename !== '' && gsi.map?.customgamename !== undefined;
}
//# sourceMappingURL=isArcade.js.map