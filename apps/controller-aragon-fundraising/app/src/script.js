import Aragon, { events } from '@aragon/api'
import { filter, first } from 'rxjs/operators'
import { from, of, zip } from 'rxjs'
// import { getTestTokenAddresses } from './testnet'
// import {
//   ETHER_TOKEN_FAKE_ADDRESS,
//   isTokenVerified,
//   tokenDataFallback,
//   getTokenSymbol,
//   getTokenName,
// } from './lib/token-utils'
import { addressesEqual } from './utils/web3'
// import tokenDecimalsAbi from './abi/token-decimals.json'
// import tokenNameAbi from './abi/token-name.json'
// import tokenSymbolAbi from './abi/token-symbol.json'
// import vaultBalanceAbi from './abi/vault-balance.json'
// import vaultGetInitializationBlockAbi from './abi/vault-getinitializationblock.json'
// import vaultEventAbi from './abi/vault-events.json'
import tokenManagerAbi from './abi/TokenManager.json'
import tokenAbi from './abi/TokenMock.json'
import vaultAbi from './abi/Vault.json'
import poolAbi from './abi/Pool.json'
import tapAbi from './abi/Tap.json'
import marketMakerAbi from './abi/BancorMarketMaker.json'

const TEST_TOKEN_ADDRESSES = []
const appNames = new Map() // Addr -> Aragon App name
const tokenContracts = new Map() // Addr -> External contract
const tokenDecimals = new Map() // External contract -> decimals
const tokenNames = new Map() // External contract -> name
const tokenSymbols = new Map() // External contract -> symbol

const ETH_CONTRACT = Symbol('ETH_CONTRACT')
const INITIALIZATION_TRIGGER = Symbol('INITIALIZATION_TRIGGER')

const app = new Aragon()

/*
 * Calls `callback` exponentially, everytime `retry()` is called.
 *
 * Usage:
 *
 * retryEvery(retry => {
 *  // do something
 *
 *  if (condition) {
 *    // retry in 1, 2, 4, 8 seconds… as long as the condition passes.
 *    retry()
 *  }
 * }, 1000, 2)
 *
 */
const retryEvery = (callback, initialRetryTimer = 1000, increaseFactor = 5) => {
  const attempt = (retryTimer = initialRetryTimer) => {
    // eslint-disable-next-line standard/no-callback-literal
    callback(() => {
      console.error(`Retrying in ${retryTimer / 1000}s...`)

      // Exponentially backoff attempts
      setTimeout(() => attempt(retryTimer * increaseFactor), retryTimer)
    })
  }
  attempt()
}

const externals = zip(app.call('token-manager'), app.call('vault'), app.call('fundraising-module-pool'), app.call('funraising-module-tap'), app.call('fundraising-market-maker-bancor'))
// Get the token address to initialize ourselves
retryEvery(retry => {
  console.log('TRY TO SUBSRIBE')
  externals.subscribe(
    ([tokenManagerAddress, vaultAddress, poolAddress, tapAddress, marketMakerAddress]) => initialize(tokenManagerAddress, vaultAddress, poolAddress, tapAddress, marketMakerAddress),
    err => {
      console.error('Could not start background script execution due to the contract not loading external contract addresses:', err)
      retry()
    }
  )
})

