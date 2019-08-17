import React, { Fragment, useState } from 'react'
import { useApi } from '@aragon/api-react'
import { Layout, Tabs, Button, Main, SidePanel, SyncIndicator } from '@aragon/ui'
import { useInterval } from './utils/use-interval'
import AppHeader from './components/AppHeader/AppHeader'
import PanelContent from './components/NewOrder/PanelContent'
import Reserves from './screens/Reserves'
import Orders from './screens/Orders'
import Overview from './screens/Overview'
import { AppLogicProvider, useAppLogic } from './app-logic'
import miniMeTokenAbi from './abi/MiniMeToken.json'
import marketMaker from './abi/BatchedBancorMarketMaker.json'

const tabs = ['Overview', 'Orders', 'Reserve Settings']

const App = () => {
  const { isSyncing, common, overview, ordersView, reserve } = useAppLogic()
  const ready = !isSyncing && common && overview && reserve

  const [orderPanel, setOrderPanel] = useState(false)
  const [tabIndex, setTabindex] = useState(0)

  const api = useApi()

  const [polledTotalSupply, setPolledTotalSupply] = useState(null)
  const [polledBatchId, setPolledBatchId] = useState(null)

  // polls the bonded token total supply, batchId, price
  useInterval(async () => {
    if (ready) {
      // totalSupply
      const bondedTokenContract = api.external(common.bondedToken.address, miniMeTokenAbi)
      const totalSupply = await bondedTokenContract.totalSupply().toPromise()
      setPolledTotalSupply(totalSupply)
      // batchId
      const marketMakerContract = api.external(common.addresses.marketMaker, marketMaker)
      const batchId = await marketMakerContract.getCurrentBatchId().toPromise()
      setPolledBatchId(batchId)
    }
  }, 3000)

  const handlePlaceOrder = async (collateralTokenAddress, amount, isBuyOrder) => {
    // TODO: add error handling on failed tx, check token balances
    if (isBuyOrder) {
      console.log(`its a buy order where token: ${collateralTokenAddress}, amount: ${amount}`)
      api
        .openBuyOrder(collateralTokenAddress, amount)
        .toPromise()
        .catch(console.error)
    } else {
      console.log(`its a sell order where token: ${collateralTokenAddress}, amount: ${amount}`)
      api
        .openSellOrder(collateralTokenAddress, amount)
        .toPromise()
        .catch(console.error)
    }
  }

  const handleTappedTokenUpdate = tapAmount => {
    // TODO: what floor ?
    api
      .updateTokenTap(common.daiAddress, tapAmount, 0)
      .toPromise()
      .catch(console.error)
  }

  return (
    <div css="min-width: 320px">
      <Main assetsUrl="./">
        <SyncIndicator visible={!ready} />
        {ready && (
          <Fragment>
            <Layout>
              <AppHeader
                heading="Fundraising"
                action={
                  <Button mode="strong" label="New Order" onClick={() => setOrderPanel(true)}>
                    New Order
                  </Button>
                }
              />
              <Tabs selected={tabIndex} onChange={setTabindex} items={tabs} />
              {tabIndex === 0 && (
                <Overview
                  overview={overview}
                  bondedToken={common.bondedToken}
                  currentBatch={common.currentBatch}
                  polledData={{ polledTotalSupply, polledBatchId }}
                />
              )}
              {tabIndex === 1 && <Orders orders={ordersView} />}
              {tabIndex === 2 && (
                <Reserves
                  bondedToken={common.bondedToken}
                  reserve={{ ...reserve, collateralTokens: common.collateralTokens }}
                  polledData={{ polledTotalSupply }}
                  updateTappedToken={handleTappedTokenUpdate}
                />
              )}
            </Layout>
            <SidePanel opened={orderPanel} onClose={() => setOrderPanel(false)} title="New Order">
              <PanelContent
                opened={orderPanel}
                collaterals={common.collateralTokens}
                bondedToken={common.bondedToken}
                price={overview.startPrice}
                onOrder={handlePlaceOrder}
              />
            </SidePanel>
          </Fragment>
        )}
      </Main>
    </div>
  )
}

export default () => (
  <AppLogicProvider>
    <App />
  </AppLogicProvider>
)
