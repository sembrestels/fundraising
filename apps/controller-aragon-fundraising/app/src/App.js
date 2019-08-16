import React, { Fragment, useState } from 'react'
import { useApi } from '@aragon/api-react'
import { Layout, Tabs, Button, Main, SyncIndicator } from '@aragon/ui'
import { useInterval } from './utils/use-interval'
import AppHeader from './components/AppHeader/AppHeader'
import NewOrderSidePanel from './components/NewOrderSidePanel'
import PresaleSidePanel from './components/PresaleSidePanel'
import Reserves from './screens/Reserves'
import Orders from './screens/Orders'
import MyOrders from './screens/MyOrders'
import Overview from './screens/Overview'
import PresaleView from './screens/Presale'
import { AppLogicProvider, useAppLogic } from './app-logic'
import miniMeTokenAbi from './abi/MiniMeToken.json'

const isPresale = false

const Presale = () => {
  const { ui } = useAppLogic()
  const { orderPanel, orderAmount, tokenAmount, token } = ui
  const tabs = ['Overview', 'Orders']
  return (
    <div css="min-width: 320px">
      <Main assetsUrl="./">
        <Fragment>
          <Layout>
            <AppHeader
              heading="Fundraising Presale"
              action={
                <Button mode="strong" label="Buy Presale Tokens" onClick={() => orderPanel.set(true)}>
                  Buy Presale Tokens
                </Button>
              }
            />
            <PresaleView />
          </Layout>
          <PresaleSidePanel
            orderAmount={orderAmount.current}
            tokenAmount={tokenAmount.current}
            token={token.current}
            price={300.0}
            opened={orderPanel.current}
            onClose={() => orderPanel.set(false)}
          />
        </Fragment>
      </Main>
    </div>
  )
}

const tabs = ['Overview', 'Orders', 'My Orders', 'Reserve Settings']

const App = () => {
  const { isSyncing, ui, common, overview, ordersView, reserve } = useAppLogic()
  const ready = !isSyncing && common && overview && reserve
  const { orderPanel, orderAmount, tokenAmount, token, tabIndex } = ui
  const api = useApi()

  const [polledTotalSupply, setPolledTotalSupply] = useState(null)

  // polls the bonded token total supply
  useInterval(async () => {
    if (ready) {
      const bondedTokenContract = api.external(common.bondedToken.address, miniMeTokenAbi)
      const totalSupply = await bondedTokenContract.totalSupply().toPromise()
      setPolledTotalSupply(totalSupply)
    }
  }, 3000)

  const handlePlaceOrder = async (collateralTokenAddress, amount, isBuyOrder) => {
    // TODO: add error handling on failed tx, check token balances
    if (isBuyOrder) {
      console.log(`its a buy order where token: ${collateralTokenAddress}, amount: ${amount}`)
      api.createBuyOrder(collateralTokenAddress, amount).toPromise()
    } else {
      console.log(`its a sell order where token: ${collateralTokenAddress}, amount: ${amount}`)
      api.createSellOrder(collateralTokenAddress, amount).toPromise()
    }
  }

  const handleTokenTapUpdate = async tapAmount => {
    api
      .updateTokenTap(token, tapAmount)
      .toPromise()
      .catch(err => console.error('You do not have permissions to update this value: ', err))
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
                  <Button mode="strong" label="New Order" onClick={() => orderPanel.set(true)}>
                    New Order
                  </Button>
                }
              />
              <Tabs selected={tabIndex.current} onChange={tabIndex.set} items={tabs} />
              {tabIndex.current === 0 && <Overview bondedToken={common.bondedToken} overview={overview} polledTotalSupply={polledTotalSupply} />}
              {tabIndex.current === 1 && <Orders orders={ordersView} />}
              {tabIndex.current === 2 && <MyOrders orders={ordersView} />}
              {tabIndex.current === 3 && (
                <Reserves bondedToken={common.bondedToken} reserve={reserve} polledTotalSupply={polledTotalSupply} updateTokenTap={handleTokenTapUpdate} />
              )}
            </Layout>
            <NewOrderSidePanel
              orderAmount={orderAmount.current}
              tokenAmount={tokenAmount.current}
              token={token.current}
              price={300.0}
              opened={orderPanel.current}
              onClose={() => orderPanel.set(false)}
              onSubmit={handlePlaceOrder}
            />
          </Fragment>
        )}
      </Main>
    </div>
  )
}

export default () => <AppLogicProvider>{isPresale ? <Presale /> : <App />}</AppLogicProvider>
