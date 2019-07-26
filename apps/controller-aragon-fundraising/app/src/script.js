import Aragon, { events } from '@aragon/api'
import { zip } from 'rxjs'
import { first } from 'rxjs/operators'
// import { addressesEqual } from './utils/web3'
import { tokenDataFallback, getTokenSymbol, getTokenName } from './lib/token-utils'
import poolAbi from './abi/Pool.json'
import tapAbi from './abi/Tap.json'
import marketMakerAbi from './abi/BancorMarketMaker.json'
import miniMeTokenAbi from './abi/MiniMeToken.json'
import tokenDecimalsAbi from './abi/token-decimals.json'
import tokenNameAbi from './abi/token-name.json'
import tokenSymbolAbi from './abi/token-symbol.json'
import { retryEvery } from './utils/bg-utils'
import { Order } from './constants'

// abis used to call decimals, name and symbol on a token
const tokenAbi = [].concat(tokenDecimalsAbi, tokenNameAbi, tokenSymbolAbi)

// Maps to maintain relationship between an address and a contract and its related data.
// It avoids redundants calls to the blockchain
const tokenContracts = new Map() // Addr -> External contract
const tokenDecimals = new Map() // External contract -> decimals
const tokenNames = new Map() // External contract -> name
const tokenSymbols = new Map() // External contract -> symbol

// bootstrap the Aragon API
const app = new Aragon()

// get the token address to initialize ourselves
const externals = zip(app.call('reserve'), app.call('tap'), app.call('marketMaker'))
retryEvery(retry => {
  externals.subscribe(
    ([poolAddress, tapAddress, marketMakerAddress]) => initialize(poolAddress, tapAddress, marketMakerAddress),
    err => {
      console.error('Could not start background script execution due to the contract not loading external contract addresses:', err)
      retry()
    }
  )
})

const initialize = async (poolAddress, tapAddress, marketMakerAddress) => {
  // get external smart contracts to listen to their events
  const marketMakerContract = app.external(marketMakerAddress, marketMakerAbi)
  const tapContract = app.external(tapAddress, tapAbi)
  const poolContract = app.external(poolAddress, poolAbi)

  // get network characteristics
  const network = await app
    .network()
    .pipe(first())
    .toPromise()

  // some settings used by subsequent calls
  const settings = {
    network,
    marketMaker: {
      address: marketMakerAddress,
      contract: marketMakerContract,
    },
    tap: {
      address: tapAddress,
      contract: tapContract,
    },
    pool: {
      address: poolAddress,
      contract: poolContract,
    },
  }

  // init the aragon API store
  // first param is a function handling blockchain events and updating the store'state accordingly
  // second param is an object with a way to get the initial state (cached one, in the client's IndexedDB)
  // and the external contracts on which we want to listen events
  return app.store(
    async (state, evt) => {
      // prepare the next state from the current one
      const nextState = {
        ...state,
      }
      // console.log('#########################')
      // console.log(evt.event)
      // console.log(evt)
      // console.log('#########################')
      const { event, returnValues, blockNumber, transactionHash } = evt
      switch (event) {
        // handle account changes events
        case events.ACCOUNTS_TRIGGER:
          return updateConnectedAccount(nextState, returnValues)
        // app is syncing
        case events.SYNC_STATUS_SYNCING:
          return { ...nextState, isSyncing: true }
        // done syncing
        case events.SYNC_STATUS_SYNCED:
          return { ...nextState, isSyncing: false }
        /***********************
         * Fundraising events
         ***********************/
        case 'AddCollateralToken':
          return addCollateralToken(nextState, returnValues, settings)
        case 'UpdateCollateralToken':
          return updateCollateralToken(nextState, returnValues, settings)
        case 'RemoveCollateralToken':
          return removeCollateralToken(nextState, returnValues)
        case 'AddTokenTap':
          return addTokenTap(nextState, returnValues)
        case 'NewBuyOrder':
        case 'NewSellOrder':
          return newOrder(nextState, returnValues, blockNumber, transactionHash)
        case 'ClearBatch':
          return clearBatch(nextState, returnValues)
        case 'ReturnBuy':
        case 'ReturnSell':
          return returnEvent(nextState, returnValues)
        default:
          return nextState
      }
    },
    {
      init: initState(settings),
      externals: [marketMakerContract, tapContract, poolContract].map(c => ({ contract: c })),
    }
  )
}

/**
 * Merges the initial state with the cached one (in the client's IndexedDB))
 * @param {Object} settings - the settings needed to access external contracts data
 * @returns {Object} a merged state between the cached one and data coming from external contracts
 */
