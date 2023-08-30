import axios from 'axios'

import { DotaEvent, DotaEventTypes } from '../../../../types.js'
import { events } from '../../../globalEventEmitter.js'
import { say } from '../../../say.js'

jest.mock('../../../say.js')

// Set base URL for axios, assuming your API runs on localhost:81
const apiClient = axios.create({
  baseURL: 'http://localhost:81',
})

describe('API tests', () => {
  it('should respond correctly to POST request', async () => {
    // Your POST request data
    const postData = {
      key1: 'value1',
      key2: 'value2',
    }

    // Make a POST request
    const response = await apiClient.post('/', postData)

    events.emit(
      `event:${DotaEventTypes.AegisDenied}`,
      {
        event_type: DotaEventTypes.AegisDenied,
        player_id: 1,
        game_time: 50,
      } as DotaEvent,
      'some_token',
    )

    // Your assertions here
    expect(response.status).toBe(200)

    // Run your assertions
    expect(say).toHaveBeenCalled()
  })
})