async function initialize(tokenManagerAddress, vaultAddress, poolAddress, tapAddress, marketMakerAddress) {
  console.log('INITIALIZE')

  console.log('token-manager', tokenManagerAddress)
  console.log('pool', poolAddress)
  console.log('tap', tapAddress)
  console.log('marketMaker', marketMakerAddress)
  console.log('vault', vaultAddress)

  console.log('Before app Name')
  appNames.set(tokenManagerAddress, 'token-manager')
  appNames.set(vaultAddress, 'vault')
  appNames.set(marketMakerAddress, 'fundraising-market-maker-bancor.aragonpm.eth')
  appNames.set(tapAddress, 'fundraising-module-tap.aragonpm.eth')
  appNames.set(poolAddress, 'fundraising-module-pool.aragonpm.eth')
  const tokenManagerContract = app.external(tokenManagerAddress, tokenManagerAbi)
  const vaultContract = app.external(vaultAddress, vaultAbi)
  const marketMakerContract = app.external(marketMakerAddress, marketMakerAbi)
  const tapContract = app.external(tapAddress, tapAbi)
  const poolContract = app.external(poolAddress, poolAbi)
  appNames.map((address, name) => console.log(`Initialized ${name} at ${address}`))

  const network = await app
    .network()
    .pipe(first())
    .toPromise()
  // TEST_TOKEN_ADDRESSES.push(...getTestTokenAddresses(network.type))

  // Set up ETH placeholders
  // tokenContracts.set(ethAddress, ETH_CONTRACT)
  // tokenDecimals.set(ETH_CONTRACT, '18')
  // tokenNames.set(ETH_CONTRACT, 'Ether')
  // tokenSymbols.set(ETH_CONTRACT, 'ETH')

  const settings = {
    network,
    tokenManager: {
      address: tokenManagerAddress,
      contract: tokenManagerContract,
    },
    pool: {
      address: poolAddress,
      contract: poolContract,
    },
    tap: {
      address: tapAddress,
      contract: tapContract,
    },
    marketMaker: {
      address: marketMakerAddress,
      contract: marketMakerContract,
    },
    vault: {
      address: vaultAddress,
      contract: vaultAbi,
    }
  }

  let vaultInitializationBlock

  try {
    vaultInitializationBlock = await settings.vault.contract.getInitializationBlock().toPromise()
  } catch (err) {
    console.error("Could not get attached vault's initialization block:", err)
  }

  return app.store(
    async (state, event) => {
      console.log('EVENT')
      console.log(event)
      if (state === null) state = { batches: [], balances: [], tokens: [], orders: [], taps: []}

      const nextState = {
        ...state,
      }
      const { vault, pool, tap, marketMaker } = settings
      const { returnValues, address: eventAddress, event: eventName } = event


      // if (eventName === events.SYNC_STATUS_SYNCING) {
      //   console.log('SYNCING')
      //   return { ...nextState, isSyncing: true }
      // } else if (eventName === events.SYNC_STATUS_SYNCED) {
      //   console.log('SYNCED')
      //   return { ...nextState, isSyncing: false }
      // }

      if (eventName === INITIALIZATION_TRIGGER) {
        nextState = await initializeState(nextState, settings)
      } else if (addressesEqual(eventAddress, vault.address)) {
        // Vault event
        return vaultLoadBalance(nextState, event, settings)
      }
      else {
        switch (eventName) {
          case 'UpdateMonthlyTapRateIncrease':
            nextState = updateMonthlyTapRateIncrease(nextState, event, settings)
            break
          case 'UpdateTokenTap':
            nextState = updateTokenTap(nextState, event, settings)
            break
          case 'NewBuyOrder':
            console.log('THIS IS A BUY ORDER !!!!')
            nextState = await createBuyOrder(nextState, event, settings)
            break
          case 'NewSellOrder':
            console.log('THIS IS A SELL ORDER !!!!')
            nextState = await createSellOrder(nextState, event, settings)
            break
         case 'ClearBatches':
            nextState = clearBatches(nextState, settings)
            break
          default:
            break
        }
      }

      return nextState
    },
    [
      of({ event: INITIALIZATION_TRIGGER }),
      vault.contract.events(),
      pool.contract.events(),
      tap.contract.events(),
      marketMaker.contract.events()
    ]
  )
}

/***********************
 *                     *
 *   Event Handlers    *
 *                     *
 ***********************/

async function initializeState(state, settings) {
  const bondedTokenAddress = await settings.marketMaker.contract.call('token').toPromise()
  // We need these addresses to update the price after clearing the users order
  const newState = {
    ...state,
    maxPctIncrease: await settings.tap.contract.call('maxMonthlyTapIncreasePct').toPromise(),
    periodDuration: marshallDate(2592000000), // Every 30-days refresh the tap / pool controls
    bondedTokenAddress,
    marketMakerAddress: settings.marketMaker.address,
    vaultAddress: settings.vault.address,
    poolAddress: settings.pool.address,
    tapAddress: settings.tap.address,
  }

  console.log('OK', nextState)

  // TODO: Create a file with already deployed token addresses after running the deploy_dao script
  const withTokenSupply = loadTokenSupply(nextState)
  const withLastWithdrawals = loadLastWidthdrawals(withTokenSupply, settings)
  const withTaps = loadTaps(withLastWithdrawals, settings)
  const withMaxWithdrawl = loadMaxWithdrawal(withTaps, settings)
  return withTaps
}

async function loadMaxWithdrawal(state, settings) {
  return {
   ...state,
   maxWithdrawal: await tap.contract.call('getMaxWithdrawal', state.bondedTokenAddress).toPromise(),
  }
}

async function loadTaps(state, settings) {
  const { taps, bondedTokenAddress } = state
  const updatedBondedTokenTap = {
    address: bondedTokenAddress,
    tapAmount: await settings.tap.call('taps', bondedTokenAddress)
  }

  if (taps === undefined) {
    return {
      ...state,
      taps: [updatedBondedTokenTap]
    }
  }
  else {
    const tapsIndex = taps.findIndex(({ address }) => address === bondedTokenAddress)
    if (tapsIndex === -1) {
      return taps.concat(updatedBondedTokenTap)
    } else {
      const newTaps = Array.from(taps)
      newTaps[tapsIndex] = updatedBondedTokenTap
      return newTaps
    }
  }
}

