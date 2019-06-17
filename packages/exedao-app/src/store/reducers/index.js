import { combineReducers } from 'redux'
import wallet from './wallet'
import web3 from './web3'
import exedao from './exedao'

export default combineReducers({
  wallet,
  web3,
  exedao
})
