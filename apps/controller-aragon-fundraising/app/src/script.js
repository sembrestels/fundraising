import Aragon, { events } from '@aragon/api'
import { zip } from 'rxjs'
import { first } from 'rxjs/operators'
// import { addressesEqual } from './utils/web3'
import { tokenDataFallback, getTokenSymbol, getTokenName } from './lib/token-utils'
import poolAbi from './abi/Pool.json'
import tapAbi from './abi/Tap.json'
import marketMakerAbi from './abi/BancorMarketMaker.json'
import tokenDecimalsAbi from './abi/token-decimals.json'
import tokenNameAbi from './abi/token-name.json'
import tokenSymbolAbi from './abi/token-symbol.json'
import { retryEvery } from './bg-script/utils'

const tokenAbi = [].concat(tokenDecimalsAbi, tokenNameAbi, tokenSymbolAbi)

const tokenContracts = new Map() // Addr -> External contract
const tokenDecimals = new Map() // External contract -> decimals
const tokenNames = new Map() // External contract -> name
const tokenSymbols = new Map() // External contract -> symbol

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

  const network = await app
    .network()
    .pipe(first())
    .toPromise()

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

  return app.store(
    async (state, { event, returnValues }) => {
      // prepare the next state from the current one
      const nextState = {
        ...state,
      }
      console.log(event)
      console.log(returnValues)
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
          return nextState
        case 'NewSellOrder':
          return nextState
        case 'ClearBatch':
          return nextState
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

const initState = settings => async cachedState => {
  const newState = {
    ...cachedState,
    isSyncing: true,
    connectedAccount: null,
    // batches: {},
    // balances: {},
    // tokenSupply: 0,
    // collateralTokens: {},
    // tapRate: 0,
    // price: 0,
    // historicalOrders: {},
    // cache: {},
  }
  const withTapData = await loadTapData(newState, settings)
  const withPoolData = await loadPoolData(withTapData, settings)
  return withPoolData
}

const loadTapData = async (state, settings) => {
  const maxMonthlyTapIncreasePct = await settings.tap.contract.maxMonthlyTapIncreasePct().toPromise()
  const pctBase = await settings.tap.contract.PCT_BASE().toPromise()
  return {
    ...state,
    beneficiary: await settings.tap.contract.beneficiary().toPromise(),
    maxMonthlyTapIncrease: maxMonthlyTapIncreasePct / pctBase,
  }
}

const loadPoolData = async (state, settings) => {
  return {
    ...state,
    collateralTokensLength: parseInt(await settings.pool.contract.collateralTokensLength().toPromise(), 10),
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

const updateCollateralToken = async (state, { collateralToken, virtualSupply, virtualBalance, reserveRatio }, settings) => {
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

const addTokenTap = async (state, { token, tap }) => {
  const taps = state.taps || new Set()
  taps.add(token, tap)
  return {
    ...state,
    taps,
  }
}

/***********************
 *                     *
 *       Helpers       *
 *                     *
 ***********************/

const loadTokenBalance = (tokenAddress, settings) => {
  return settings.pool.contract.balance(tokenAddress).toPromise()
}

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
