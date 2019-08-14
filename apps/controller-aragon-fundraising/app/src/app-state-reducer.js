import { Order } from './constants'

/**
 * Checks whether we have enough data to start the fundraising app
 * @param {Object} state - the background script state
 * @returns {boolean} true if ready, false otherwise
 */
// TODO: check if we can start the app with no collateral token and no tap
const ready = state => {
  const synced = !(state === null || state.isSyncing)
  const hasCollateralTokens = state !== null && state.collateralTokens
  const hasTaps = state !== null && state.taps
  return synced && hasCollateralTokens && hasTaps
}

/**
 * Finds whether an order is cleared or not
 * @param {Array} order - an order coming from the state.orders Map
 * @param {Array} clearedBatches - the list of cleared batches, from state.clearedBatches
 * @returns {boolean} true if order is cleared, false otherwise
 */
const isCleared = ([_, { batchId, collateralToken }], clearedBatches) => {
  return clearedBatches && clearedBatches.some(b => b.batchId === batchId && b.collateralToken === collateralToken)
}

/**
 * Finds whether an order is returned (aka. claimed) or not
 * @param {Array} order - an order coming from the state.orders Map
 * @param {Array} returns - the list of return buy and return sell, from state.returns
 * @returns {boolean} true if order is returned, false otherwise
 */
const isReturned = ([_, { address, collateralToken, batchId, type }], returns) => {
  return returns && returns.some(r => r.address === address && r.batchId === batchId && r.collateralToken === collateralToken && r.type === type)
}

/**
 * Augments the order with its given state, derived from the clearedBatch and returns lists.
 * And with some onfo about the collateral token
 * @param {Array} order - an order coming from the state.orders Map
 * @param {Array} clearedBatches - the list of cleared batches, from state.clearedBatches
 * @param {Array} returns - the list of return buy and return sell, from state.returns
 * @param {Map} collateralTokens - the map of exisiting collateralTokens
 * @returns {Object} the order augmented with its state
 */
const withStateAndCollateral = (order, clearedBatches, returns, collateralTokens) => {
  const { address, amount, collateralToken, timestamp, type } = order[1]
  const collateral = collateralTokens.get(collateralToken).symbol
  const augmentedOrder = {
    txHash: order[0],
    address,
    amount,
    timestamp,
    type,
    collateral,
    // TODO: handle tokens and price
    price: 500,
    tokens: 100,
  }
  // a returned order means it's already cleared
  if (isReturned(order, returns)) return { ...augmentedOrder, state: Order.State.RETURNED }
  else if (isCleared(order, clearedBatches)) return { ...augmentedOrder, state: Order.State.CLEARED }
  else return { ...augmentedOrder, state: Order.State.PENDING }
}

/**
 * Reduces the backgorund script state to an intelligible one for the frontend
 * @param {Object} state - the background script state
 * @returns {Object} a reduced state, easier to interact with on the frontend
 */
const appStateReducer = state => {
  // TODO: remove this quick and dirty hack
  if (process.env.NODE_ENV === 'test') return JSON.parse(process.env.MOCK)
  // don't reduce not yet populated state
  if (ready(state)) {
    // compute some data to handle it easier on the frontend
    const {
      // common
      isSyncing,
      connectedAccount,
      beneficiary,
      bondedToken,
      addresses,
      // reserve
      ppm,
      taps,
      collateralTokens,
      maximumTapIncreasePct,
      // orders
      orders,
      clearedBatches,
      returns,
    } = state
    const daiAddress = Array.from(collateralTokens).find(t => t[1].symbol === 'DAI')[0]
    // common data
    const common = {
      connectedAccount,
      beneficiary,
      bondedToken,
      addresses,
    }
    // overview tab data
    // TODO: get the formula
    const price = 5
    const overview = {
      price,
      // TODO: handle orders
      reserve: collateralTokens.get(daiAddress).balance,
      tap: taps.get(daiAddress),
    }
    // orders tab data
    const ordersView = Array.from(orders).map(o => withStateAndCollateral(o, clearedBatches, returns, collateralTokens))
    // reserve tab data
    const reserve = {
      tap: taps.get(daiAddress),
      maximumTapIncreasePct,
      collateralTokens: Array.from(collateralTokens).map(([_, { symbol, reserveRatio }], i) => ({
        symbol,
        ratio: parseInt(reserveRatio, 10) / parseInt(ppm, 10),
      })),
    }
    // reduced state
    return {
      isSyncing,
      common,
      overview,
      ordersView,
      reserve,
    }
  } else {
    return state
  }
}

export default appStateReducer
