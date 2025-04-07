import { jest } from '@jest/globals'
import axios from 'axios'
import { chatClient } from '../twitch/chatClient.js'

export const apiClient = axios.create({
  baseURL: 'http://localhost:5120',
})
export const twitchChatSpy = jest.spyOn(chatClient, 'say')
