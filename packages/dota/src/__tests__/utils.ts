import { spyOn } from 'bun:test'
import axios from 'axios'
import { chatClient } from '../twitch/chatClient'

export const apiClient = axios.create({
  baseURL: 'http://localhost:5120',
})
export const twitchChatSpy = spyOn(chatClient, 'say')
