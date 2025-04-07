# Close bets logic

1. Map win team GSI game event. This triggers when the ancient is destroyed and the streamer waits for the ancient to go to 0.

This wont get triggered if they click disconnect and dont wait for the ancient to go to 0

```ts
eventHandler.registerEvent('map:win_team', {
  handler: async (dotaClient, winningTeam: 'radiant' | 'dire') => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    await dotaClient.closeBets(winningTeam)
  },
})
```

2. On total game client disconnection of a server (match)

```ts
this.emitBlockEvent({ state, blockType: null })
await this.closeBets()
```

When closeBets is called without a winning team parameter, it invokes the checkEarlyDCWinner function.
This function makes an API request to OpenDota to determine if the match has concluded.
There is retry logic in case the API call fails. It retries every 30 seconds up to 6 times.
Upon confirmation that the match is complete, it calls closeBets again, this time specifying the winning team.

When they disconnect, it could just mean they're restarting their game client. They might reconnect to the server and continue the match.

Not only should we check if the match is complete, but we should also check if the streamer will rejoin the match by comparing match id of current GSI with the match id of the parameter passed to closeBets.
