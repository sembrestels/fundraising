import React, { useState, useMemo } from 'react'
import { AragonApi, useAppState } from '@aragon/api-react'
import appStateReducer from './app-state-reducer'

// memoized useState
const use = initialValue => {
  const [current, set] = useState(initialValue)
  return useMemo(() => ({ current, set }), [current, set])
}

// handles the main logic of the app.
export const useAppLogic = () => {
  const state = useAppState()

  return {
    // background script state
    ...state,
    // ui state logic
    ui: {
      orderPanel: use(false),
      orderAmount: use(0.0),
      tokenAmount: use(0.0),
      token: use('0x00'),
      tabIndex: use(0),
    },
  }
}

export const AppLogicProvider = ({ children }) => {
  return <AragonApi reducer={appStateReducer}>{children}</AragonApi>
}
