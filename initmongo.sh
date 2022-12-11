db.delayedGames.createIndex({ 'match.match_id': 1 });
db.delayedGames.createIndex({ 'teams.players.accountid': 1 });
db.delayedGames.createIndex({ createdAt: -1 }, { expireAfterSeconds: 604800 });