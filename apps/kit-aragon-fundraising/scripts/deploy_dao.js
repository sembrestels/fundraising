const namehash = require('eth-ens-namehash').hash
const FundraisingKit = artifacts.require('FundraisingKit')
const TokenMock = artifacts.require('TokenMock')
const Controller = artifacts.require('AragonFundraisingController')
const MarketMaker = artifacts.require('BancorMarketMaker')
const Vault = artifacts.require('Vault')
const apps = ['finance', 'token-manager', 'vault', 'voting']
const fundraisingApps = [
  'fundraising-market-maker-bancor',
  'fundraising-controller-aragon-fundraising',
  'fundraising-module-tap',
  'fundraising-module-pool',
]

// Ensure that these address are up to date according to the network
// Defaults set here are for the local rpc
const defaultOwner = process.env.OWNER || '0xb4124cEB3451635DAcedd11767f004d8a28c6eE7'
const defaultENSAddress = process.env.ENS || '0x5f6f7e8cc7346a11ca2def8f827b7a0b612c56a1'
const defaultHolders = [defaultOwner, '0x8401Eb5ff34cc943f096A32EF3d5113FEbE8D4Eb']
const defaultTokenSupply = 100

const getInstalledApps = (receipt, daoInstance, appNames) => {
  const daoAddress = getEventResult(receipt, daoInstance, 'dao')
  if (daoAddress) {
    let installedApps = {}
    appNames.map(app => {
      const appAddress = getEventResult(receipt, 'InstalledApp', app)
      console.log("%s at: %s", app, appAddress)
      installedApps[app] = appAddress
    })
    return { daoAddress, installedApps }
  }
}

const getEventResult = (receipt, event, param) => {
  if (event == 'InstalledApp') {
    return receipt.logs.filter(l => l.event === 'InstalledApp' && l.args.appId === namehash(`${param}.aragonpm.eth`))[0].args.appProxy
  }
  return receipt.logs.filter(l => l.event == event)[0].args[param]
}

const getBuyOrderBatchId = receipt => {
  const event = receipt.logs.find(l => l.event === 'NewBuyOrder')
  return event.args.batchId
}

function increaseBlock() {
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

function increaseBlocks(blocks) {
  if (typeof blocks === 'object') {
    blocks = blocks.toNumber(10)
  }
  return new Promise((resolve, reject) => {
    increaseBlock().then(() => {
      blocks -= 1
      if (blocks === 0) {
        resolve()
      } else {
        increaseBlocks(blocks).then(resolve)
      }
    })
  })
}

module.exports = async callback => {
  try {
    const fundraisingAddress = process.argv[6]
    const network = process.argv[5]

    console.log(`Creating token instances with owner: ${defaultOwner} and supply: ${defaultTokenSupply}`)
    const collateralMultisig = await TokenMock.new(defaultOwner, defaultTokenSupply)
    const collateralBondedToken = await TokenMock.new(defaultOwner, defaultTokenSupply)
    const kit = await FundraisingKit.at(fundraisingAddress)

    console.log("Multisig token: ", collateralMultisig.address)
    console.log("Bonded token: ", collateralBondedToken.address)

    const aragonId = 'fundraising' + Math.random()
    const receipt1 = await kit.newTokens('PRO', 'PROJECT')
    const receipt2 = await kit.newMultisigInstance(
      aragonId,
      defaultHolders,
      defaultHolders.length
    )
    const receipt3 = await kit.newFundraisingInstance(collateralMultisig.address, collateralBondedToken.address)

    const collateralMultisigAddress = receipt1.logs.filter(l => l.event == 'DeployToken')[0].args.token
    const collateralBondedTokenAddress = receipt1.logs.filter(l => l.event == 'DeployToken')[1].args.token

    const { daoAddress: cacheAddress, installedApps: coreApps } = getInstalledApps(receipt2, 'DeployMultisigInstance', apps)
    const { daoAddress, installedApps } = getInstalledApps(receipt3, 'DeployFundraisingInstance', fundraisingApps)

    // const controller = await Controller.at(installedApps[fundraisingApps[2]])

    const receipt4 = await collateralBondedToken.approve(installedApps[fundraisingApps[0]], defaultTokenSupply) // Allow Market Maker
    const receipt5 = await collateralBondedToken.approve(installedApps[fundraisingApps[2]], defaultTokenSupply) // Allow Controller transfer permissions

    await increaseBlocks(1)

    // TODO: These tx revert regardless of the size of the order, maybe we need to send ETH to the controller
    // const receipt5 = await controller.createBuyOrder(collateralBondedTokenAddress, 10, { from: defaultOwner, value: 10 })
    // const receipt6 = await curve.createBuyOrder(defaultOwner, '0x0', 12, { from: controller.address, value: 12 })
    //const batchId = getBuyOrderBatchId(receipt5)
    // console.log(batchId)

    if (network === 'rpc') {
      console.log('Start the Aragon client locally and go to:', daoAddress)
    } else { // Rinkeby only
      console.log('Visit your DAO at https://rinkeby.aragon.org/#/' + aragonId + '.aragonid.eth')
    }

    console.log('OK')
    callback()
  } catch (err) {
    console.log(err)
    callback(undefined, err)
  }
}
