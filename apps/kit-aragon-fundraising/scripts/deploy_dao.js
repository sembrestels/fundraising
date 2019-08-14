const AllEvents = require('web3/lib/web3/allevents')

const FundraisingKit = artifacts.require('FundraisingKit')
const TokenMock = artifacts.require('TokenMock')
const Controller = artifacts.require('AragonFundraisingController')
const MarketMaker = artifacts.require('BatchedBancorMarketMaker')

let marketMaker
let controller

const decodeEventsForContract = (contract, receipt) => {
  const ae = new AllEvents(contract._web3, contract.abi, contract.address)
  // ae.decode mutates the args, so we deep copy
  return JSON.parse(JSON.stringify(receipt))
    .logs.filter(l => l.address === contract.address)
    .map(l => ae.decode(l))
}

const getBatchId = (tx, isBuy) => {
  const events = decodeEventsForContract(marketMaker, tx.receipt)
  const eventName = isBuy ? 'NewBuyOrder' : 'NewSellOrder'
  const event = events.filter(l => {
    return l.event === eventName
  })[0]

  return event.args.batchId
}

const createOrder = async (collateral, amount, isBuy, isClaimed) => {
  const tx = isBuy ? await controller.openBuyOrder(collateral.address, amount) : await controller.openSellOrder(collateral.address, amount)
  if (isClaimed) {
    const batchId = getBatchId(tx, isBuy)
    // batch size (batchBlocks) is 1 in the kits
    // increasing by one block should terminate the batch
    await increaseBlock()
    await increaseBlock()
    if (isBuy) await controller.claimBuyOrder(batchId, collateral.address)
    else await controller.claimSellOrder(batchId, collateral.address)
  }
}

const increaseBlock = () => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync(
      {
        jsonrpc: '2.0',
        method: 'evm_mine',
        id: 12345,
      },
      (err, result) => {
        if (err) reject(err)
        resolve(result)
      }
    )
  })
}

module.exports = async callback => {
  try {
    const collateral1 = await TokenMock.new('0xb4124cEB3451635DAcedd11767f004d8a28c6eE7', 1000000000000000000, 'Dai', 'DAI')
    const collateral2 = await TokenMock.new('0xb4124cEB3451635DAcedd11767f004d8a28c6eE7', 1000000000000000000, 'Aragon', 'ANT')

    const kit = await FundraisingKit.at(process.argv[6])

    const receipt1 = await kit.newTokens('PRO', 'PROJECT')
    const receipt2 = await kit.newMultisigInstance(
      'fundraising' + Math.random(),
      ['0xb4124cEB3451635DAcedd11767f004d8a28c6eE7', '0x8401Eb5ff34cc943f096A32EF3d5113FEbE8D4Eb '],
      2
    )
    const receipt3 = await kit.newFundraisingInstance(collateral1.address, collateral2.address)
    const dao = receipt2.logs.filter(l => l.event == 'DeployMultisigInstance')[0].args.dao

    const controllerAddress = receipt3.logs.filter(
      l => l.event === 'InstalledApp' && l.args.appId === '0x668ac370eed7e5861234d1c0a1e512686f53594fcb887e5bcecc35675a4becac'
    )[0].args.appProxy

    const marketMakerAddress = receipt3.logs.filter(
      l => l.event === 'InstalledApp' && l.args.appId === '0xc2bb88ab974c474221f15f691ed9da38be2f5d37364180cec05403c656981bf0'
    )[0].args.appProxy

    console.log(controllerAddress)
    console.log(marketMakerAddress)

    controller = await Controller.at(controllerAddress)
    marketMaker = await MarketMaker.at(marketMakerAddress)

    await collateral1.approve(marketMakerAddress, 1000000000000000000)
    await collateral2.approve(marketMakerAddress, 1000000000000000000)

    console.log('OK')

    // BATCH 1: one buy, claimed
    await createOrder(collateral1, 1121, true, true)

    // BATCH 2: one sell, claimed
    await createOrder(collateral1, 1000, false, true)

    // BATCH 3: one buy, claimed (collateral2)
    await createOrder(collateral2, 1000, true, true)

    // BATCH 4: one buy, cleared and NOT claimed
    await createOrder(collateral1, 1000, true, false)

    console.log('DAO deployed at ' + dao)

    callback()
  } catch (err) {
    console.log(err)
    callback(undefined, err)
  }
}
