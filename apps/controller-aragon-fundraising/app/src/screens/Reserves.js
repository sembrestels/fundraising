import { Badge, Box, Button, DiscButton, SidePanel, Text, TextInput } from '@aragon/ui'
import React, { useState } from 'react'
import styled from 'styled-components'
import EditIcon from '../assets/EditIcon.svg'
import HoverNotification from '../components/HoverNotification/HoverNotification'

// TODO: handle edit monthly alocation validation

// In this copy we should display the user the percentage of max increase of the tap
const hoverTextNotifications = [
  'This will update the monthly allocation (tap rate) i.e. how much funds can be released within the bonding curve contract per 30-day period. Note: this value must be less than the max increase limit set inside the contract.',
  "You're essentially bonding collateral when buying tokens (increasing the supply), and burning collateral when selling tokens (decreasing the supply). These relationships are defined by the smart contract.",
]

const buttonStyle = `
  border: 1px solid rgba(223, 227, 232, 0.75);
  border-radius: 3px;
  box-shadow: 0px 1px 3px rgba(0, 0, 0, 0.1);
  color: #26324E;
  padding: .5rem 1rem;
  display: flex;
  width: min-content;
`

const bondedTokenStyle = `
  width: 25%;
  height: 100%;

  p {
    font-size: 16px;
    font-weight: 300;
    color: #637381;
  }

  .item {
    display: flex;
    justify-content: space-between;
  }

  @media only screen and (max-width: 1152px) {
    width: 50%;
  }

  @media only screen and (max-width: 768px) {
    width: 100%;
  }
`

const ContentWrapper = styled.div`
  display: flex;

  .bold {
    font-size: 16px;
    font-weight: 600;
    color: #26324e;
  }

  .title {
    margin-bottom: 1rem;
  }

  .settings {
    border: 1px solid #dde4e9;
    border-radius: 4px;
    background: #ffffff;
    margin-right: 1rem;
    padding: 2rem;
    width: 75%;
  }

  .settings-content {
    display: flex;

    > div {
      display: flex;
      flex-direction: column;
      width: 50%;
    }
  }

  @media only screen and (max-width: 1152px) {
    .settings {
      width: 50%;
    }
    .settings-content {
      flex-direction: column;
      > div {
        width: 100%;
      }
      > div:first-child {
        margin-bottom: 2rem;
      }
    }
  }

  @media only screen and (max-width: 768px) {
    flex-direction: column;

    .settings {
      width: 100%;
      margin-bottom: 1rem;
    }
  }
`

export default ({ bondedToken, reserve, polledData: { polledTotalSupply }, updateTappedToken }) => {
  const {
    tap: { allocation },
    maximumTapIncreasePct,
    collateralTokens,
  } = reserve
  const [monthlyAllocation, setMonthlyAllocation] = useState(allocation)
  const [opened, setOpened] = useState(false)
  console.log(bondedToken.symbol)
  const handleMonthlyChange = event => {
    setMonthlyAllocation(parseInt(event.target.value, 10))
  }
  const handleSubmit = event => {
    event.preventDefault()
    setOpened(false)
    updateTappedToken(monthlyAllocation)
  }

  return (
    <ContentWrapper>
      <div className="settings">
        <h1 className="title bold">Edit reserve settings</h1>
        <div className="settings-content">
          <div css="margin-right: 4rem;">
            <div css="display: flex; flex-direction: column; margin-bottom: 1rem;">
              {NotificationLabel('Monthly allocation', hoverTextNotifications[0])}
              <Text as="p" style={{ paddingRight: '12px' }}>
                10000 DAI
              </Text>
            </div>
            <Button css={buttonStyle} onClick={() => setOpened(true)}>
              <img src={EditIcon} />
              <p
                css={`
                  margin-top: 4px;
                  margin-left: 0.5rem;
                `}
              >
                Edit monthly allocation
              </p>
            </Button>
          </div>
          <div>
            {collateralTokens.map(({ symbol, ratio }, i) => {
              return (
                <div css="display: flex; flex-direction: column; margin-bottom: 1.5rem;" key={i}>
                  {NotificationLabel(`${symbol} collateralization ratio`, hoverTextNotifications[1])}
                  <Text>{ratio}%</Text>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <Box heading="Bonded Token" css={bondedTokenStyle}>
        <div className="item">
          <p>Total Supply</p>
          <p className="bold">210</p>
        </div>

        <div className="item">
          <p>Token</p>
          <Badge css="height: 100%;" foreground="#4D22DF" background="rgba(204, 189, 244, 0.16)">
            {bondedToken.name}
          </Badge>
        </div>
      </Box>
      <SidePanel opened={opened} onClose={() => setOpened(false)} title="Monthly allocation">
        <div css="margin: 0 -30px 24px; border: 1px solid #DFE3E8;" />
        <form onSubmit={handleSubmit}>
          <Text as="p">You can increase the tap by maximum {maximumTapIncreasePct * 100}%.</Text>
          <Text as="p">Current monthly allocation: 10000 DAI</Text>
          <Wrapper>
            <TextInput
              adornment={
                <Text as="p" style={{ paddingRight: '12px' }}>
                  DAI
                </Text>
              }
              adornmentPosition={'end'}
              value={10000}
              onChange={handleMonthlyChange}
              required
            />
          </Wrapper>
          <Wrapper>
            <Button mode="strong" type="submit">
              Save
            </Button>
          </Wrapper>
        </form>
      </SidePanel>
    </ContentWrapper>
  )
}

const Wrapper = styled.div`
  padding-top: 10px;
`

const NotificationLabel = (label, hoverText) => (
  <Text css="margin-bottom: 0.5rem;">
    {label}
    <HoverNotification copy={hoverText}>
      <DiscButton size={24} description="Help" css="margin-left: 1rem;">
        <span
          css={`
            font-size: 12px;
          `}
        >
          ?
        </span>
      </DiscButton>
    </HoverNotification>
  </Text>
)