async function loadLastWidthdrawals(state, settings) {
  return {
    ...state,
    lastWithdrawal: await tap.call('lastWithdrawals', state.bondedTokenAddress)
  }
}

async function loadTokenSupply(state) {
  const tokenContract = app.external(state.bondedTokenAddress, tokenAbi)

  return {
    ...state,
    tokenSupply: await tokenContract.call('totalSupply').toPromise()
  }
}

async function vaultLoadBalance(state, { returnValues: { token } }, settings) {
  return {
    ...state,
    balances: await updateBalances(
      state,
      token,
      settings
    ),
  }
}

async function updateMonthlyTapRateIncrease(state, { returnValues: { maxMonthlyTapIncreasePct } }, settings) {
  return marshallMonthlyTapRateIncrease(await app.call('updateMonthlyTapIncreasePct', maxMonthlyTapIncreasePct).toPromise())
}

async function updateTokenTap(state, { returnValues: { token, tap } }, settings) {
  return marshallTapRate(await app.call('updateTokenTap', token, tap).toPromise())
}

async function createBuyOrder(state, { returnValues: { id, amount, token, collateralToken, state, price } }, settings) {
  console.log('BUY ORDER')

  let newState = {
    ...state,
  }

  let order = {
    id: id,
    amount: amount,
    orderType: 'BUY',
    state: state,
    price: price,
  }

  await app.call('createBuyOrder', token, amount).subscribe(
    ({ buyer, collateralToken, value, batchId }) => {
      const today = new Date()
      order.address = buyer
      order.collateralToken = collateralToken
      order.amount = value
      order.date = marshallDate(today)
      newState.batches = [...newState.batches, { batchId, order }]
      newState.orders[id] = order
    },
    err => console.error(`Could not place buy order of amount: ${amount} @ price: ${price}`, err)
  )

  newState = await claimBuy(newState, event, settings)

  return newState
}

async function createSellOrder(state, { returnValues: { id, amount, token, collateralToken, state, price } }, settings) {
  let newState = {
    ...state,
  }

  let order = {
    id: id,
    orderType: 'SELL',
    state: state,
    price: price,
  }

  await app.call('createSellOrder', token, amount).subscribe(
    ({ seller, collateralToken, amount, batchId }) => {
      order.address = seller
      order.collateralToken = collateralToken
      order.amount = amount
      newState.batches = [...newState.batches, { batchId, order }]
      newState.orders[id] = order
    },
    err => console.error(`Could not place sell order of amount: ${amount} @ price: ${price}`, err)
  )

  newState = await claimSell(newState, event, settings)

  return newState
}

async function claimBuy(state, { returnValues: { token, batchId } }, settings) {
  const batch = getBatch(state, batchId)
  // We don't care about the response
  batch.subscribe(async batchId => app.call.claimBuy(token, batchId).toPromise())
  return updateClaimedOrderStatus(state, batch.order.id)
}

async function claimSell(state, event, settings) {
  const batch = getBatch(state, event.returnValues.batchId)
  batch.subscribe(async batchId => app.call.claimSell(settings.bondedToken.address, batchId).toPromise())
  return updateClaimedOrderStatus(state, batch.order.id)
}

function updateClaimedOrderStatus(state, orderId) {
  const { orders } = state

  let order = orders[orderId]
  order.state = 'Claimed'

  const newOrders = Array.from(orders)
  newOrders[orderId] = order

  return {
    ...state,
    orders: newOrders,
  }
}

function getBatch(state, batchId) {
  const { batches } = state
  const source = from(batches)
  const batch = source.pipe(filter(batch => batch.batchId === batchId))
  return batch
}

async function clearBatches(state, settings) {
  await app.call('clearBatch').toPromise()
  return {
    ...state,
    batches: [],
  }
}

async function loadTokenBalances(state, settings) {
  let newState = {
    ...state,
  }
  if (!newState.balances) {
    return newState
  }

  const addresses = newState.balances.map(({ address }) => address)
  for (const address of addresses) {
    newState = {
      ...newState,
      balances: await updateBalances(newState, address, settings),
    }
  }
  return newState
}

async function newPeriod(state, { returnValues: { periodId, periodStarts, periodEnds } }) {
  return {
    ...state,
    periods: await updatePeriods(state, {
      id: periodId,
      startTime: marshallDate(periodStarts),
      endTime: marshallDate(periodEnds),
    }),
  }
}

