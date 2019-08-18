import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Button, DropDown, IconCross, Text, TextInput, theme, unselectable } from '@aragon/ui'
import Total from './Total'
import Info from './Info'
import { round } from '../../lib/math-utils'

import transferArrows from '../../assets/transferArrows.svg'

const Buy = ({ opened, isBuyOrder, collaterals, bondedToken, price, onOrder }) => {
  const [selectedCollateral, setSelectedCollateral] = useState(0)
  const [collateralAmount, setCollateralAmount] = useState(0)
  const [tokenAmount, setTokenAmount] = useState(0)

  const collateralAmountInput = useRef(null)
  const tokenAmountInput = useRef(null)

  const collateralSymbols = collaterals.map(c => c.symbol)

  // handle reset when opening
  useEffect(() => {
    if (opened) {
      // reset to default values
      setSelectedCollateral(0)
      setCollateralAmount(0)
      setTokenAmount(0)
      // focus the right input, given the order type
      // timeout to avoid some flicker
      let focusedInput = isBuyOrder ? collateralAmountInput : tokenAmountInput
      focusedInput && setTimeout(() => focusedInput.current.focus(), 0)
    }
  }, [opened, isBuyOrder])

  const handleCollateralAmountUpdate = event => {
    setCollateralAmount(Number(event.target.value))
    setTokenAmount(Number(event.target.value / price))
  }

  const handleTokenAmountUpdate = event => {
    setTokenAmount(Number(event.target.value))
    setCollateralAmount(Number(event.target.value * price))
  }

  const isDisabledOrder = () => {
    // TODO: is this good, when token price is very high/low ?
    return collateralAmount <= 0 || tokenAmount <= 0
  }

  const handleSubmit = event => {
    event.preventDefault()
    onOrder(collaterals[selectedCollateral].address, collateralAmount, isBuyOrder)
  }

  const getInputs = () => {
    const inputs = [
      <AmountField key="collateral">
        <label>
          <StyledTextBlock>COLLATERAL AMOUNT</StyledTextBlock>
        </label>
        <CombinedInput>
          <TextInput
            ref={collateralAmountInput}
            type="number"
            value={round(collateralAmount)}
            onChange={handleCollateralAmountUpdate}
            min={0}
            step="any"
            required
            wide
          />
          <DropDown items={collateralSymbols} selected={selectedCollateral} onChange={setSelectedCollateral} />
        </CombinedInput>
      </AmountField>,
      <TransferIcon key="icon" />,
      <AmountField key="token">
        <label>
          <StyledTextBlock>TOKEN AMOUNT</StyledTextBlock>
        </label>
        <CombinedInput>
          <TextInput ref={tokenAmountInput} type="number" value={round(tokenAmount)} onChange={handleTokenAmountUpdate} min={0} step="any" required wide />
        </CombinedInput>
      </AmountField>,
    ]
    return isBuyOrder ? inputs : inputs.reverse()
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* TODO: what's the token price if there is 2 collaterals and can choose between them ? */}
      <Text as="p">Token price {round(price)} DAI</Text>
      <InputsWrapper>{getInputs()}</InputsWrapper>
      <Total
        isBuyOrder={isBuyOrder}
        collateral={{ value: round(collateralAmount), symbol: collateralSymbols[selectedCollateral] }}
        token={{ value: round(tokenAmount), symbol: bondedToken.symbol }}
      />
      <ButtonWrapper>
        <Button mode="strong" type="submit" disabled={isDisabledOrder()} wide>
          Place {isBuyOrder ? 'buy' : 'sell'} order
        </Button>
      </ButtonWrapper>
      <Info isBuyOrder={isBuyOrder} />
    </form>
  )
}

const ButtonWrapper = styled.div`
  padding-top: 10px;
`

const AmountField = styled.div`
  margin-bottom: 20px;
`

const InputsWrapper = styled.div`
  display: flex;
  flex-direction: column;
`

const TransferIconWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 10px;
`

const TransferIcon = () => (
  <TransferIconWrapper>
    <img
      src={transferArrows}
      css={`
        height: 16px;
      `}
    />
  </TransferIconWrapper>
)

const CombinedInput = styled.div`
  display: flex;
  input[type='text'] {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right: 0;
  }
  input[type='text'] + div > div:first-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
`

const StyledTextBlock = styled(Text.Block).attrs({
  color: theme.textSecondary,
  smallcaps: true,
})`
  ${unselectable()};
  display: flex;
`

const ValidationError = ({ message }) => (
  <ValidationErrorBlock>
    <IconCross />
    <Text size="small" style={{ marginLeft: '10px' }}>
      {message}
    </Text>
  </ValidationErrorBlock>
)

const ValidationErrorBlock = styled.p`
  margin-top: 15px;
`

export default Buy