const initState = settings => async cachedState => {
  const newState = {
    ...cachedState,
    isSyncing: true,
    connectedAccount: null,
    addresses: {
      marketMaker: settings.marketMaker.address,
      tap: settings.tap.address,
      pool: settings.pool.address,
    },
  }
  const withTapData = await loadTapData(newState, settings)
  const withPoolData = await loadPoolData(withTapData, settings)
  const withMarketMakerData = await loadMarketMakerData(withPoolData, settings)
  return withMarketMakerData
}

/**
 * Loads relevant data related to the TAP smart contract
 * @param {Object} state - the current store's state
 * @param {Object} settings - the settings needed to access external contracts data
 * @returns {Object} the current store's state augmented with the smart contract data
 */
const loadTapData = async (state, settings) => {
  const maxMonthlyTapIncreasePct = await settings.tap.contract.maxMonthlyTapIncreasePct().toPromise()
  const pctBase = await settings.tap.contract.PCT_BASE().toPromise()
  return {
    ...state,
    beneficiary: await settings.tap.contract.beneficiary().toPromise(),
    maxMonthlyTapIncrease: maxMonthlyTapIncreasePct / pctBase,
  }
}

/**
 * Loads relevant data related to the POOL smart contract
 * @param {Object} state - the current store's state
 * @param {Object} settings - the settings needed to access external contracts data
 * @returns {Object} the current store's state augmented with the smart contract data
 */
const loadPoolData = async (state, settings) => {
  return {
    ...state,
    collateralTokensLength: await settings.pool.contract.collateralTokensLength().toPromise(),
  }
}

/**
 * Loads relevant data related to the MARKET MAKER smart contract
 * @param {Object} state - the current store's state
 * @param {Object} settings - the settings needed to access external contracts data
 * @returns {Object} the current store's state augmented with the smart contract data
 */
const loadMarketMakerData = async (state, settings) => {
  const bondedToken = await settings.marketMaker.contract.token().toPromise()
  const bondedTokenContract = app.external(bondedToken, miniMeTokenAbi)
  // loads data related to the bonded token
  const [totalSupply, decimals, name, symbol] = await Promise.all([
    bondedTokenContract.totalSupply().toPromise(),
    bondedTokenContract.decimals().toPromise(),
    bondedTokenContract.name().toPromise(),
    bondedTokenContract.symbol().toPromise(),
  ])
  return {
    ...state,
    ppm: await settings.marketMaker.contract.PPM().toPromise(),
    bondedToken: {
      address: bondedToken,
      totalSupply,
      decimals,
      name,
      symbol,
    },
  }
}

/***********************
 *                     *
 *   Event Handlers    *
 *                     *
 ***********************/

const updateConnectedAccount = (state, { account }) => {
  // TODO: handle account change ?
  return {
    ...state,
    connectedAccount: account,
  }
}

const addCollateralToken = async (state, { collateralToken, virtualSupply, virtualBalance, reserveRatio }, settings) => {
  // TODO: check MM and Pool collateralTokens are the same
  // if collateralToken is defined, it means it's an event coming from the market maker contract
  // else it's coming from the pool contract, and token is defined

  // only handle market maker events
  if (!collateralToken) return state
  const collateralTokens = state.collateralTokens || new Map()

  // find the corresponding contract in the in memory map or get the external
  const tokenContract = tokenContracts.has(collateralToken) ? tokenContracts.get(collateralToken) : app.external(collateralToken, tokenAbi)
  tokenContracts.set(collateralToken, tokenContract)

  // loads data related to the collateral token
  const [balance, decimals, name, symbol] = await Promise.all([
    loadTokenBalance(collateralToken, settings),
    loadTokenDecimals(tokenContract, collateralToken, settings),
    loadTokenName(tokenContract, collateralToken, settings),
    loadTokenSymbol(tokenContract, collateralToken, settings),
  ])
  collateralTokens.set(collateralToken, {
    balance,
    decimals,
    name,
    symbol,
    virtualSupply,
    virtualBalance,
    reserveRatio,
  })

  return {
    ...state,
    collateralTokens,
  }
}

const updateCollateralToken = (state, { collateralToken, virtualSupply, virtualBalance, reserveRatio }, settings) => {
  if (!collateralToken) return state
  if (state.collateralTokens.has(collateralToken)) {
    // update the collateral token
    state.collateralTokens.set(collateralToken, {
      ...state.collateralTokens.get(collateralToken),
      virtualSupply,
      virtualBalance,
      reserveRatio,
    })
  } else console.error('Collateral not found!')
  return state
}

