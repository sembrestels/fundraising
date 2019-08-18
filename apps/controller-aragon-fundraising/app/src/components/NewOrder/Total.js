import React from 'react'
import { Text } from '@aragon/ui'

const Total = ({ isBuyOrder, collateral, token }) => {
  return (
    <div css="display: flex;">
      <div css="width: 50%">
        <Text weight="bold">TOTAL</Text>
      </div>
      <div css="width: 25%; display: flex; flex-direction: column; direction: rtl;">
        <Text weight="bold">{isBuyOrder ? token.value || 0 : collateral.value || 0}</Text>
        <Text color="grey">{isBuyOrder ? collateral.value || 0 : token.value || 0}</Text>
      </div>
      <div css="width: 25%; display: flex; flex-direction: column; margin-left: 1rem;">
        <Text weight="bold">{isBuyOrder ? token.symbol : collateral.symbol}</Text>
        <Text color="grey">{isBuyOrder ? collateral.symbol : token.symbol}</Text>
      </div>
    </div>
  )
}

const Total2 = ({ isBuyOrder, collateral, token }) => {
  return (
    <div>
      <div>
        <Text weight="bold">TOTAL</Text>
        <div
          css={`
            float: right;
            display: flex;
            justify-content: space-between;
            width: 5rem;
          `}
        >
          <Text weight="bold">{isBuyOrder ? token.value || 0 : collateral.value || 0}</Text>
          <Text weight="bold">{isBuyOrder ? token.symbol : collateral.symbol}</Text>
        </div>
      </div>
      <div css="margin-bottom: 2rem;">
        <Text weight="bold" />
        <div
          css={`
            float: right;
            display: flex;
            justify-content: space-between;
            width: 5rem;
          `}
        >
          <Text color="grey">{isBuyOrder ? collateral.value || 0 : token.value || 0}</Text>
          <Text color="grey">{isBuyOrder ? collateral.symbol : token.symbol}</Text>
        </div>
      </div>
    </div>
  )
}

export default Total
