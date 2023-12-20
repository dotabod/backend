export function isSpectator(gsi) {
    if (!gsi)
        return false;
    return gsi.player?.team_name === 'spectator' || 'team2' in (gsi.player ?? {});
}
//# sourceMappingURL=isSpectator.js.map