const removeCollateralToken = (state, { token }) => {
  // find the corresponding contract in the in memory map or get the external
  const tokenContract = tokenContracts.has(token) ? tokenContracts.get(token) : app.external(token, tokenAbi)
  // remove all data related to this token
  tokenContracts.delete(token)
  tokenDecimals.delete(tokenContract)
  tokenNames.delete(tokenContract)
  tokenSymbols.delete(tokenContract)
  state.collateralTokens.delete(token)
  return state
}

const addTokenTap = (state, { token, tap }) => {
  const taps = state.taps || new Map()
  taps.set(token, parseInt(tap, 10))
  return {
    ...state,
    taps,
  }
}

// TODO: amount or value? standardize it between buy and sell events?
const newOrder = async (state, { buyer, seller, collateralToken, batchId, value, amount }, blockNumber, transactionHash) => {
  const orders = state.orders || new Map()
  const timestamp = await loadTimestamp(blockNumber)
  orders.set(transactionHash, {
    address: buyer || seller,
    collateralToken,
    amount: value || amount,
    batchId,
    timestamp,
    type: buyer ? Order.Type.BUY : Order.Type.SELL,
  })
  return {
    ...state,
    orders,
  }
}

const clearBatch = (state, { batchId, collateralToken }) => {
  const clearedBatches = state.clearedBatches || []
  clearedBatches.push({ batchId, collateralToken })
  return {
    ...state,
    clearedBatches,
  }
}

const returnEvent = (state, { buyer, seller, collateralToken, batchId, value, amount }) => {
  const returns = state.returns || []
  returns.push({
    address: buyer || seller,
    collateralToken,
    amount: value || amount,
    batchId,
    type: buyer ? Order.Type.BUY : Order.Type.SELL,
  })
  return {
    ...state,
    returns,
  }
}

/***********************
 *                     *
 *       Helpers       *
 *                     *
 ***********************/

/**
 * Get the current balance of a given token address
 * @param {String} tokenAddress - the given token address
 * @param {Object} settings - the settings where the pool contract is
 * @returns {String} a promise that resolves the balance
 */
const loadTokenBalance = (tokenAddress, { pool }) => {
  return pool.contract.balance(tokenAddress).toPromise()
}

/**
 * Get the decimals of a given token contract
 * @param {String} tokenContract - token contract
 * @param {String} tokenAddress - token address
 * @param {Object} settings - settings object where the network details are
 * @returns {String} the decimals or a fallback (decimals are optional)
 */
const loadTokenDecimals = async (tokenContract, tokenAddress, { network }) => {
  if (tokenDecimals.has(tokenContract)) {
    return tokenDecimals.get(tokenContract)
  }

  const fallback = tokenDataFallback(tokenAddress, 'decimals', network.type) || '0'

  let decimals
  try {
    decimals = (await tokenContract.decimals().toPromise()) || fallback
    tokenDecimals.set(tokenContract, decimals)
  } catch (err) {
    // decimals is optional
    decimals = fallback
  }
  return decimals
}

/**
 * Get the name of a given token contract
 * @param {String} tokenContract - token contract
 * @param {String} tokenAddress - token address
 * @param {Object} settings - settings object where the network details are
 * @returns {String} the name or a fallback (name is optional)
 */
const loadTokenName = async (tokenContract, tokenAddress, { network }) => {
  if (tokenNames.has(tokenContract)) {
    return tokenNames.get(tokenContract)
  }
  const fallback = tokenDataFallback(tokenAddress, 'name', network.type) || ''

  let name
  try {
    name = (await getTokenName(app, tokenAddress)) || fallback
    tokenNames.set(tokenContract, name)
  } catch (err) {
    // name is optional
    name = fallback
  }
  return name
}

/**
 * Get the symbol of a given token contract
 * @param {String} tokenContract - token contract
 * @param {String} tokenAddress - token address
 * @param {Object} settings - settings object where the network details are
 * @returns {String} the symbol or a fallback (symbol is optional)
 */
const loadTokenSymbol = async (tokenContract, tokenAddress, { network }) => {
  if (tokenSymbols.has(tokenContract)) {
    return tokenSymbols.get(tokenContract)
  }
  const fallback = tokenDataFallback(tokenAddress, 'symbol', network.type) || ''

  let symbol
  try {
    symbol = (await getTokenSymbol(app, tokenAddress)) || fallback
    tokenSymbols.set(tokenContract, symbol)
  } catch (err) {
    // symbol is optional
    symbol = fallback
  }
  return symbol
}

/**
 * Gets the timestamp of the given block
 * @param {String} blockNumber - the block number of which we want the timestamp
 * @returns {Number} the timestamp of the given block in ms
 */
const loadTimestamp = async blockNumber => {
  const block = await app.web3Eth('getBlock', blockNumber).toPromise()
  return parseInt(block.timestamp, 10) * 1000 // in ms
}
