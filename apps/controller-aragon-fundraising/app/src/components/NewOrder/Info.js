import React from 'react'
import { Info as Information } from '@aragon/ui'

const Info = isBuyOrder => {
  return (
    <div
      css={`
        margin-top: 2rem;
      `}
    >
      <Information.Action>
        <p>Note that the price displayed here is indicative and prone to evolve (if other users open additionnal orders in the same batch).</p>
        <p>
          If the price goes {isBuyOrder ? 'up' : 'down'} by more than XX percent of the indicated price your order will be cancelled and your funds returned.
        </p>
      </Information.Action>
    </div>
  )
}

export default Info
