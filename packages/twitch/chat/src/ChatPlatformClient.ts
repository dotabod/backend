/**
 * Abstract class to define a standard interface for chat platform clients.
 * This will ensure that all chat platform clients have a consistent interface.
 */
export default class ChatPlatformClient {
  /**
   * Connect to the chat platform.
   */
  async connect() {
    throw new Error('connect method must be implemented')
  }

  /**
   * Send a message to a specified channel.
   * @param {string} channel - The channel to send the message to.
   * @param {string} message - The message to send.
   */
  async say(channel, message) {
    throw new Error('say method must be implemented')
  }

  /**
   * Join a specific channel.
   * @param {string} channel - The channel to join.
   */
  async join(channel) {
    throw new Error('join method must be implemented')
  }

  /**
   * Leave a specific channel.
   * @param {string} channel - The channel to leave.
   */
  async part(channel) {
    throw new Error('part method must be implemented')
  }

  /**
   * Handle incoming messages.
   * This method should be overridden to handle messages in a platform-specific way.
   * @param {function} callback - The callback function to handle messages.
   */
  onMessage(callback) {
    throw new Error('onMessage method must be implemented')
  }
}
