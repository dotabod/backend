export const CooldownManager = {
  // 30 seconds
  cooldownTime: 15 * 1000,
  store: new Map<string, number>(),

  canUse: function (channel: string, commandName: string) {
    // Check if the last time you've used the command + 30 seconds has passed
    // (because the value is less then the current time)
    if (!this.store.has(`${channel}.${commandName}`)) return true

    return (
      (this.store.get(`${channel}.${commandName}`) ?? Date.now()) + this.cooldownTime < Date.now()
    )
  },

  touch: function (channel: string, commandName: string) {
    // Store the current timestamp in the store based on the current commandName
    this.store.set(`${channel}.${commandName}`, Date.now())
  },
}