async function newTransaction(state, { transactionHash, returnValues: { reference, transactionId } }, settings) {
  const transactionDetails = {
    ...(await loadTransactionDetails(transactionId)),
    reference,
    transactionHash,
    id: transactionId,
  }
  const transactions = await updateTransactions(state, transactionDetails)
  const balances = await updateBalances(state, transactionDetails.token, settings)

  return {
    ...state,
    balances,
    transactions,
  }
}

/***********************
 *                     *
 *       Helpers       *
 *                     *
 ***********************/

async function updateBalances({ balances = [] }, tokenAddress, settings) {
  const tokenContract = tokenContracts.has(tokenAddress) ? tokenContracts.get(tokenAddress) : app.external(tokenAddress, tokenAbi)
  tokenContracts.set(tokenAddress, tokenContract)

  const balancesIndex = balances.findIndex(({ address }) => addressesEqual(address, tokenAddress))
  if (balancesIndex === -1) {
    return balances.concat(await newBalanceEntry(tokenContract, tokenAddress, settings))
  } else {
    const newBalances = Array.from(balances)
    newBalances[balancesIndex] = {
      ...balances[balancesIndex],
      amount: await loadTokenBalance(tokenAddress, settings),
    }
    return newBalances
  }
}

function updatePeriods({ periods = [] }, periodDetails) {
  const periodsIndex = periods.findIndex(({ id }) => id === periodDetails.id)
  if (periodsIndex === -1) {
    return periods.concat(periodDetails)
  } else {
    const newPeriods = Array.from(periods)
    newPeriods[periodsIndex] = periodDetails
    return newPeriods
  }
}

function updateTransactions({ transactions = [] }, transactionDetails) {
  const transactionsIndex = transactions.findIndex(({ id }) => id === transactionDetails.id)
  if (transactionsIndex === -1) {
    return transactions.concat(transactionDetails)
  } else {
    const newTransactions = Array.from(transactions)
    newTransactions[transactionsIndex] = transactionDetails
    return newTransactions
  }
}

async function newBalanceEntry(tokenContract, tokenAddress, settings) {
  const [balance, decimals, name, symbol] = await Promise.all([
    loadTokenBalance(tokenAddress, settings),
    loadTokenDecimals(tokenContract, tokenAddress, settings),
    loadTokenName(tokenContract, tokenAddress, settings),
    loadTokenSymbol(tokenContract, tokenAddress, settings),
  ])

  return {
    decimals,
    name,
    symbol,
    address: tokenAddress,
    amount: balance,
    verified: isTokenVerified(tokenAddress, settings.network.type) || addressesEqual(tokenAddress, settings.ethToken.address),
  }
}

async function loadEthBalance(state, settings) {
  return {
    ...state,
    balances: await updateBalances(state, settings.ethToken.address, settings),
  }
}

function loadTokenBalance(tokenAddress, { vault }) {
  return vault.contract.balance(tokenAddress).toPromise()
}

async function loadTokenDecimals(tokenContract, tokenAddress, { network }) {
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

async function loadTokenName(tokenContract, tokenAddress, { network }) {
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

async function loadTokenSymbol(tokenContract, tokenAddress, { network }) {
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

async function loadTransactionDetails(id) {
  return marshallTransactionDetails(await app.call('getTransaction', id).toPromise())
}

function marshallTransactionDetails({ amount, date, entity, isIncoming, paymentId, periodId, token }) {
  return {
    amount,
    entity,
    isIncoming,
    paymentId,
    periodId,
    token,
    date: marshallDate(date),
  }
}

function marshallTapRate({ token, tap }) {
  const today = new Date()
  return {
    tapRate: { token, },
    lastTapIncrease: marshallDate(today),
  }
}

function marshallMonthlyTapRateIncrease({ maxMonthlyTapIncreasePct }) {
  const today = new Date()
  return {
    maxMonthlyTapIncreasePct,
    lastMaxMonthlyTapIncrease: marshallDate(today),
  }
}

function marshallDate(date) {
  // Represent dates as real numbers, as it's very unlikely they'll hit the limit...
  // Adjust for js time (in ms vs s)
  return parseInt(date, 10) * 1000
}

/**********************
 *                    *
 * RINKEBY TEST STATE *
 *                    *
 **********************/

function loadTestnetState(nextState, settings) {
  // Reload all the test tokens' balances for this DAO's vault
  return loadTestnetTokenBalances(nextState, settings)
}

async function loadTestnetTokenBalances(nextState, settings) {
  let reducedState = nextState
  for (const tokenAddress of TEST_TOKEN_ADDRESSES) {
    reducedState = {
      ...reducedState,
      balances: await updateBalances(reducedState, tokenAddress, settings),
    }
  }
  return reducedState
}
