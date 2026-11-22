import { handleHeroSwap } from '../../lib/hero-swap-prediction.js'
import eventHandler from '../event-handler'

eventHandler.registerEvent('hero:name', { handler: handleHeroSwap })
